import type { RiskLevel, ReviewConclusion, ReviewIssue } from "../types";

// ==========================================================================
// 风险等级 / 结论工具
// ==========================================================================

/** 风险权重排序值,越高越严重 */
const RISK_RANK: Record<RiskLevel, number> = {
  高: 3,
  中: 2,
  低: 1,
};

export function riskRank(level: RiskLevel): number {
  return RISK_RANK[level] ?? 0;
}

/** 取一组问题中的最高风险等级;无问题时返回「低」 */
export function highestRisk(issues: ReviewIssue[]): RiskLevel {
  if (issues.length === 0) return "低";
  let top: RiskLevel = "低";
  for (const i of issues) {
    if (riskRank(i.weight) > riskRank(top)) top = i.weight;
  }
  return top;
}

/**
 * 根据问题集合推导审核结论与整体风险等级(需求第十六节)。
 *   有高 → 建议退回 / 高
 *   有中 → 建议修改 / 中
 *   仅低 → 建议修改 / 低
 *   无   → 通过 / 低
 */
export function deriveConclusion(issues: ReviewIssue[]): {
  conclusion: ReviewConclusion;
  riskLevel: RiskLevel;
} {
  const hasHigh = issues.some((i) => i.weight === "高");
  const hasMedium = issues.some((i) => i.weight === "中");
  const hasLow = issues.some((i) => i.weight === "低");

  if (hasHigh) return { conclusion: "建议退回", riskLevel: "高" };
  if (hasMedium) return { conclusion: "建议修改", riskLevel: "中" };
  if (hasLow) return { conclusion: "建议修改", riskLevel: "低" };
  return { conclusion: "通过", riskLevel: "低" };
}

/** 按风险从高到低排序问题(稳定排序,同级保持原顺序) */
export function sortByRisk(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => riskRank(b.weight) - riskRank(a.weight));
}
