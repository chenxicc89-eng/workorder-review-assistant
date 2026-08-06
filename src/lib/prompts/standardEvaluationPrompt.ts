import type { StandardEvaluationContext } from "../ai/providers";

export const STANDARD_EVALUATION_SYSTEM_PROMPT = `你是12345回单规范评估员。输入包含两个规范版本和一批已经人工审核通过的工单。请分别按旧版、当前版审核每条样本，统计：
- passCount：按该版本审核后仍应通过的样本数；
- issueCount：该版本对整批样本识别出的实质问题总数。
不计入考核评价报告属于豁免证据，必须纳入判断。不要因为新版规则更多就机械增加问题；只有样本确实不满足时才计问题。
只输出 JSON：{"before":{"passCount":0,"issueCount":0},"after":{"passCount":0,"issueCount":0}}。`;

export function buildStandardEvaluationPrompt(ctx: StandardEvaluationContext): string {
  const standards = (value: unknown) => JSON.stringify(value);
  const cases = ctx.examples.map((item, index) =>
    `样本${index + 1}\n工单：${item.citizenAppeal}\n回单：${item.replyContent}\n评价报告：${item.evaluationReport || "无"}`
  ).join("\n\n");
  return `工单类型：${ctx.orderType}\n旧版 V${ctx.previousVersion}：${standards(ctx.before)}\n当前 V${ctx.currentVersion}：${standards(ctx.after)}\n\n${cases}`;
}
