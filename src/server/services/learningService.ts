import { prisma } from "../db";
import { getProvider } from "../../lib/ai/providers";
import type { CorrectionExample } from "../../lib/ai/providers";
import type {
  LearnedRuleRecord,
  LearnedRuleKind,
  LearnedRuleStatus,
  LearnedRuleSource,
  LearnedCandidateType,
  RiskLevel,
  RuleStandard,
} from "../../lib/types";
import { listCases } from "./caseService";
import { getActiveStandard, listStandards, upsertStandard } from "./standardService";
import { listApprovedCases } from "./approvedCaseService";
import { textSimilarity } from "../../lib/utils/lexicalSimilarity";

// ==========================================================================
// 学习中心服务(Tier3:反馈 → 常驻规则)
// --------------------------------------------------------------------------
// generateCandidates: 取该类型的人工纠错语料 → provider.distill 蒸馏 → 对已存在的
//   pending/adopted 去重 → 落库为 pending 候选。这是唯一发生蒸馏 LLM 调用的地方,
//   由「学习中心」页手动触发,不在审核热路径上。
// listRules:      列出候选 / 已采纳规则(按类型 / 状态过滤)。
// adopt:          人工采纳 —— 置 adopted,并把规则正文投影进对应规范的
//                 contentJson.learnedRules / learnedExemptions(唯一写入生效规范的入口)。
// reject:         人工驳回 —— 置 rejected;若此前已采纳,则同时从规范里剔除。
//
// 与审核链路的隔离:审核只读规范(getActiveStandard),从不查 LearnedRule 表,
// 故本服务任何失败都不影响审核延迟或可用性。
// ==========================================================================

export class LearningError extends Error {}

type LearnedRuleRow = {
  id: string;
  orderType: string;
  kind: string;
  text: string;
  rationale: string;
  status: string;
  riskLevel: string | null;
  confidence: number | null;
  supportingCaseIds: string;
  sourceBatchId: string;
  createdAt: Date;
  updatedAt: Date;
  adoptedAt: Date | null;
  sourceType: string;
  candidateType: string;
  conflictStatus: string;
  conflictDetail: string | null;
};

function safeParseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function rowToRecord(row: LearnedRuleRow): LearnedRuleRecord {
  return {
    id: row.id,
    orderType: row.orderType,
    kind: row.kind as LearnedRuleKind,
    text: row.text,
    rationale: row.rationale,
    status: row.status as LearnedRuleStatus,
    riskLevel: (row.riskLevel as RiskLevel | null) ?? undefined,
    confidence: row.confidence ?? 0,
    supportingCaseIds: safeParseIds(row.supportingCaseIds),
    sourceBatchId: row.sourceBatchId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adoptedAt: row.adoptedAt ? row.adoptedAt.toISOString() : null,
    sourceType: row.sourceType as LearnedRuleSource,
    candidateType: row.candidateType as LearnedCandidateType,
    conflictStatus: row.conflictStatus as LearnedRuleRecord["conflictStatus"],
    conflictDetail: row.conflictDetail,
  };
}

const CORRECTION_SNIPPET_LEN = 200;
function snippet(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t.length > CORRECTION_SNIPPET_LEN ? t.slice(0, CORRECTION_SNIPPET_LEN) + "…" : t;
}

