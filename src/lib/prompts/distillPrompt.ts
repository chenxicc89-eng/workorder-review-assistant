import type { DistillContext } from "../ai/providers";
import type { CorrectionExample } from "../ai/providers";
import type { RuleStandard } from "../types";

// ==========================================================================
// 蒸馏 Prompt(Tier3:反馈 → 常驻规则)
// --------------------------------------------------------------------------
// 把一批「人工纠错」(误判 / 人工改意见)聚类,合成为候选常驻规则:
//   - reinforce(加强规则):AI 反复漏报、需固化为"必须审到"的要点;
//   - exempt(豁免规则):AI 反复误报、需固化为"以下情形不算问题"的豁免。
// 离线运行、由「学习中心」手动触发,不在审核热路径上。
// 输出 JSON,由 openaiProvider 解析,mockProvider 用关键词启发模拟。
// ==========================================================================

export const DISTILL_SYSTEM_PROMPT = `你是12345工单审核系统的"规则提炼员"。你的任务是阅读一批【人工对 AI 审核的纠错记录】,从中归纳出可长期复用的审核准则。
纠错来自两类信号:
1. 人工把某条 AI 判定标记为【误判】(附"错在哪"说明)—— 说明 AI 在这类情形下过度报错,应提炼为「豁免准则(exempt)」:告诉审核以后遇到同类情形不要再报为问题。
2. 人工【修改了 AI 的最终意见】—— 说明 AI 的口径/尺度需要对齐,若人工补上 AI 漏掉的要点,应提炼为「加强准则(reinforce)」:告诉审核以后必须审到该要点。

提炼原则(务必遵守):
- 允许单条纠错生成候选，但必须在理由中标注“单样本候选”，confidence 不得高于 0.6；多条重复信号可给出更高置信度。
- 每条准则必须能独立读懂、可直接写进审核规范,用正式简洁的中文一句话表述,不要引用具体某个市民或订单号。
- 明确区分 reinforce 与 exempt,不要混。
- 若某教训在【当前生效规范】里已有等价表述,不要重复提炼(去重)。
- 每条准则给出支撑它的案例序号(supportingIndexes,对应输入中每条纠错前的编号),以及 0~1 的置信度。
- reinforce 准则可给出建议风险等级 riskLevel(高/中/低);exempt 可不给。
- 没有明确可复用信号时返回空数组，不要为了产出数量而编造规则。

只输出 JSON 对象,不要输出 Markdown 或解释。结构:
{
  "candidates": [
    {
      "kind": "reinforce" | "exempt",
      "text": "准则正文(一句话)",
      "rationale": "提炼理由(单样本时需明确标注)",
      "supportingIndexes": [1, 3],
      "riskLevel": "高" | "中" | "低"(可选,仅 reinforce),
      "confidence": 0.0~1.0
    }
  ]
}`;

/** 把当前生效规范里已有的"提炼准则"整理出来,供 LLM 去重 */
function formatExistingLearned(standard?: RuleStandard | null): string {
  if (!standard) return "(无)";
  const lines: string[] = [];
  if (standard.learnedRules?.length)
    lines.push("已有加强准则:" + standard.learnedRules.join(";"));
  if (standard.learnedExemptions?.length)
    lines.push("已有豁免准则:" + standard.learnedExemptions.join(";"));
  // 也把规范本身的高风险/规范要求列出,避免提炼出与规范重复的内容
  if (standard.highRiskIssues?.length)
    lines.push("规范已列高风险问题:" + standard.highRiskIssues.join("、"));
  if (standard.standardRequirements?.length)
    lines.push("规范已有要求:" + standard.standardRequirements.join(";"));
  return lines.length ? lines.join("\n") : "(无)";
}

/** 把一批纠错整理成带编号的文本(编号即 supportingIndexes 引用的序号,从 1 开始) */
function formatFeedback(feedback: CorrectionExample[]): string {
  if (!feedback.length) return "(无纠错记录)";
  return feedback
    .map((c, i) => {
      const lines = [
        `纠错${i + 1}:`,
        `  市民诉求:${c.citizenAppeal || "(无)"}`,
        `  回单内容:${c.replyContent || "(无)"}`,
        `  AI当时判定:${c.aiConclusion} / 风险${c.aiRiskLevel}`,
      ];
      if (c.isFalsePositive) {
        lines.push(
          `  人工标记:【误判】${c.falsePositiveNote ? `,错在:${c.falsePositiveNote}` : "(未填原因)"}`
        );
      }
      if (c.finalOpinion) {
        lines.push(`  人工最终意见:${c.finalOpinion}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildDistillUserPrompt(ctx: DistillContext): string {
  const { orderType, feedback, existingStandard } = ctx;
  return `请对以下【${orderType}】工单类型的人工纠错记录进行规则提炼,按要求输出 JSON。

【当前生效规范中已有的准则(用于去重,不要重复提炼)】
${formatExistingLearned(existingStandard)}

【人工纠错记录(共 ${feedback.length} 条,编号即 supportingIndexes 引用序号)】
${formatFeedback(feedback)}

要求:
- 归纳教训为 reinforce(加强)/ exempt(豁免)准则；单条纠错也可提炼，但置信度不得高于 0.6。
- 与"已有准则/规范"等价的不重复提炼。
- 每条准则给出 supportingIndexes(对应上面纠错编号)、rationale、confidence;reinforce 可给 riskLevel。
- 没有明确可复用信号就返回 {"candidates": []}。
- 只输出 JSON 对象。`;
}
