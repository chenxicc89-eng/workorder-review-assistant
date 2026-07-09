import type { ReviewIssue, ReviewResult, RiskLevel, RuleStandard } from "./types";
import type { RawReviewOutput, RawIssue } from "./ai/providers";
import { deriveConclusion, highestRisk, sortByRisk, riskRank } from "./utils/risk";

// ==========================================================================
// 规则结果 + AI 结果合并(需求文档第十六节)
// --------------------------------------------------------------------------
// 规则:
//  1. 本地规则命中的高风险问题默认保留;
//  2. AI 可以补充问题;
//  3. AI 若认为规则命中是误判,可在 analysis 中说明,但不直接删除(除非明显无依据);
//  4. 同类问题合并去重(按 category 归并),标 source:"merged";
//  5. 最终风险等级取最高问题权重;
//  6. 结论:有高→建议退回;有中→建议修改;仅低→建议修改;无→通过。
// ==========================================================================

/** 归一化分类名,用于同类合并(去空白/全角括号差异) */
function normCategory(c: string): string {
  return c
    .trim()
    // 去除各种引号、括号、标点与空白,消除措辞差异(真实 AI 与规则的引号常不一致)
    .replace(/[\s「」【】〔〕（）()"""''`、,,。.:：;;!!??~—\-_/\\]/g, "")
    .toLowerCase();
}

/** 取更高风险权重 */
function maxWeight(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

/** 把 AI 原始 issue 转成带 id/source 的 ReviewIssue */
function toAiIssue(raw: RawIssue, idx: number): ReviewIssue {
  return {
    id: `ai-${idx + 1}`,
    weight: raw.weight,
    category: raw.category?.trim() || "其他问题",
    evidence: raw.evidence ?? "",
    analysis: raw.analysis ?? "",
    requirement: raw.requirement ?? "",
    source: "ai",
  };
}

/**
 * 合并规则问题与 AI 问题。
 * 同 category 的规则问题与 AI 问题合并为一条 merged:
 *   - 权重取更高;
 *   - evidence 优先用规则(确定性截取),AI 有补充则拼接;
 *   - analysis 合并(AI 若判定误判会在其中体现);
 *   - requirement 优先规则,规则为空时用 AI。
 */
function mergeIssues(ruleFindings: ReviewIssue[], aiIssues: ReviewIssue[]): ReviewIssue[] {
  const byCat = new Map<string, ReviewIssue>();

  // 规则问题先入表(高风险默认保留)
  for (const r of ruleFindings) {
    byCat.set(normCategory(r.category), { ...r });
  }

  // AI 问题合并/补充
  for (const a of aiIssues) {
    const key = normCategory(a.category);
    const existing = byCat.get(key);
    if (!existing) {
      byCat.set(key, a);
      continue;
    }
    // 同类合并:
    // - analysis 以规则的确定性描述为主(简洁、稳定,用于生成审核意见);
    //   规则若无 analysis 才用 AI 的。不再把两段拼在一起,避免意见冗长重复。
    // - evidence 优先规则(确定性截取),规则为空时用 AI 的。
    const analysis = existing.analysis?.trim() || a.analysis || "";
    const evidence = existing.evidence?.trim() || a.evidence || "";
    byCat.set(key, {
      id: existing.id,
      weight: maxWeight(existing.weight, a.weight),
      category: existing.category,
      evidence,
      analysis,
      requirement: existing.requirement || a.requirement,
      source: "merged",
    });
  }

  return sortByRisk(Array.from(byCat.values()));
}

/** 用序数词把问题列成"一是…二是…"体 */
const ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

/** 生成正式审核意见(需求文档第十二节风格) */
export function buildReviewOpinion(
  issues: ReviewIssue[],
  standard?: RuleStandard | null,
  aiOpinion?: string
): string {
  if (issues.length === 0) {
    return "经审核,该回单事实清楚、要素完整、表述规范,未发现明显问题,建议通过。";
  }
  // 高风险优先排序
  const sorted = sortByRisk(issues);
  const clauses = sorted.slice(0, ORDINALS.length).map((it, i) => {
    const analysis = (it.analysis || it.category).replace(/。$/, "");
    return `${ORDINALS[i]}是${analysis}`;
  });
  const problemPart = clauses.join(";");

  // 整改落点:汇总各问题 requirement 里的关键落点(去重、精简)
  const template = standard?.standardOpinionTemplates?.[0];
  const tail = "请承办单位补充完善相关情况后重新反馈。";

  const generated = `经审核,该回单存在以下问题:${problemPart}。${tail}`;

  // 若 AI 给出的意见也符合"经审核…"体且更具体,则优先采用 AI 意见,
  // 否则用规则化生成结果保证格式稳定。
  if (aiOpinion && aiOpinion.trim().startsWith("经审核") && aiOpinion.length >= generated.length * 0.6) {
    return aiOpinion.trim();
  }
  // template 仅作为兜底占位提示,这里不强依赖(保留扩展)
  void template;
  return generated;
}

/** 生成摘要标签:取各问题 category(去重、限量) */
function buildSummary(issues: ReviewIssue[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const it of sortByRisk(issues)) {
    const key = normCategory(it.category);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(it.category);
  }
  return tags.slice(0, 8);
}

export interface MergeInput {
  ruleFindings: ReviewIssue[];
  /** verify 之后的最终 AI 原始输出 */
  aiOutput: RawReviewOutput;
  standard?: RuleStandard | null;
  aiMode?: "real" | "mock";
}

/**
 * 合并规则命中与 AI 结果,产出最终 ReviewResult。
 */
export function mergeReview(inp: MergeInput): ReviewResult {
  const { ruleFindings, aiOutput, standard, aiMode } = inp;

  const aiIssues: ReviewIssue[] = (aiOutput.issues ?? []).map(toAiIssue);
  const issues = mergeIssues(ruleFindings, aiIssues);

  const { conclusion, riskLevel } = deriveConclusion(issues);
  // riskLevel 与最高问题权重一致(deriveConclusion 已保证,这里再兜底一次)
  const finalRisk = issues.length ? highestRisk(issues) : riskLevel;

  const reviewOpinion = buildReviewOpinion(issues, standard, aiOutput.reviewOpinion);
  const summary = buildSummary(issues);

  const confidence = clampConfidence(aiOutput.confidence);

  return {
    conclusion,
    riskLevel: finalRisk,
    summary,
    issues,
    reviewOpinion,
    ruleFindings,
    aiFindings: aiIssues,
    confidence,
    aiMode,
  };
}

function clampConfidence(c: number | undefined): number {
  if (typeof c !== "number" || Number.isNaN(c)) return 0.7;
  if (c < 0) return 0;
  if (c > 1) return 1;
  return Math.round(c * 100) / 100;
}
