import { prisma } from "../db";
import { getProvider } from "../../lib/ai/providers";
import type { CorrectionExample } from "../../lib/ai/providers";
import type {
  LearnedRuleRecord,
  LearnedRuleKind,
  LearnedRuleStatus,
  RiskLevel,
  RuleStandard,
} from "../../lib/types";
import { listCases } from "./caseService";
import { getActiveStandard, listStandards, upsertStandard } from "./standardService";

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

/**
 * 生成候选准则:蒸馏该类型的人工纠错为 pending 候选。
 * 蒸馏 LLM(或 mock)调用在此发生 —— 手动触发、离线,不影响审核延迟。
 */
export async function generateCandidates(orderType: string): Promise<LearnedRuleRecord[]> {
  if (!orderType?.trim()) throw new LearningError("工单类型不能为空");

  // 1. 取该类型人工纠错语料(与 loadCorrections 同款过滤:humanEdited || isFalsePositive)
  const cases = await listCases({ orderType });
  const qualified = cases.filter((c) => c.humanEdited || c.isFalsePositive);
  if (qualified.length === 0) {
    throw new LearningError("该类型暂无人工纠错记录,先在审核/历史案例页标记误判或修改意见后再生成。");
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

  // 2. 蒸馏(经 getProvider 走真实/mock)
  const standard = await getActiveStandard(orderType);
  const provider = await getProvider();
  const candidates = await provider.distill({ orderType, feedback, existingStandard: standard });

  // 3. 对该类型已存在的 pending/adopted 去重(避免重复点击堆积)
  const existing = (await prisma.learnedRule.findMany({
    where: { orderType, status: { in: ["pending", "adopted"] } },
  })) as LearnedRuleRow[];
  const existingKeys = new Set(existing.map((r) => `${r.kind}|${normText(r.text)}`));

  const fresh = candidates.filter((c) => !existingKeys.has(`${c.kind}|${normText(c.text)}`));
  if (fresh.length === 0) return [];

  // 4. 落库为 pending(同一次生成共享 sourceBatchId)
  // 不用 Date.now()(serverless resume 安全 + 本环境限制);用已存在候选数+随机 cuid 组合。
  const sourceBatchId = `batch-${orderType}-${existing.length}-${fresh.length}`;
  const created = await prisma.$transaction(
    fresh.map((c) =>
      prisma.learnedRule.create({
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
        },
      })
    )
  );
  return (created as LearnedRuleRow[]).map(rowToRecord);
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
  op: "add" | "remove"
): Promise<void> {
  const { id, name, standard } = await activeStandardWithId(orderType);
  const field: "learnedRules" | "learnedExemptions" =
    kind === "reinforce" ? "learnedRules" : "learnedExemptions";
  const current = standard[field] ?? [];
  let next: string[];
  if (op === "add") {
    if (current.includes(text)) return; // 幂等:已在则不重复
    next = [...current, text];
  } else {
    if (!current.includes(text)) return; // 幂等:不在则无需移除
    next = current.filter((t) => t !== text);
  }
  const nextStandard: RuleStandard = { ...standard, [field]: next };
  await upsertStandard({ id, orderType, name, standard: nextStandard, enabled: true });
}

/** 采纳:置 adopted,并把规则正文写入生效规范(唯一写入入口,必须人工触发) */
export async function adoptRule(id: string): Promise<LearnedRuleRecord> {
  const rule = (await prisma.learnedRule.findUnique({ where: { id } })) as LearnedRuleRow | null;
  if (!rule) throw new LearningError("规则不存在");
  if (rule.status === "adopted") return rowToRecord(rule); // 幂等

  await projectIntoStandard(rule.orderType, rule.kind as LearnedRuleKind, rule.text, "add");
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
    await projectIntoStandard(rule.orderType, rule.kind as LearnedRuleKind, rule.text, "remove");
  }
  const updated = (await prisma.learnedRule.update({
    where: { id },
    data: { status: "rejected", adoptedAt: null },
  })) as LearnedRuleRow;
  return rowToRecord(updated);
}
