import type { ApprovedCaseInput, OcrExtractResult } from "../types";
import { extractFromImages, extractFromText } from "../api";
import { filesToImages } from "./imageFile";
import { isOfficeDoc, isSpreadsheet, officeFilesToText } from "./docFile";
import { mergeExtractResults } from "./extractMerge";

export type MaterialKind = "appeal" | "reply" | "report" | "combined";

export interface MaterialPairPreview {
  key: string;
  files: string[];
  value: ApprovedCaseInput;
  errors: string[];
}

interface RecognizedMaterial {
  kind: MaterialKind;
  raw: string;
  result?: OcrExtractResult;
  sourceLabel?: string;
}

const SHEET_ALIASES = {
  orderNo: ["12345工单编号", "工单编号", "工单号", "编号"],
  orderType: ["业务类型", "工单类型", "诉求类型", "类型"],
  citizenAppeal: ["受理内容", "工单内容", "市民诉求", "诉求内容"],
  replyContent: ["处理情况", "工单回复内容", "回单内容", "回复内容", "办理结果"],
  evaluationReport: ["不计入考核评价报告", "不计入评价报告", "不计入考核报告"],
  unit: ["名称", "承办单位", "责任单位", "单位"],
} as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "").replace(/[\s_\-—:：()（）【】]/g, "").toLowerCase();
}

function sheetValue(row: Record<string, unknown>, aliases: readonly string[]): string {
  const key = Object.keys(row).find((candidate) =>
    aliases.some((alias) => normalizeHeader(candidate) === normalizeHeader(alias))
  );
  return key ? String(row[key] ?? "").trim() : "";
}

/**
 * 大型 Excel 台账无需整体发送给 AI：按表头逐行转成工单材料。
 * 这既避开模型上下文限制，也能让一份台账中的多条工单分别与附件配对。
 * 若不是可识别的工单台账，返回空数组，由原来的通用文本抽取流程兜底。
 */
async function spreadsheetMaterials(file: File): Promise<RecognizedMaterial[]> {
  const XLSX: any = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const materials: RecognizedMaterial[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<
      string,
      unknown
    >[];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const orderNo = sheetValue(row, SHEET_ALIASES.orderNo);
      const citizenAppeal = sheetValue(row, SHEET_ALIASES.citizenAppeal);
      const replyContent = sheetValue(row, SHEET_ALIASES.replyContent);
      if (!orderNo && !citizenAppeal && !replyContent) continue;

      const evaluationReport = sheetValue(row, SHEET_ALIASES.evaluationReport);
      const result: OcrExtractResult = {
        orderNo,
        orderType: sheetValue(row, SHEET_ALIASES.orderType),
        citizenAppeal,
        replyContent,
        evaluationReport: evaluationReport || undefined,
        unit: sheetValue(row, SHEET_ALIASES.unit) || undefined,
        rawText: [citizenAppeal, replyContent, evaluationReport].filter(Boolean).join("\n\n"),
        confidence: 1,
        notes: `已从 Excel「${sheetName}」第 ${index + 2} 行按表头直接读取。`,
      };
      materials.push({
        kind: "combined",
        raw: result.rawText,
        result,
        sourceLabel: `${file.name}（${sheetName} 第${index + 2}行）`,
      });
    }
  }
  return materials;
}

function classify(name: string): MaterialKind {
  const n = name.toLowerCase();
  if (/不计入|评价报告|考核报告|豁免/.test(n)) return "report";
  if (/回单|回复|答复|办理结果/.test(n)) return "reply";
  if (/工单内容|市民诉求|诉求内容|主表/.test(n)) return "appeal";
  return "combined";
}

/** 文件名无法判断时，根据 OCR 正文识别资料性质。报告判断优先级最高。 */
export function classifyMaterialContent(
  raw: string,
  result?: OcrExtractResult
): MaterialKind {
  const content = [
    raw,
    result?.rawText,
    result?.citizenAppeal,
    result?.replyContent,
    result?.attachmentNote,
  ].filter(Boolean).join("\n");
  if (
    /案件?不计入(?:考核)?评价|不计入(?:考核)?评价的?情况说明|不予评价|不纳入评价|申请.{0,20}不计入(?:考核)?评价|不计入评价事项清单/i.test(content)
  ) {
    return "report";
  }
  const hasAppeal = Boolean(result?.citizenAppeal?.trim());
  const hasReply = Boolean(result?.replyContent?.trim());
  if (hasAppeal && hasReply) return "combined";
  if (hasAppeal) return "appeal";
  if (hasReply) return "reply";
  return "combined";
}

