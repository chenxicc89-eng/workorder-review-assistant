import type { ReviewResult, WorkOrderInput } from "../../lib/types";
import { checkRules } from "../../lib/ruleEngine";
import { runFullReview } from "../../lib/ai/aiClient";
import { mergeReview } from "../../lib/reviewMerger";
import { getActiveStandard } from "./standardService";

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
// 未提供类型时回退「其他」通用规范,故校验只强制诉求与回单正文。
function validate(input: WorkOrderInput) {
  if (!input || typeof input !== "object") throw new ReviewInputError("请求体无效");
  if (!input.citizenAppeal?.trim()) throw new ReviewInputError("市民诉求不能为空");
  if (!input.replyContent?.trim()) throw new ReviewInputError("回单内容不能为空");
}

export interface ReviewServiceResult extends ReviewResult {
  /** 若发生降级(真实 AI 失败回退 mock),此处给出提示 */
  degradedNote?: string;
}

export async function reviewWorkOrder(rawInput: WorkOrderInput): Promise<ReviewServiceResult> {
  validate(rawInput);

  // 工单类型缺省回退「其他」,后续规范查询与规则引擎据此运行
  const input: WorkOrderInput = { ...rawInput, orderType: rawInput.orderType?.trim() || "其他" };

  // 2. 查询规范
  const standard = await getActiveStandard(input.orderType);

  // 3. 本地规则预检
  const ruleFindings = checkRules(input);

  // 4 + 5. AI 主审核 → 复核(内含降级保护)
  const ai = await runFullReview({ input, ruleFindings, standard });

  // 6. 合并
  const result = mergeReview({
    ruleFindings,
    aiOutput: ai.output,
    standard,
    aiMode: ai.mode,
  });

  // 7. 返回
  return { ...result, degradedNote: ai.degraded };
}
