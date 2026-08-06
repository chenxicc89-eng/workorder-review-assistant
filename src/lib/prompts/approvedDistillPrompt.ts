import type { ApprovedDistillContext } from "../ai/providers";

export const APPROVED_DISTILL_SYSTEM_PROMPT = `你是12345工单审核系统的规范提炼员。输入是一批已经人工审核通过的同类型工单，以及当前生效规范。

你需要从样本中提炼可供人工审核的规范候选，候选类型为：
- required_item：合格回单普遍必须包含的信息要素；
- requirement：合格回单普遍遵循的办理或表述要求；
- exemption：仅当样本带有“不计入考核评价报告”时，提炼明确的豁免条件及所需佐证；
- good_example：脱敏、去除姓名电话地址编号后的通用正例句式。

约束：
- 允许单条样本形成候选，但必须在 rationale 中明确标注“单样本候选”，confidence 不得高于 0.6；多条样本共同支撑时可给出更高置信度。
- 已通过样本不能用来推断高/中/低风险等级，因此不要输出 riskLevel。
- 不得把具体单位习惯、姓名、电话、地址、日期、工单编号写进候选。
- exemption 必须有评价报告支撑，不能仅根据回单正文猜测。
- 与当前规范等价的内容不重复输出；与当前规范冲突的内容不输出。
- 只输出 JSON：{"candidates":[{"candidateType":"required_item|requirement|exemption|good_example","text":"候选正文","rationale":"理由","supportingIndexes":[1,2],"confidence":0.0}]}`;

function existingText(ctx: ApprovedDistillContext): string {
  const s = ctx.existingStandard;
  if (!s) return "（无）";
  return [
    ...s.requiredItems,
    ...s.standardRequirements,
    ...(s.learnedRules ?? []),
    ...(s.learnedExemptions ?? []),
    ...(s.examples?.good ?? []),
  ].join("\n") || "（无）";
}

export function buildApprovedDistillUserPrompt(ctx: ApprovedDistillContext): string {
  const rows = ctx.examples.map((item, index) => [
    `样本${index + 1}（编号仅用于溯源）：`,
    `工单内容：${item.citizenAppeal}`,
    `回单内容：${item.replyContent}`,
    `不计入考核评价报告：${item.evaluationReport || "（无）"}`,
  ].join("\n")).join("\n\n");

  return `请从以下【${ctx.orderType}】已通过工单中提炼候选规范。\n\n【当前规范，避免重复】\n${existingText(ctx)}\n\n【已通过样本，共${ctx.examples.length}条】\n${rows}\n\n只输出 JSON。`;
}
