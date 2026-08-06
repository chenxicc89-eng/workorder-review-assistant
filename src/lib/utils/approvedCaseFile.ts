import type { ApprovedCaseInput } from "../types";

export interface ApprovedCasePreview {
  rowNo: number;
  value: ApprovedCaseInput;
  errors: string[];
}

const ALIASES = {
  orderNo: ["工单编号", "工单号", "编号", "orderno"],
  orderType: ["工单类型", "诉求类型", "类型", "ordertype"],
  citizenAppeal: ["工单内容", "市民诉求", "诉求内容", "citizenappeal"],
  replyContent: ["工单回复内容", "回单内容", "回复内容", "replycontent"],
  evaluationReport: [
    "不计入考核评价报告",
    "不计入考核报告",
    "不计入评价报告",
    "不计入考核说明",
    "evaluationreport",
  ],
  unit: ["承办单位", "责任单位", "单位", "unit"],
} as const;

function norm(v: unknown): string {
  return String(v ?? "").replace(/[\s_\-—:：()（）【】]/g, "").toLowerCase();
}

function valueFor(row: Record<string, unknown>, aliases: readonly string[]): string {
  const keys = Object.keys(row);
  const hit = keys.find((key) => aliases.some((alias) => norm(key) === norm(alias)));
  return hit ? String(row[hit] ?? "").trim() : "";
}

export async function parseApprovedCaseWorkbook(file: File): Promise<ApprovedCasePreview[]> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("仅支持 .xlsx 或 .xls 文件");
  const XLSX: any = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const previews: ApprovedCasePreview[] = [];
  const seen = new Set<string>();
  let absoluteRow = 1;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    for (const raw of rows as Record<string, unknown>[]) {
      absoluteRow += 1;
      const value: ApprovedCaseInput = {
        orderNo: valueFor(raw, ALIASES.orderNo),
        orderType: valueFor(raw, ALIASES.orderType),
        citizenAppeal: valueFor(raw, ALIASES.citizenAppeal),
        replyContent: valueFor(raw, ALIASES.replyContent),
        evaluationReport: valueFor(raw, ALIASES.evaluationReport) || undefined,
        unit: valueFor(raw, ALIASES.unit) || undefined,
      };
      if (!Object.values(value).some(Boolean)) continue;
      const errors: string[] = [];
      if (!value.orderNo) errors.push("缺少工单编号");
      if (!value.orderType) errors.push("缺少工单类型");
      if (!value.citizenAppeal) errors.push("缺少工单内容");
      if (!value.replyContent) errors.push("缺少回单内容");
      if (value.orderNo && seen.has(value.orderNo)) errors.push("工单编号重复");
      if (value.orderNo) seen.add(value.orderNo);
      previews.push({ rowNo: absoluteRow, value, errors });
    }
  }
  if (!previews.length) throw new Error("未读取到数据，请检查表头和工作表内容");
  return previews;
}

export async function downloadApprovedCaseTemplate(): Promise<void> {
  const XLSX: any = await import("xlsx");
  const rows = [
    ["工单编号", "工单类型", "工单内容", "工单回复内容", "不计入考核评价报告", "承办单位"],
    ["示例-001", "频繁停电", "市民反映的问题", "已审核通过的完整回单内容", "", "示例单位"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 36 }, { wch: 50 }, { wch: 40 }, { wch: 22 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "已通过工单");
  XLSX.writeFile(workbook, "已通过工单导入模板.xlsx");
}
