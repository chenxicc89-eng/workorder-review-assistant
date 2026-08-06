import type { ReviewIssue, RuleStandard, WorkOrderInput } from "../types";
import type { CorrectionExample } from "../ai/providers";

// ==========================================================================
// 主审核 Prompt(需求文档第七节)
// --------------------------------------------------------------------------
// REVIEW_SYSTEM_PROMPT 为固定 system 提示词;buildReviewUserPrompt 负责把
// 工单输入、本地规则命中结果、对应规范拼装为一段结构化 user 提示词。
// ==========================================================================

export const REVIEW_SYSTEM_PROMPT = `你是国家电网12345工单材料审核员,任务是根据市民诉求、承办单位回单内容、不计入考核评价报告、对应规范和本地规则检查结果进行预审。
你的审核目标不是替承办单位重写材料,而是分别发现回单和评价报告中可能不符合规范的地方,并检查两份材料是否一致。
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
若提供了不计入考核评价报告，还必须审核:
11. 报告是否与本工单、市民诉求和回单直接对应，工单编号、单位、时间、事实和处理结果是否一致;
12. 报告是否明确提出不计入考核评价的结论及具体申请原因;
13. 报告引用的不计入事项、政策法规或规则依据是否具体，并能逻辑支撑申请结论;
14. 调查处置、事实认定、申请理由、佐证材料之间是否形成完整证据链;
15. 报告所列附件或佐证是否清楚，是否能支撑关键事实;
16. 报告与回单在联系情况、调查过程、处置结果和市民反馈上是否矛盾。
未提供评价报告时，不得凭空提出评价报告相关问题。
请严格基于输入文本判断,不得编造事实。
如果某项问题没有足够依据,请不要强行指出。
如果发现问题,请引用回单、评价报告或诉求中的原文作为依据。
重要:描述问题时必须区分以下两种情况,措辞不得混用:
- 回单【完全没有提及】某诉求或要素 —— 才可用"未回应""未提及""未说明"等表述;
- 回单【已经提及或作出结论,但缺少核实过程、事实依据或处理细节】 —— 必须表述为"虽已说明……但缺少核实过程/事实支撑/处理细节",不得写成"未回应"或"未提及"。
例如:回单称"经核实并非电表故障",这属于"已作出结论但未提供核实依据",应指出"回单已就电表故障作出结论,但未说明核实过程(如电表读数、现场或远程核实情况)",而不能写"未回应电表故障"。
判断问题依据回单事实是否充分,而非表面是否出现相关字眼;但生成 evidence/analysis/审核意见时,措辞要与回单实际内容一致,避免出现与原文明显矛盾的表述。
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
- target: "reply" | "evaluation_report" | "cross_material"
审核意见 reviewOpinion 要使用正式、简洁、可直接复制给承办单位的语言,并且必须同时包含两部分:
1. 存在的问题(逐条说明);
2. 整改建议(即应如何补充、修改,可与各 Issue 的 requirement 对应)。
即:审核意见不能只指出问题,还要写清承办单位应当怎么改。`;

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
  // Tier3:从历史反馈提炼并经人工采纳的常驻准则。随规范块注入,不占 few-shot 预算 →
  // 反馈"永久记住":此处的准则是过往教训的固化,优先级等同规范本身。
  if (standard.learnedRules?.length)
    lines.push(
      `从历史反馈提炼的加强准则(必须遵守,与规范同等效力):${standard.learnedRules.join(";")}`
    );
  if (standard.learnedExemptions?.length)
    lines.push(
      `从历史反馈提炼的豁免准则(以下情形属人工确认的合理情况,不应报为问题):${standard.learnedExemptions.join(";")}`
    );
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

/**
 * 把历史纠错示例整理成 few-shot 文本。
 * 这是"人工对同类工单的实际判定",用来让本次审核对齐用户口径:
 * - 人工修改过意见 → 展示人工最终意见(这是用户认可的正确表述)。
 * - 被标记为误判 → 明确告知 AI 当时的判定是误判,并附上用户写的"错在哪"。
 */
