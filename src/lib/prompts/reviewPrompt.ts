import type { ReviewIssue, RuleStandard, WorkOrderInput } from "../types";

// ==========================================================================
// 主审核 Prompt(需求文档第七节)
// --------------------------------------------------------------------------
// REVIEW_SYSTEM_PROMPT 为固定 system 提示词;buildReviewUserPrompt 负责把
// 工单输入、本地规则命中结果、对应规范拼装为一段结构化 user 提示词。
// ==========================================================================

export const REVIEW_SYSTEM_PROMPT = `你是国家电网12345工单回单审核员,任务是根据市民诉求、承办单位回单内容、对应回单规范和本地规则检查结果,对回单进行预审。
你的审核目标不是替承办单位重写回单,而是发现回单中可能不符合规范的地方,并生成审核意见。
请重点审核以下方面:
1. 是否完整回应市民核心诉求;
2. 是否存在只回应表面问题、未回应深层诉求的情况;
3. 联系情况是否前后一致;
4. 市民意见表述是否规范;
5. 办理时间、停电时间、抢修时间、恢复时间是否清晰;
6. 停电原因、现场核实情况、处理措施、处理结果是否具体;
7. 是否存在"已解决"但事实支撑不足的问题;
8. 是否存在口语化、内部化、不正式表述;
9. 是否需要补充佐证材料;
10. 审核意见是否适合直接退回承办单位修改。
请严格基于输入文本判断,不得编造事实。
如果某项问题没有足够依据,请不要强行指出。
如果发现问题,请引用回单或诉求中的原文作为依据。
问题权重分为:高、中、低。
权重判断标准:
高风险:
- 未回应市民核心诉求;
- 回单前后矛盾;
- 联系情况虚假或矛盾;
- 权属判断明显无法支撑;
- "已解决"结论明显缺少事实支撑;
- 对频繁停电、重复投诉、敏感诉求回应明显不足。
中风险:
- 时间节点不完整;
- 处理措施笼统;
- 原因说明不充分;
- 市民意见表述不规范;
- 佐证材料说明不足;
- 现场核实情况不清。
低风险:
- 表述不正式;
- 个别措辞不规范;
- 轻微格式问题;
- 语句不够通顺。
请输出 JSON,不要输出 Markdown。
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
审核意见 reviewOpinion 要使用正式、简洁、可直接复制给承办单位的语言。`;

/** 把一条规范整理成给 AI 看的紧凑要求文本 */
function formatStandard(standard?: RuleStandard | null): string {
  if (!standard) return "(未找到该工单类型的专项规范,请按通用回单规范审核。)";
  const lines: string[] = [];
  lines.push(`规范名称:${standard.name}`);
  if (standard.requiredItems?.length)
    lines.push(`必须包含要素:${standard.requiredItems.join("、")}`);
  if (standard.highRiskIssues?.length)
    lines.push(`高风险问题:${standard.highRiskIssues.join("、")}`);
  if (standard.mediumRiskIssues?.length)
    lines.push(`中风险问题:${standard.mediumRiskIssues.join("、")}`);
  if (standard.lowRiskIssues?.length)
    lines.push(`低风险问题:${standard.lowRiskIssues.join("、")}`);
  if (standard.standardRequirements?.length)
    lines.push(`规范要求:${standard.standardRequirements.join(";")}`);
  return lines.join("\n");
}

/** 把本地规则命中结果整理成文本 */
function formatRuleFindings(findings: ReviewIssue[]): string {
  if (!findings.length) return "(本地规则未命中确定性问题。)";
  return findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.weight}] ${f.category} —— 依据:${f.evidence || "(无)"};分析:${f.analysis}`
    )
    .join("\n");
}

export interface ReviewPromptContext {
  input: WorkOrderInput;
  ruleFindings: ReviewIssue[];
  standard?: RuleStandard | null;
}

export function buildReviewUserPrompt(ctx: ReviewPromptContext): string {
  const { input, ruleFindings, standard } = ctx;
  return `请对以下 12345 工单回单进行预审,并按要求输出 JSON。

【工单类型】
${input.orderType || "(未填写)"}

【市民诉求】
${input.citizenAppeal || "(未填写)"}

【回单内容】
${input.replyContent || "(未填写)"}

【附件说明】
${input.attachmentNote || "(无)"}

【承办单位】
${input.unit || "(未填写)"}

【备注】
${input.remark || "(无)"}

【对应工单类型规范】
${formatStandard(standard)}

【本地规则命中结果(确定性预检,供参考)】
${formatRuleFindings(ruleFindings)}

要求:
- 结合上述规范与规则命中结果,补充语义层面的问题(如是否回应核心诉求、事实是否清楚、措施是否具体等)。
- 每条问题必须引用回单或诉求中的原文作为 evidence。
- 只输出 JSON 对象,字段严格为 conclusion / riskLevel / summary / issues / reviewOpinion / confidence。
- issues 中每项包含 weight / category / evidence / analysis / requirement。`;
}