/** 去重指纹:同一条规则正文归一化后视为等价 */
function normText(t: string): string {
  return t.replace(/[\s「」【】()()"""''`、,,。.:：;;!!??~—\-_/\\]/g, "").toLowerCase();
}

function standardEntries(standard: RuleStandard): { field: string; text: string }[] {
  return [
    ...standard.requiredItems.map((text) => ({ field: "必备要素", text })),
    ...standard.standardRequirements.map((text) => ({ field: "规范要求", text })),
    ...standard.highRiskIssues.map((text) => ({ field: "高风险问题", text })),
    ...standard.mediumRiskIssues.map((text) => ({ field: "中风险问题", text })),
    ...standard.lowRiskIssues.map((text) => ({ field: "低风险问题", text })),
    ...(standard.learnedRules ?? []).map((text) => ({ field: "加强准则", text })),
    ...(standard.learnedExemptions ?? []).map((text) => ({ field: "豁免准则", text })),
    ...(standard.examples?.good ?? []).map((text) => ({ field: "标准正例", text })),
  ];
}

function semanticCore(text: string): string {
  return text.replace(/不应|不得|无需|不必|不予|必须|应当|应|可予|可以/g, "");
}

function detectConflict(
  candidate: { text: string; candidateType: LearnedCandidateType },
  standard: RuleStandard
): { status: "none" | "duplicate" | "conflict"; detail?: string } {
  const entries = standardEntries(standard);
  let best: { field: string; text: string; score: number } | undefined;
  for (const entry of entries) {
    const score = Math.max(
      textSimilarity(candidate.text, entry.text),
      textSimilarity(semanticCore(candidate.text), semanticCore(entry.text))
    );
    if (!best || score > best.score) best = { ...entry, score };
  }
  if (!best) return { status: "none" };
  if (best.score >= 0.72) {
    return { status: "duplicate", detail: `与现有${best.field}高度相似：${best.text}` };
  }
  const isExemption = candidate.candidateType === "exemption";
  const oppositeField = isExemption
    ? !best.field.includes("豁免") && best.field !== "标准正例"
    : best.field.includes("豁免");
  if (oppositeField && best.score >= 0.38) {
    return { status: "conflict", detail: `可能与现有${best.field}冲突：${best.text}` };
  }
  return { status: "none" };
}

/**
 * 生成候选准则:蒸馏该类型的人工纠错为 pending 候选。
 * 蒸馏 LLM(或 mock)调用在此发生 —— 手动触发、离线,不影响审核延迟。
 */
export async function generateCandidates(orderType: string): Promise<LearnedRuleRecord[]> {
  if (!orderType?.trim()) throw new LearningError("工单类型不能为空");

  // 1. 分别读取人工纠错与已通过正向样本，两类证据不会混写进同一个 prompt。
  const cases = await listCases({ orderType });
  const qualified = cases.filter((c) => c.humanEdited || c.isFalsePositive);
  const approved = await listApprovedCases(orderType);
  if (qualified.length === 0 && approved.length < 1) {
    throw new LearningError("该类型暂无学习资料：请先导入已通过工单，或保存一条人工纠错记录。");
  }

  const feedback: CorrectionExample[] = qualified.map((c) => ({
    caseId: c.id,
    citizenAppeal: snippet(c.citizenAppeal),
    replyContent: snippet(c.replyContent),
    aiConclusion: c.conclusion,
    aiRiskLevel: c.riskLevel,
    finalOpinion: c.humanEdited ? c.finalOpinion?.trim() || undefined : undefined,
    isFalsePositive: c.isFalsePositive,
    falsePositiveNote: c.falsePositiveNote?.trim() || undefined,
  }));

  // 2. 分源蒸馏(经 getProvider 走真实/mock)
  const standard = await getActiveStandard(orderType);
  const provider = await getProvider();
  const correctionCandidates = feedback.length
    ? await provider.distill({ orderType, feedback, existingStandard: standard })
    : [];
  const approvedCandidates = approved.length >= 1
    ? await provider.distillApproved({
        orderType,
        existingStandard: standard,
        examples: approved.map((c) => ({
          caseId: c.id,
          orderNo: c.orderNo,
          citizenAppeal: snippet(c.citizenAppeal),
          replyContent: snippet(c.replyContent),
          evaluationReport: c.evaluationReport ? snippet(c.evaluationReport) : undefined,
        })),
      })
    : [];
  const candidates = [
    ...correctionCandidates.map((c) => ({
      ...c,
      sourceType: "correction" as const,
      candidateType: (c.kind === "exempt" ? "exemption" : "reinforce") as LearnedCandidateType,
    })),
    ...approvedCandidates.map((c) => ({
      ...c,
      sourceType: "approved_case" as const,
      candidateType: c.candidateType as LearnedCandidateType,
    })),
  ];

  // 3. 对该类型已存在的 pending/adopted 去重(避免重复点击堆积)
  const existing = (await prisma.learnedRule.findMany({
    where: { orderType, status: { in: ["pending", "adopted"] } },
  })) as LearnedRuleRow[];
  const existingKeys = new Set(existing.map((r) => `${r.candidateType}|${normText(r.text)}`));

  const fresh = candidates.filter(
    (c) => !existingKeys.has(`${c.candidateType}|${normText(c.text)}`)
  );
  if (fresh.length === 0) return [];

  // 4. 落库为 pending(同一次生成共享 sourceBatchId)
  // 不用 Date.now()(serverless resume 安全 + 本环境限制);用已存在候选数+随机 cuid 组合。
  const sourceBatchId = `batch-${orderType}-${existing.length}-${fresh.length}`;
  const created = await prisma.$transaction(
    fresh.map((c, index) => {
      let conflict = detectConflict(c, standard);
      if (conflict.status === "none") {
        const nearExisting = existing.find(
          (row) => row.candidateType === c.candidateType && textSimilarity(row.text, c.text) >= 0.72
        );
        const nearFresh = fresh.slice(0, index).find(
          (row) => row.candidateType === c.candidateType && textSimilarity(row.text, c.text) >= 0.72
        );
        const near = nearExisting?.text || nearFresh?.text;
        if (near) conflict = { status: "duplicate", detail: `与已有候选高度相似：${near}` };
      }
      return prisma.learnedRule.create({
        data: {
          orderType,
          kind: c.kind,
          text: c.text,
          rationale: c.rationale,
          status: "pending",
          riskLevel: c.riskLevel ?? null,
          confidence: c.confidence ?? null,
          supportingCaseIds: JSON.stringify(c.supportingCaseIds ?? []),
          sourceBatchId,
          sourceType: c.sourceType,
          candidateType: c.candidateType,
          conflictStatus: conflict.status,
          conflictDetail: conflict.detail ?? null,
        },
      });
    })
  );
  return (created as LearnedRuleRow[]).map(rowToRecord);
}

/** 列出全部有学习资料的工单类型，供前端逐类发起生成，避免单请求超时。 */
export async function listLearningSourceTypes(): Promise<string[]> {
  const [approvedTypes, correctionTypes] = await Promise.all([
    prisma.approvedCase.findMany({ distinct: ["orderType"], select: { orderType: true } }),
    prisma.workOrderCase.findMany({
      where: { OR: [{ humanEdited: true }, { isFalsePositive: true }] },
      distinct: ["orderType"],
      select: { orderType: true },
    }),
  ]);
  const types = Array.from(
    new Set([...approvedTypes, ...correctionTypes].map((row) => row.orderType).filter(Boolean))
  );
  return types;
}

/** 列出学习规则(可按类型 / 状态过滤) */
export async function listRules(query: {
  orderType?: string;
  status?: LearnedRuleStatus;
}): Promise<LearnedRuleRecord[]> {
  const rows = (await prisma.learnedRule.findMany({
    where: {
      ...(query.orderType ? { orderType: query.orderType } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  })) as LearnedRuleRow[];
  return rows.map(rowToRecord);
}

/** 取某类型当前生效规范(带上其 id,便于 upsert 回写同一条) */
async function activeStandardWithId(orderType: string): Promise<{
  id?: string;
  name: string;
  standard: RuleStandard;
}> {
  // listStandards 会在库空时回退内置默认(id 为内置稳定串)。取该类型 enabled 的那条。
  const rows = await listStandards(orderType);
  const enabled = rows.find((r) => r.enabled) ?? rows[0];
  const standard = enabled?.standard ?? (await getActiveStandard(orderType));
  return {
    // 内置默认的 id(std-*)不是库记录,upsert 时应新建而非按 id 更新 → 视为无 id
    id: enabled && !enabled.id.startsWith("std-") ? enabled.id : undefined,
    name: enabled?.name ?? standard.name,
    standard,
  };
}

/** 把一条规则正文投影进规范的 learnedRules/learnedExemptions(采纳),或移除(驳回/撤回) */
async function projectIntoStandard(
  orderType: string,
  kind: LearnedRuleKind,
  text: string,
  op: "add" | "remove",
  candidateType: LearnedCandidateType = kind === "exempt" ? "exemption" : "reinforce"
): Promise<void> {
  const { id, name, standard } = await activeStandardWithId(orderType);
  const field = candidateType === "required_item"
    ? "requiredItems"
    : candidateType === "requirement"
      ? "standardRequirements"
      : candidateType === "good_example"
        ? "goodExamples"
        : candidateType === "exemption"
          ? "learnedExemptions"
          : "learnedRules";
  const current = field === "goodExamples" ? (standard.examples?.good ?? []) : (standard[field] ?? []);
  let next: string[];
  if (op === "add") {
    if (current.includes(text)) return; // 幂等:已在则不重复
    next = [...current, text];
  } else {
    if (!current.includes(text)) return; // 幂等:不在则无需移除
    next = current.filter((t) => t !== text);
  }
  const nextStandard: RuleStandard = field === "goodExamples"
    ? { ...standard, examples: { ...standard.examples, good: next } }
    : { ...standard, [field]: next };
  await upsertStandard({
    id,
    orderType,
    name,
    standard: nextStandard,
    enabled: true,
    source: "learning",
    note: `${op === "add" ? "采纳" : "撤回"}学习候选`,
  });
}

/** 采纳:置 adopted,并把规则正文写入生效规范(唯一写入入口,必须人工触发) */
export async function adoptRule(id: string): Promise<LearnedRuleRecord> {
  const rule = (await prisma.learnedRule.findUnique({ where: { id } })) as LearnedRuleRow | null;
  if (!rule) throw new LearningError("规则不存在");
  if (rule.status === "adopted") return rowToRecord(rule); // 幂等
  if (rule.conflictStatus !== "none") {
    throw new LearningError(rule.conflictDetail || "该候选存在重复或冲突，请先人工修改规范后重新提炼");
  }

  await projectIntoStandard(
    rule.orderType,
    rule.kind as LearnedRuleKind,
    rule.text,
    "add",
    rule.candidateType as LearnedCandidateType
  );
  const updated = (await prisma.learnedRule.update({
    where: { id },
    data: { status: "adopted", adoptedAt: new Date() },
  })) as LearnedRuleRow;
  return rowToRecord(updated);
}

/** 驳回/撤回:置 rejected;若此前已采纳,则同时从规范里剔除 */
export async function rejectRule(id: string): Promise<LearnedRuleRecord> {
  const rule = (await prisma.learnedRule.findUnique({ where: { id } })) as LearnedRuleRow | null;
  if (!rule) throw new LearningError("规则不存在");

  if (rule.status === "adopted") {
    await projectIntoStandard(
      rule.orderType,
      rule.kind as LearnedRuleKind,
      rule.text,
      "remove",
      rule.candidateType as LearnedCandidateType
    );
  }
  const updated = (await prisma.learnedRule.update({
    where: { id },
    data: { status: "rejected", adoptedAt: null },
  })) as LearnedRuleRow;
  return rowToRecord(updated);
}

export interface BulkRuleResult {
  updated: LearnedRuleRecord[];
  errors: { id: string; message: string }[];
}

async function runBulkRuleAction(
  ids: string[],
  action: (id: string) => Promise<LearnedRuleRecord>
): Promise<BulkRuleResult> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  const updated: LearnedRuleRecord[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const id of uniqueIds) {
    try {
      updated.push(await action(id));
    } catch (err) {
      errors.push({ id, message: (err as Error).message || "操作失败" });
    }
  }
  return { updated, errors };
}

export function bulkAdoptRules(ids: string[]): Promise<BulkRuleResult> {
  return runBulkRuleAction(ids, adoptRule);
}

export function bulkRejectRules(ids: string[]): Promise<BulkRuleResult> {
  return runBulkRuleAction(ids, rejectRule);
}
