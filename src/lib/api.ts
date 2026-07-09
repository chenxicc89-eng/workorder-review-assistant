import type {
  CaseQuery,
  OcrExtractResult,
  PatchCasePayload,
  ReviewResult,
  RuleStandard,
  SaveCasePayload,
  WorkOrderCaseRecord,
  WorkOrderInput,
} from "./types";

// ==========================================================================
// 前端 API 封装 —— 统一 fetch /api/*,并抛出可读错误
// ==========================================================================

/** 带 degradedNote 的审核结果 */
export interface ReviewResponse extends ReviewResult {
  degradedNote?: string;
}

/** 规范库列表项(与后端 StandardRow 对应) */
export interface StandardListItem {
  id: string;
  orderType: string;
  name: string;
  enabled: boolean;
  standard: RuleStandard;
  createdAt: string;
  updatedAt: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    let msg = `请求失败 (${resp.status})`;
    try {
      const body = await resp.json();
      msg = body.error || body.message || msg;
      if (Array.isArray(body.details) && body.details.length) {
        msg += ":" + body.details.map((d: any) => d.message ?? d).join("、");
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ---- review ----
export function reviewWorkOrder(input: WorkOrderInput): Promise<ReviewResponse> {
  return request<ReviewResponse>("/api/review", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---- cases ----
export function saveCase(payload: SaveCasePayload): Promise<WorkOrderCaseRecord> {
  return request<WorkOrderCaseRecord>("/api/cases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listCases(query: CaseQuery = {}): Promise<WorkOrderCaseRecord[]> {
  const params = new URLSearchParams();
  if (query.orderType) params.set("orderType", query.orderType);
  if (query.riskLevel) params.set("riskLevel", query.riskLevel);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (typeof query.isFalsePositive === "boolean")
    params.set("isFalsePositive", String(query.isFalsePositive));
  const qs = params.toString();
  return request<WorkOrderCaseRecord[]>(`/api/cases${qs ? `?${qs}` : ""}`);
}

export function getCase(id: string): Promise<WorkOrderCaseRecord> {
  return request<WorkOrderCaseRecord>(`/api/cases/${id}`);
}

export function patchCase(id: string, patch: PatchCasePayload): Promise<WorkOrderCaseRecord> {
  return request<WorkOrderCaseRecord>(`/api/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ---- standards ----
export function listStandards(orderType?: string): Promise<StandardListItem[]> {
  const qs = orderType ? `?orderType=${encodeURIComponent(orderType)}` : "";
  return request<StandardListItem[]>(`/api/standards${qs}`);
}

export interface UpsertStandardPayload {
  id?: string;
  orderType: string;
  name: string;
  standard: RuleStandard;
  enabled?: boolean;
}

export function upsertStandard(payload: UpsertStandardPayload): Promise<StandardListItem> {
  return request<StandardListItem>("/api/standards", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function toggleStandard(id: string, enabled: boolean): Promise<StandardListItem> {
  return request<StandardListItem>(`/api/standards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function deleteStandard(id: string): Promise<void> {
  return request<void>(`/api/standards/${id}`, { method: "DELETE" });
}

// ---- ocr ----
/** 图片 OCR + 工单字段抽取。images 为 base64 data URL 数组。 */
export function extractFromImages(images: string[]): Promise<OcrExtractResult> {
  return request<OcrExtractResult>("/api/ocr/extract", {
    method: "POST",
    body: JSON.stringify({ images }),
  });
}

/** Word/Excel 解析出的纯文本 → 工单字段抽取(走文本模型)。 */
export function extractFromText(text: string): Promise<OcrExtractResult> {
  return request<OcrExtractResult>("/api/ocr/extract-text", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ---- health ----
export interface HealthInfo {
  ok: boolean;
  aiMode: "real" | "mock";
  provider: string;
  model: string;
  visionModel?: string;
  supportsVision?: boolean;
}
export function getHealth(): Promise<HealthInfo> {
  return request<HealthInfo>("/api/health");
}
