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
6. 审核意见是否正式、清楚、可执行;
7. 措辞是否与回单原文一致:若回单其实已经提及或对某问题作出结论(如"经核实并非电表故障"),但上一轮却用"未回应""未提及"来描述,属于措辞与原文矛盾,必须改为"已作出结论但缺少核实过程/事实支撑"这类准确表述——不要删除该问题(缺依据仍是真实缺陷),只修正措辞。
8. 若提供了不计入考核评价报告，是否遗漏报告自身的完整性、依据和证据链问题，以及报告与回单之间的事实矛盾。
请基于原始市民诉求、回单内容、不计入考核评价报告、规范要求、本地规则命中结果和上一轮审核结果进行修正。
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
- requirement: string
- target: "reply" | "evaluation_report" | "cross_material"`;

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
    target?: "reply" | "evaluation_report" | "cross_material";
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

【不计入考核评价报告】
${input.evaluationReport || "(未提供，本次不审核评价报告)"}

【本地规则命中结果】
${formatRuleFindings(ruleFindings)}

【上一轮审核结果(JSON)】
${JSON.stringify(prior, null, 2)}

复核要求:
- 逐条核对上一轮 issues 的 evidence 是否确实来自诉求、回单或评价报告原文;无依据的删除或降权。
- 检查 target 是否正确：回单问题用 reply，报告问题用 evaluation_report，跨材料矛盾用 cross_material。
- 检查是否遗漏明显高风险问题(如联系情况矛盾、未回应核心诉求、"已解决"缺乏支撑),如有则补充。
- 检查权重是否合理、结论是否过重或过轻。
- 校准措辞:凡回单已提及或已作出结论的事项,evidence/analysis/reviewOpinion 一律不得用"未回应""未提及"描述,改用"已说明……但缺少核实过程/事实支撑"等与原文一致的表述;缺依据的问题保留,只修措辞。
- reviewOpinion 需正式、简洁、可直接复制给承办单位,采用"经审核,该回单存在以下问题:一是……;二是……。请承办单位补充完善……后重新反馈。"的结构。
- 只输出 JSON 对象,不要输出 Markdown 或解释。`;
}
