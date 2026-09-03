import type {
  CaseQuery,
  LearnedRuleRecord,
  LearnedRuleStatus,
  OcrExtractResult,
  PatchCasePayload,
  ReviewResult,
  RuleStandard,
  SaveCasePayload,
  StandardExtractResult,
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

interface RequestOptions {
  /** 客户端超时(毫秒)。到时主动中止并抛可读错误,避免干等到平台 504。 */
  timeoutMs?: number;
  /** 超时时的提示文案 */
  timeoutMessage?: string;
}

async function request<T>(url: string, init?: RequestInit, opts?: RequestOptions): Promise<T> {
  const controller = opts?.timeoutMs ? new AbortController() : undefined;
  const timer =
    controller && opts?.timeoutMs
      ? setTimeout(() => controller.abort(), opts.timeoutMs)
      : undefined;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller?.signal,
      ...init,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(opts?.timeoutMessage || "请求超时,请重试");
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
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

/** 从模板文本抽取规范(预览,不写库)。抽取是 LLM 调用,可能较慢。 */
export function extractStandardsFromText(text: string): Promise<StandardExtractResult> {
  return request<StandardExtractResult>(
    "/api/standards/extract",
    { method: "POST", body: JSON.stringify({ text }) },
    {
      timeoutMs: 58_000,
      timeoutMessage: "模板识别超时(内容较多时抽取较慢),请精简模板或稍后重试。",
    }
  );
}

/** 确认写入:按工单类型覆盖导入一批规范 */
export function importStandards(standards: RuleStandard[]): Promise<StandardListItem[]> {
  return request<StandardListItem[]>("/api/standards/import", {
    method: "POST",
    body: JSON.stringify({ standards }),
  });
}

export function listStandardVersions(id: string): Promise<import("./types").StandardVersionRecord[]> {
  return request(`/api/standards/${id}/versions`);
}

export function rollbackStandardVersion(
  versionId: string
): Promise<StandardListItem> {
  return request(`/api/standards/versions/${versionId}/rollback`, { method: "POST" });
}

export function evaluateStandardVersions(id: string): Promise<import("./types").StandardEvaluation> {
  return request(
    `/api/standards/${id}/evaluate`,
    { method: "POST" },
    { timeoutMs: 58_000, timeoutMessage: "规范评估超时，请减少样本后重试。" }
  );
}

// ---- learning(学习中心 / Tier3)----
/** 生成候选准则(触发离线蒸馏,可能较慢) */
export function generateLearnedCandidates(orderType: string): Promise<LearnedRuleRecord[]> {
  return request<LearnedRuleRecord[]>(
    "/api/learning/candidates",
    { method: "POST", body: JSON.stringify({ orderType }) },
    {
      timeoutMs: 58_000,
      timeoutMessage: "生成候选超时(蒸馏耗时较长),请稍后重试或减少该类型的历史反馈量。",
    }
  );
}

export async function generateAllLearnedCandidates(): Promise<LearnedRuleRecord[]> {
  const types = await request<string[]>("/api/learning/source-types");
  if (types.length === 0) throw new Error("暂无可用于生成候选的学习资料");
  const created: LearnedRuleRecord[] = [];
  // 逐类型、逐请求执行，避免多个模型调用挤在一个 serverless 请求中超时。
  for (const type of types) created.push(...(await generateLearnedCandidates(type)));
  return created;
}

export function listLearnedRules(query: {
  orderType?: string;
  status?: LearnedRuleStatus;
} = {}): Promise<LearnedRuleRecord[]> {
  const params = new URLSearchParams();
  if (query.orderType) params.set("orderType", query.orderType);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return request<LearnedRuleRecord[]>(`/api/learning/rules${qs ? `?${qs}` : ""}`);
}

export function adoptLearnedRule(id: string): Promise<LearnedRuleRecord> {
  return request<LearnedRuleRecord>(`/api/learning/rules/${id}/adopt`, { method: "POST" });
}

export function rejectLearnedRule(id: string): Promise<LearnedRuleRecord> {
  return request<LearnedRuleRecord>(`/api/learning/rules/${id}/reject`, { method: "POST" });
}

export interface BulkLearnedRuleResult {
  updated: LearnedRuleRecord[];
  errors: { id: string; message: string }[];
}

export function bulkAdoptLearnedRules(ids: string[]): Promise<BulkLearnedRuleResult> {
  return request("/api/learning/rules/bulk-adopt", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function bulkRejectLearnedRules(ids: string[]): Promise<BulkLearnedRuleResult> {
  return request("/api/learning/rules/bulk-reject", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function importApprovedCases(payload: {
  name: string;
  fileName?: string;
  rows: import("./types").ApprovedCaseInput[];
}): Promise<{
  batch: import("./types").ImportBatchRecord;
  cases: import("./types").ApprovedCaseRecord[];
}> {
  return request("/api/learning/approved-cases/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listApprovedImportBatches(): Promise<import("./types").ImportBatchRecord[]> {
  return request("/api/learning/approved-cases/batches");
}

export function listApprovedOrderTypes(): Promise<string[]> {
  return request("/api/learning/approved-cases/order-types");
}

export function listApprovedCases(query: { orderType?: string; batchId?: string } = {}): Promise<
  import("./types").ApprovedCaseRecord[]
> {
  const params = new URLSearchParams();
  if (query.orderType) params.set("orderType", query.orderType);
  if (query.batchId) params.set("batchId", query.batchId);
  const qs = params.toString();
  return request(`/api/learning/approved-cases${qs ? `?${qs}` : ""}`);
}

export function deleteApprovedCase(id: string): Promise<void> {
  return request(`/api/learning/approved-cases/${id}`, { method: "DELETE" });
}

export function deleteApprovedImportBatch(id: string): Promise<void> {
  return request(`/api/learning/approved-cases/batches/${id}`, { method: "DELETE" });
}

export function updateApprovedCaseOrderType(
  id: string,
  orderType: string
): Promise<import("./types").ApprovedCaseRecord> {
  return request(`/api/learning/approved-cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ orderType }),
  });
}

export function bulkUpdateApprovedCaseOrderType(
  ids: string[],
  orderType: string
): Promise<{ updatedCount: number }> {
  return request("/api/learning/approved-cases/bulk-order-type", {
    method: "PATCH",
    body: JSON.stringify({ ids, orderType }),
  });
}

export function bulkDeleteApprovedCases(ids: string[]): Promise<{ deletedCount: number }> {
  return request("/api/learning/approved-cases/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

// ---- ocr ----
// 视觉模型推理慢,serverless 平台约 60s 超时;客户端设略短超时(58s)主动中止,
// 给出可读提示,而不是干等到平台返回含糊的 504。
const OCR_TIMEOUT_MS = 58_000;
const OCR_TIMEOUT_MSG = "识别超时(图片较复杂或网络较慢)。请换更清晰/更小的图片重试,或改用手动粘贴。";

/** 图片 OCR + 工单字段抽取。images 为 base64 data URL 数组。 */
export function extractFromImages(images: string[]): Promise<OcrExtractResult> {
  return request<OcrExtractResult>(
    "/api/ocr/extract",
    { method: "POST", body: JSON.stringify({ images }) },
    { timeoutMs: OCR_TIMEOUT_MS, timeoutMessage: OCR_TIMEOUT_MSG }
  );
}

/** Word/Excel 解析出的纯文本 → 工单字段抽取(走文本模型)。 */
export function extractFromText(text: string): Promise<OcrExtractResult> {
  return request<OcrExtractResult>(
    "/api/ocr/extract-text",
    { method: "POST", body: JSON.stringify({ text }) },
    { timeoutMs: OCR_TIMEOUT_MS, timeoutMessage: OCR_TIMEOUT_MSG }
  );
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
