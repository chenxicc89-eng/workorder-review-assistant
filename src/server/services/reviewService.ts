import type {
  ReviewResult,
  ReviewIssue,
  WorkOrderInput,
  WorkOrderCaseRecord,
  LearningRef,
  LearningContext,
} from "../../lib/types";
import { checkRules } from "../../lib/ruleEngine";
import { runFullReview } from "../../lib/ai/aiClient";
import type { CorrectionExample } from "../../lib/ai/providers";
import { mergeReview } from "../../lib/reviewMerger";
import { combinedSimilarity } from "../../lib/utils/lexicalSimilarity";
import { getActiveStandard } from "./standardService";
import { listCases } from "./caseService";

// ==========================================================================
// 审核服务:三段式编排(需求文档第六节)
// --------------------------------------------------------------------------
//   1. 校验输入
//   2. 按 orderType 查询规范(数据库无则回退内置默认)
//   3. 本地规则预检 checkRules
//   4. AI 主审核
//   5. AI 复核
//   6. 合并规则与 AI 结果
//   7. 返回最终 ReviewResult
// ==========================================================================

export class ReviewInputError extends Error {}

// 工单类型改为由图片识别自动填入,不再要求前端手动录入。
// 未提供类型时回退「其他」通用规范,故入参 orderType 可缺省,校验只强制诉求与回单正文。
type ReviewInput = Omit<WorkOrderInput, "orderType"> & { orderType?: string };

function validate(input: ReviewInput) {
  if (!input || typeof input !== "object") throw new ReviewInputError("请求体无效");
  if (!input.citizenAppeal?.trim()) throw new ReviewInputError("市民诉求不能为空");
  if (!input.replyContent?.trim()) throw new ReviewInputError("回单内容不能为空");
}

export interface ReviewServiceResult extends ReviewResult {
  /** 若发生降级(真实 AI 失败回退 mock),此处给出提示 */
  degradedNote?: string;
}

/** 诉求/回单摘要截断长度(仅截上下文;误判原因与人工意见是信号,不截断) */
const SNIPPET_LEN = 200;

/**
 * 历史纠错注入的字符预算(Tier 1)。
 * 取代过去"最多 4 条"的硬截断:不再静默丢弃反馈,而是在此预算内按优先级择优。
 * ~6000 字符(中文)约合 3~4k token,是给 few-shot 的软上限,防止 prompt 无界膨胀。
 * CJK/ASCII 混合时字符估算为近似,仅用于限制 prompt 大小,不影响判定正确性。
 */
const CORRECTION_CHAR_BUDGET = 6000;

function snippet(s: string): string {
  const t = (s || "").trim();
  return t.length > SNIPPET_LEN ? t.slice(0, SNIPPET_LEN) + "…" : t;
}

/**
 * 反馈优先级:数字越小越优先注入。
 * (0) 有明确误判原因的误判 —— 最强信号,直接告诉 AI 错在哪;
 * (1) 有人工最终意见的人工改 —— 给出用户认可的正确口径;
 * (2) 无原因的误判 —— 仍是"别再这么报"的信号,但缺解释;
 * (3) 其余(仅 humanEdited 但无 finalOpinion 等)。
 */
function correctionPriority(c: WorkOrderCaseRecord): number {
  const hasNote = !!c.falsePositiveNote?.trim();
  const hasOpinion = c.humanEdited && !!c.finalOpinion?.trim();
  if (c.isFalsePositive && hasNote) return 0;
  if (hasOpinion) return 1;
  if (c.isFalsePositive) return 2;
  return 3;
}

