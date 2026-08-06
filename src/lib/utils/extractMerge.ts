import type { OcrExtractResult } from "@/lib/types";

// ==========================================================================
// 合并多路识别结果(图片走视觉、Office 走文本)为一条 OcrExtractResult。
// 纯函数,前端用。
//   - 文本字段(citizenAppeal/replyContent/evaluationReport/rawText):按顺序拼接非空片段;
//   - 标量字段(orderType/orderNo/unit/attachmentNote):取先出现的非空值;
//   - confidence:取较低值(更保守);
//   - notes:合并去重。
// ==========================================================================

function joinNonEmpty(parts: (string | undefined)[], sep = "\n\n"): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(sep);
}

function firstNonEmpty(parts: (string | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).find(Boolean) ?? "";
}

/** 合并若干识别结果(至少一个)。仅一个时原样返回。 */
export function mergeExtractResults(results: OcrExtractResult[]): OcrExtractResult {
  const list = results.filter(Boolean);
  if (list.length === 0) {
    throw new Error("没有可合并的识别结果");
  }
  if (list.length === 1) return list[0];

  return {
    orderType: firstNonEmpty(list.map((r) => r.orderType)),
    orderNo: firstNonEmpty(list.map((r) => r.orderNo)),
    citizenAppeal: joinNonEmpty(list.map((r) => r.citizenAppeal)),
    replyContent: joinNonEmpty(list.map((r) => r.replyContent)),
    evaluationReport: joinNonEmpty(list.map((r) => r.evaluationReport)),
    unit: firstNonEmpty(list.map((r) => r.unit)),
    attachmentNote: joinNonEmpty(list.map((r) => r.attachmentNote)),
    rawText: joinNonEmpty(list.map((r) => r.rawText)),
    confidence: Math.min(...list.map((r) => (typeof r.confidence === "number" ? r.confidence : 0.6))),
    notes: Array.from(new Set(list.map((r) => (r.notes ?? "").trim()).filter(Boolean))).join(" "),
  };
}
