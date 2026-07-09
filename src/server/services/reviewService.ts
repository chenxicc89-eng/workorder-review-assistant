import type { ReviewResult, WorkOrderInput } from "../../lib/types";
import { checkRules } from "../../lib/ruleEngine";
import { runFullReview } from "../../lib/ai/aiClient";
import type { CorrectionExample } from "../../lib/ai/providers";
import { mergeReview } from "../../lib/reviewMerger";
import { getActiveStandard } from "./standardService";
import { listCases } from "./caseService";

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
// 未提供类型时回退「其他」通用规范,故入参 orderType 可缺省,校验只强制诉求与回单正文。
type ReviewInput = Omit<WorkOrderInput, "orderType"> & { orderType?: string };

function validate(input: ReviewInput) {
  if (!input || typeof input !== "object") throw new ReviewInputError("请求体无效");
  if (!input.citizenAppeal?.trim()) throw new ReviewInputError("市民诉求不能为空");
  if (!input.replyContent?.trim()) throw new ReviewInputError("回单内容不能为空");
}

export interface ReviewServiceResult extends ReviewResult {
  /** 若发生降级(真实 AI 失败回退 mock),此处给出提示 */
  degradedNote?: string;
}

/** 注入审核的历史纠错示例条数上限(过多会拖长 prompt) */
const MAX_CORRECTIONS = 4;
/** 诉求/回单摘要截断长度 */
const SNIPPET_LEN = 200;

function snippet(s: string): string {
  const t = (s || "").trim();
  return t.length > SNIPPET_LEN ? t.slice(0, SNIPPET_LEN) + "…" : t;
}

/**
 * 取当前工单类型下、用户"人工修改过意见"或"标记为误判"的历史案例,
 * 作为 few-shot 纠错示例。任何异常(DB 未配置/查询失败)都静默降级为空数组,
 * 绝不因此拖垮审核主流程。
 */
async function loadCorrections(orderType: string): Promise<CorrectionExample[]> {
  try {
    const cases = await listCases({ orderType });
    return cases
      .filter((c) => c.humanEdited || c.isFalsePositive)
      .slice(0, MAX_CORRECTIONS)
      .map((c) => ({
        citizenAppeal: snippet(c.citizenAppeal),
        replyContent: snippet(c.replyContent),
        aiConclusion: c.conclusion,
        aiRiskLevel: c.riskLevel,
        finalOpinion: c.humanEdited ? c.finalOpinion?.trim() || undefined : undefined,
        isFalsePositive: c.isFalsePositive,
        falsePositiveNote: c.falsePositiveNote?.trim() || undefined,
      }));
  } catch {
    return [];
  }
}

export async function reviewWorkOrder(rawInput: ReviewInput): Promise<ReviewServiceResult> {
  validate(rawInput);

  // 工单类型缺省回退「其他」,后续规范查询与规则引擎据此运行
  const input: WorkOrderInput = { ...rawInput, orderType: rawInput.orderType?.trim() || "其他" };

  // 2. 查询规范
  const standard = await getActiveStandard(input.orderType);

  // 3. 本地规则预检
  const ruleFindings = checkRules(input);

  // 3.5 取历史纠错示例(few-shot),让审核对齐用户过往判定;失败静默降级为空
  const corrections = await loadCorrections(input.orderType);

  // 4 + 5. AI 主审核 → 复核(内含降级保护)
  const ai = await runFullReview({ input, ruleFindings, standard, corrections });

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
