import type { ReviewIssue, RuleStandard, WorkOrderInput } from "../types";

// ==========================================================================
// 复核 Prompt(需求文档第七节)
// --------------------------------------------------------------------------
// 对主审核结果进行复核:检查误判、遗漏、权重、结论与意见,并修正后再次输出
// 完整的 ReviewResult JSON。
// ==========================================================================

export const VERIFY_SYSTEM_PROMPT = `你是12345工单回单复核员。请对上一轮AI审核结果进行复核。
你需要检查:
1. 审核问题是否有原文依据;
2. 是否存在编造或过度推断;
3. 是否漏掉明显高风险问题;
4. 问题权重是否合理;
5. 审核结论是否过重或过轻;
6. 审核意见是否正式、清楚、可执行。
请基于原始市民诉求、回单内容、规范要求、本地规则命中结果和上一轮审核结果进行修正。
不得编造事实。
如果上一轮指出的问题没有足够依据,应删除或降权。
如果有明显遗漏,应补充。
最终仍然输出 ReviewResult JSON。
JSON 字段必须包括:
- conclusion: "通过" | "建议修改" | "建议退回"
- riskLevel: "高" | "中" | "低"
- summary: string[]
- issues: Issue[]
- reviewOpinion: string
- confidence: number
Issue 字段包括:
- weight: "高" | "中" | "低"
- category: string
- evidence: string
- analysis: string
- requirement: string`;

/** 上一轮主审核结果的精简形态(仅复核需要的字段) */
export interface PriorReview {
  conclusion: string;
  riskLevel: string;
  summary: string[];
  issues: Array<{
    weight: string;
    category: string;
    evidence: string;
    analysis: string;
    requirement: string;
  }>;
  reviewOpinion: string;
  confidence: number;
}

export interface VerifyPromptContext {
  input: WorkOrderInput;
  ruleFindings: ReviewIssue[];
  standard?: RuleStandard | null;
  prior: PriorReview;
}

function formatRuleFindings(findings: ReviewIssue[]): string {
  if (!findings.length) return "(本地规则未命中确定性问题。)";
  return findings
    .map((f, i) => `${i + 1}. [${f.weight}] ${f.category} —— ${f.analysis}`)
    .join("\n");
}

export function buildVerifyUserPrompt(ctx: VerifyPromptContext): string {
  const { input, ruleFindings, prior } = ctx;
  return `请复核以下这份 12345 工单的上一轮审核结果,并输出修正后的 ReviewResult JSON。

【市民诉求】
${input.citizenAppeal || "(未填写)"}

【回单内容】
${input.replyContent || "(未填写)"}

【本地规则命中结果】
${formatRuleFindings(ruleFindings)}

【上一轮审核结果(JSON)】
${JSON.stringify(prior, null, 2)}

复核要求:
- 逐条核对上一轮 issues 的 evidence 是否确实来自诉求或回单原文;无依据的删除或降权。
- 检查是否遗漏明显高风险问题(如联系情况矛盾、未回应核心诉求、"已解决"缺乏支撑),如有则补充。
- 检查权重是否合理、结论是否过重或过轻。
- reviewOpinion 需正式、简洁、可直接复制给承办单位,采用"经审核,该回单存在以下问题:一是……;二是……。请承办单位补充完善……后重新反馈。"的结构。
- 只输出 JSON 对象,不要输出 Markdown 或解释。`;
}