/** 归一化"这条教训是什么"的指纹,用于去重(合并同一教训的近重复反馈) */
function correctionDedupKey(c: WorkOrderCaseRecord): string {
  const lesson = (c.falsePositiveNote || c.finalOpinion || "")
    .replace(/[\s「」【】()()"""''`、,,。.:：;;!!??~—\-_/\\]/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `${c.conclusion}|${c.riskLevel}|${lesson}`;
}

/** 把一条案例记录转成注入 prompt 的 CorrectionExample(误判原因/人工意见全文保留) */
function toCorrectionExample(c: WorkOrderCaseRecord): CorrectionExample {
  return {
    citizenAppeal: snippet(c.citizenAppeal),
    replyContent: snippet(c.replyContent),
    evaluationReport: c.evaluationReport ? snippet(c.evaluationReport) : undefined,
    aiConclusion: c.conclusion,
    aiRiskLevel: c.riskLevel,
    finalOpinion: c.humanEdited ? c.finalOpinion?.trim() || undefined : undefined,
    isFalsePositive: c.isFalsePositive,
    falsePositiveNote: c.falsePositiveNote?.trim() || undefined,
  };
}

/** 估算一条 correction 注入 prompt 后占用的字符数(用于预算) */
function correctionCost(ex: CorrectionExample): number {
  return (
    (ex.citizenAppeal?.length ?? 0) +
    (ex.replyContent?.length ?? 0) +
    (ex.evaluationReport?.length ?? 0) +
    (ex.finalOpinion?.length ?? 0) +
    (ex.falsePositiveNote?.length ?? 0) +
    40 // 固定字段(结论/风险/标签)的粗略开销
  );
}

/**
 * 预算选择器(Tier 1 核心):在候选反馈中按 优先级分层 → 去重 → 字符预算填充。
 * 取代旧的 slice(0,4):高信号反馈优先、同一教训不重复占预算、总量受 budget 约束。
 * 溢出的低优先尾部由 Tier 3 提炼的准则(常驻规范)吸收,运行时保持单次 LLM 调用。
 * 返回选中的示例、已用预算,以及已占用的去重指纹(供 Tier2 跨类召回避免与同类重复)。
 */
function selectCorrections(
  candidates: WorkOrderCaseRecord[],
  budget: number
): { selected: CorrectionExample[]; usedBudget: number; seenKeys: Set<string> } {
  // 分层:层内保持 listCases 的 createdAt desc 顺序(最新的同优先级先进)
  const sorted = [...candidates].sort(
    (a, b) => correctionPriority(a) - correctionPriority(b)
  );

  const seen = new Set<string>();
  const selected: CorrectionExample[] = [];
  let used = 0;
  for (const c of sorted) {
    const key = correctionDedupKey(c);
    if (seen.has(key)) continue; // 去重:同一教训只留最高优先/最新一条
    seen.add(key);
    const ex = toCorrectionExample(c);
    const cost = correctionCost(ex);
    if (used + cost > budget && selected.length > 0) break; // 预算用尽(至少保 1 条)
    selected.push(ex);
    used += cost;
  }
  return { selected, usedBudget: used, seenKeys: seen };
}

/** Tier2:跨类召回上限——最多补几条跨类反馈(同类永远优先占预算) */
const CROSS_TYPE_MAX = 3;
/** Tier2:跨类反馈的最低相似度阈值,低于此不召回(避免不相关噪音) */
const CROSS_TYPE_MIN_SIMILARITY = 0.12;

/** 取一条案例用于相似度比对的文本(诉求+回单) */
function caseText(c: WorkOrderCaseRecord): string {
  return `${c.citizenAppeal || ""} ${c.replyContent || ""} ${c.evaluationReport || ""}`;
}
/** 取一条案例的问题类目集合(用于类目重叠加权) */
function caseCategories(c: WorkOrderCaseRecord): string[] {
  return (c.issues ?? []).map((i) => i.category).filter(Boolean);
}

/**
 * Tier2 跨类召回:在"非当前类型"的合格反馈里,按与当前工单的词法相似度择优,
 * 只填同类占用后剩余的预算。纯进程内(无 LLM),故审核仍保持 2 次 LLM 调用。
 * 返回带 crossType 标记与相似度的示例(供 formatCorrections 单独标注、前端展示)。
 */
function selectCrossTypeCorrections(
  candidates: WorkOrderCaseRecord[],
  input: WorkOrderInput,
  ruleFindings: ReviewIssue[],
  remainingBudget: number,
  seenKeys: Set<string>
): { ex: CorrectionExample; similarity: number; fromOrderType: string }[] {
  if (remainingBudget <= 0 || candidates.length === 0) return [];
  const inputText = `${input.citizenAppeal || ""} ${input.replyContent || ""} ${input.evaluationReport || ""}`;
  const inputCats = ruleFindings.map((f) => f.category).filter(Boolean);

  const scored = candidates
    .map((c) => ({
      c,
      similarity: combinedSimilarity(inputText, caseText(c), inputCats, caseCategories(c)),
    }))
    .filter((s) => s.similarity >= CROSS_TYPE_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity);

  const out: { ex: CorrectionExample; similarity: number; fromOrderType: string }[] = [];
  let used = 0;
  for (const { c, similarity } of scored) {
    if (out.length >= CROSS_TYPE_MAX) break;
    const key = correctionDedupKey(c);
    if (seenKeys.has(key)) continue; // 与同类/彼此去重
    const ex: CorrectionExample = {
      ...toCorrectionExample(c),
      crossType: { fromOrderType: c.orderType },
    };
    const cost = correctionCost(ex);
    if (used + cost > remainingBudget) continue; // 跨类不"至少保 1 条",装不下就跳过
    seenKeys.add(key);
    out.push({ ex, similarity, fromOrderType: c.orderType });
    used += cost;
  }
  return out;
}

/**
 * 取当前工单类型下、用户"人工修改过意见"或"标记为误判"的历史案例,
 * 作为 few-shot 纠错示例。任何异常(DB 未配置/查询失败)都静默降级为空数组,
 * 绝不因此拖垮审核主流程。
 *
 * Tier 1:不再固定取 4 条,而是在字符预算内按优先级择优、去重,让历史反馈"永久可用"。
 */
/** 把一条 CorrectionExample 转成给前端展示的学习引用摘要(gist 取误判原因或人工意见) */
function toLearningRef(
  ex: CorrectionExample,
  orderType: string,
  sameType: boolean,
  similarity?: number
): LearningRef {
  const raw = ex.falsePositiveNote || ex.finalOpinion || ex.aiConclusion || "";
  const gist = raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
  return { orderType, sameType, gist, similarity };
}

/**
 * 取历史纠错示例注入 few-shot。
 * Tier1:同类型按优先级+去重+预算择优(始终优先)。
 * Tier2:同类占用后若有剩余预算,用词法相似度从"其他类型"召回相近反馈作类比补充。
 * 任何异常(DB 未配置/查询失败)静默降级为空,绝不拖垮审核主流程。
 * 纯 DB + 进程内计算,无 LLM 调用 → 审核仍保持 2 次 LLM 调用。
 */
async function loadCorrections(
  input: WorkOrderInput,
  ruleFindings: ReviewIssue[]
): Promise<{ corrections: CorrectionExample[]; refs: LearningRef[] }> {
  const orderType = input.orderType;
  try {
    // 一次拉全量合格反馈(listCases 已限 500),再按 orderType 切同类/跨类,避免两次查询。
    const all = await listCases({});
    const qualified = all.filter((c) => c.humanEdited || c.isFalsePositive);
    const sameTypeCases = qualified.filter((c) => c.orderType === orderType);
    const crossTypeCases = qualified.filter((c) => c.orderType !== orderType);

    // Tier1:同类优先占预算
    const { selected, usedBudget, seenKeys } = selectCorrections(
      sameTypeCases,
      CORRECTION_CHAR_BUDGET
    );
    const refs: LearningRef[] = selected.map((ex) => toLearningRef(ex, orderType, true));

    // Tier2:剩余预算内补跨类类比
    const remaining = CORRECTION_CHAR_BUDGET - usedBudget;
    const cross = selectCrossTypeCorrections(
      crossTypeCases,
      input,
      ruleFindings,
      remaining,
      seenKeys
    );
    for (const { ex, similarity, fromOrderType } of cross) {
      refs.push(toLearningRef(ex, fromOrderType, false, similarity));
    }

    const corrections = [...selected, ...cross.map((x) => x.ex)];
    return { corrections, refs };
  } catch {
    return { corrections: [], refs: [] };
  }
}

/** 仅供测试:暴露预算选择器与默认预算,便于单测优先级/去重/预算行为。 */
export const __test__ = { selectCorrections, CORRECTION_CHAR_BUDGET };

export async function reviewWorkOrder(rawInput: ReviewInput): Promise<ReviewServiceResult> {
  validate(rawInput);

  // 工单类型缺省回退「其他」,后续规范查询与规则引擎据此运行
  const input: WorkOrderInput = { ...rawInput, orderType: rawInput.orderType?.trim() || "其他" };

  // 2. 查询规范
  const standard = await getActiveStandard(input.orderType);

  // 3. 本地规则预检
  const ruleFindings = checkRules(input);

  // 3.5 取历史纠错示例(few-shot):同类优先 + 跨类类比(Tier2);失败静默降级为空
  const { corrections, refs } = await loadCorrections(input, ruleFindings);

  // 4 + 5. AI 主审核 → 复核(内含降级保护)
  const ai = await runFullReview({ input, ruleFindings, standard, corrections });

  // 6. 合并
  const result = mergeReview({
    ruleFindings,
    aiOutput: ai.output,
    standard,
    aiMode: ai.mode,
  });

  // 6.5 组装"学习依据"(C2):让用户看到本次参考了哪些历史反馈/准则
  const learningContext: LearningContext = {
    usedCorrectionCount: refs.length,
    usedCorrections: refs,
    appliedStandardName: standard?.name,
    distilledRuleCount: countDistilledRules(standard),
  };

  // 7. 返回
  return { ...result, degradedNote: ai.degraded, learningContext };
}

/** 统计生效规范中"从反馈提炼的准则/豁免"条数(Tier3:加强 + 豁免) */
function countDistilledRules(
  standard: Awaited<ReturnType<typeof getActiveStandard>>
): number {
  const s = standard as { learnedRules?: string[]; learnedExemptions?: string[] } | null | undefined;
  return (s?.learnedRules?.length ?? 0) + (s?.learnedExemptions?.length ?? 0);
}