function orderNoFrom(text: string): string {
  const patterns = [
    /(?:工单编号|工单号|受理编号|流水号)\s*[:：]?\s*([A-Za-z0-9\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5_\-/]{3,})/i,
    /(?:热线|工单)[-_][A-Za-z0-9_-]{4,}/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return "";
}

function filenameKey(name: string): string {
  return name
    .replace(/\.(docx|xlsx|xls|pdf|png|jpe?g|webp)$/i, "")
    .replace(/不计入考核评价报告|不计入考核报告|评价报告|考核报告|工单回复内容|工单内容|市民诉求|诉求内容|办理结果|回单|回复|答复|主表|附件/gi, "")
    .replace(/第\d+页/g, "")
    .replace(/[\s_\-—()（）【】]+/g, "")
    .trim();
}

async function recognizeFile(file: File): Promise<RecognizedMaterial[]> {
  const filenameKind = classify(file.name);
  if (isSpreadsheet(file)) {
    const rows = await spreadsheetMaterials(file);
    if (rows.length) return rows;
  }
  if (isOfficeDoc(file)) {
    const raw = await officeFilesToText([file]);
    if (filenameKind === "report") return [{ kind: filenameKind, raw }];
    const result = await extractFromText(raw);
    const kind = filenameKind === "combined"
      ? classifyMaterialContent(raw, result)
      : filenameKind;
    return [{ kind, raw, result }];
  }
  const images = await filesToImages([file]);
  const results = await Promise.all(images.map((image) => extractFromImages([image.dataUrl])));
  const result = mergeExtractResults(results);
  const raw = result.rawText || "";
  const kind = filenameKind === "combined"
    ? classifyMaterialContent(raw, result)
    : filenameKind;
  return [{ kind, raw, result }];
}

function validate(value: ApprovedCaseInput): string[] {
  const errors: string[] = [];
  if (!value.orderNo) errors.push("未识别工单编号");
  if (!value.orderType) errors.push("未识别工单类型");
  if (!value.citizenAppeal) errors.push("缺少工单内容");
  if (!value.replyContent) errors.push("缺少回单内容");
  return errors;
}

export async function recognizeAndPairMaterials(
  files: File[],
  onProgress?: (done: number, total: number, name: string) => void
): Promise<MaterialPairPreview[]> {
  const groups = new Map<string, MaterialPairPreview>();
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const recognizedItems = await recognizeFile(file);
    for (let itemIndex = 0; itemIndex < recognizedItems.length; itemIndex++) {
      const recognized = recognizedItems[itemIndex];
      const result = recognized.result;
      const detectedOrderNo = result?.orderNo || orderNoFrom(recognized.raw);
      const key = detectedOrderNo || filenameKey(file.name) || `未配对-${index + 1}-${itemIndex + 1}`;
      const group = groups.get(key) ?? {
        key,
        files: [],
        value: { orderNo: detectedOrderNo, orderType: "", citizenAppeal: "", replyContent: "" },
        errors: [],
      };
      const sourceLabel = recognized.sourceLabel || file.name;
      if (!group.files.includes(sourceLabel)) group.files.push(sourceLabel);
      group.value.orderNo ||= detectedOrderNo;
      // OCR 的“其他”通常是无法判断时的兜底，不直接视为已确认类型，交给用户选择/填写。
      const detectedOrderType = result?.orderType?.trim() || "";
      if (detectedOrderType && detectedOrderType !== "其他") {
        group.value.orderType ||= detectedOrderType;
      }
      group.value.unit ||= result?.unit || undefined;
      if (recognized.kind === "report") {
        group.value.evaluationReport = [group.value.evaluationReport, recognized.raw]
          .filter(Boolean).join("\n\n");
      } else if (recognized.kind === "appeal") {
        group.value.citizenAppeal = result?.citizenAppeal || recognized.raw;
      } else if (recognized.kind === "reply") {
        group.value.replyContent = result?.replyContent || recognized.raw;
      } else {
        group.value.citizenAppeal ||= result?.citizenAppeal || "";
        group.value.replyContent ||= result?.replyContent || "";
        group.value.evaluationReport ||= result?.evaluationReport || undefined;
      }
      groups.set(key, group);
    }
    onProgress?.(index + 1, files.length, file.name);
  }
  const output = Array.from(groups.values());
  const seen = new Set<string>();
  for (const item of output) {
    item.errors = validate(item.value);
    if (item.value.orderNo && seen.has(item.value.orderNo)) item.errors.push("工单编号重复");
    if (item.value.orderNo) seen.add(item.value.orderNo);
  }
  return output;
}