function formatOneCorrection(c: CorrectionExample, label: string): string {
  const prefix = c.crossType ? `${label}(来自「${c.crossType.fromOrderType}」类型)` : label;
  const lines = [
    `${prefix}:`,
    `  市民诉求:${c.citizenAppeal || "(无)"}`,
    `  回单内容:${c.replyContent || "(无)"}`,
    `  评价报告:${c.evaluationReport || "(无)"}`,
    `  AI当时判定:${c.aiConclusion} / 风险${c.aiRiskLevel}`,
  ];
  if (c.isFalsePositive) {
    lines.push(
      `  ⚠ 人工判定:该 AI 判定为【误判】${c.falsePositiveNote ? `,原因:${c.falsePositiveNote}` : "(未填原因)"}`
    );
  }
  if (c.finalOpinion) {
    lines.push(`  ✔ 人工最终意见(应对齐此口径):${c.finalOpinion}`);
  }
  return lines.join("\n");
}

function formatCorrections(corrections?: CorrectionExample[]): string {
  if (!corrections?.length) return "(暂无历史纠错案例。)";
  // Tier2:同类反馈"硬对齐",跨类反馈"仅作类比参考",分块给出不同表头,防止模型
  // 把其他类型的判定尺度直接照搬到本类型上。
  const sameType = corrections.filter((c) => !c.crossType);
  const crossType = corrections.filter((c) => c.crossType);

  const blocks: string[] = [];
  if (sameType.length) {
    const header = `以下为 ${sameType.length} 条【同类工单】历史纠错案例(人工对同类工单的实际判定,请整体对齐其口径与尺度):\n`;
    const body = sameType.map((c, i) => formatOneCorrection(c, `示例${i + 1}`)).join("\n\n");
    blocks.push(header + body);
  }
  if (crossType.length) {
    const header = `以下为 ${crossType.length} 条【其他工单类型】的相关反馈,仅作类比参考(判定尺度仍以本工单类型的规范为准,不要照搬跨类结论,但可借鉴其中相通的审核思路):\n`;
    const body = crossType.map((c, i) => formatOneCorrection(c, `类比${i + 1}`)).join("\n\n");
    blocks.push(header + body);
  }
  return blocks.join("\n\n");
}

export interface ReviewPromptContext {
  input: WorkOrderInput;
  ruleFindings: ReviewIssue[];
  standard?: RuleStandard | null;
  corrections?: CorrectionExample[];
}

export function buildReviewUserPrompt(ctx: ReviewPromptContext): string {
  const { input, ruleFindings, standard, corrections } = ctx;
  return `请对以下 12345 工单回单进行预审,并按要求输出 JSON。

【工单类型】
${input.orderType || "(未填写)"}

【市民诉求】
${input.citizenAppeal || "(未填写)"}

【回单内容】
${input.replyContent || "(未填写)"}

【不计入考核评价报告】
${input.evaluationReport || "(未提供，本次不审核评价报告)"}

【附件说明】
${input.attachmentNote || "(无)"}

【承办单位】
${input.unit || "(未填写)"}

【备注】
${input.remark || "(无)"}

【对应工单类型规范】
${formatStandard(standard)}

【历史纠错案例(人工对同类工单的实际判定,请优先对齐其口径与尺度)】
${formatCorrections(corrections)}

【本地规则命中结果(确定性预检,供参考)】
${formatRuleFindings(ruleFindings)}

要求:
- 结合上述规范与规则命中结果,补充语义层面的问题(如是否回应核心诉求、事实是否清楚、措施是否具体等)。
- 若「历史纠错案例」中有与本工单相似的情形,请对齐人工的判定尺度:人工认为是误判的问题不要再报,人工最终意见的表述口径应作为参照。
- 每条问题必须引用诉求、回单或评价报告中的原文作为 evidence。
- 每条问题必须用 target 标明审核对象：回单问题为 reply，报告自身问题为 evaluation_report，两份材料相互矛盾为 cross_material。
- reviewOpinion 必须既指出问题、又给出整改建议(承办单位应如何补充或修改),不能只列问题。
- 只输出 JSON 对象,字段严格为 conclusion / riskLevel / summary / issues / reviewOpinion / confidence。
- issues 中每项包含 weight / category / evidence / analysis / requirement / target。`;
}
