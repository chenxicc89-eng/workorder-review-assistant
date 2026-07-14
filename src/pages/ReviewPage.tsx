import * as React from "react";
import type { WorkOrderInput } from "@/lib/types";
import { WorkOrderForm, EMPTY_INPUT } from "@/components/WorkOrderForm";
import { ReviewResultPanel } from "@/components/ReviewResultPanel";
import { reviewWorkOrder, saveCase, patchCase, type ReviewResponse } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

/**
 * 需在导航标签切换后仍保留的"正在进行的审核"状态。
 * 提升到 App 层持有(App 不随标签切换卸载),故切走再切回内容还在;
 * 整页刷新时 App 重新挂载、内存清空 → 刷新不保留(符合预期)。
 */
export interface ReviewDraft {
  input: WorkOrderInput;
  result: ReviewResponse | null;
  /** 本次已保存的案例 id,用于「标记误判」时直接更新 */
  savedCaseId: string | null;
}

export const EMPTY_REVIEW_DRAFT: ReviewDraft = {
  input: { ...EMPTY_INPUT },
  result: null,
  savedCaseId: null,
};

export function ReviewPage({
  draft,
  onDraftChange,
}: {
  draft: ReviewDraft;
  onDraftChange: React.Dispatch<React.SetStateAction<ReviewDraft>>;
}) {
  const { toast } = useToast();
  const { input, result, savedCaseId } = draft;
  // 保留态的更新器:改写为更新 App 层 draft 的对应字段
  const setInput = (v: WorkOrderInput) => onDraftChange((d) => ({ ...d, input: v }));
  const setResult = (v: ReviewResponse | null) => onDraftChange((d) => ({ ...d, result: v }));
  const setSavedCaseId = (v: string | null) =>
    onDraftChange((d) => ({ ...d, savedCaseId: v }));

  // 瞬时状态(离开页面即应重置)留在本组件内部,不提升。
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // 工单类型改为由识别自动填入;未识别出时按「其他」通用规范处理。
  // 审核 / 保存 / 标记统一用该值,保证一致。
  const effectiveInput = (): WorkOrderInput => ({
    ...input,
    orderType: input.orderType || "其他",
  });

  const runReview = async () => {
    if (!input.citizenAppeal.trim() || !input.replyContent.trim()) {
      toast("请先上传识别或填写市民诉求和回单内容", "error");
      return;
    }
    setLoading(true);
    setError(null);
    setSavedCaseId(null);
    try {
      const res = await reviewWorkOrder(effectiveInput());
      setResult(res);
      if (res.degradedNote) toast(res.degradedNote, "info");
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (finalOpinion: string, humanEdited: boolean) => {
    if (!result) return;
    setSaving(true);
    try {
      const record = await saveCase({
        input: effectiveInput(),
        result,
        finalOpinion: humanEdited ? finalOpinion : undefined,
        humanEdited,
      });
      setSavedCaseId(record.id);
      toast(humanEdited ? "已保存(含人工修改意见)" : "已保存为案例", "success");
    } catch (e) {
      toast(`保存失败:${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkFalsePositive = async () => {
    if (!result) return;
    // 让用户写"错在哪":这条原因会作为历史纠错示例,供以后同类工单审核参考。
    const note = window.prompt(
      "标记为误判。请简述你认为 AI 错在哪(可留空)。\n例:承办单位已在附件补充了处理时间,不应判为退回。",
      ""
    );
    if (note === null) return; // 用户取消
    const falsePositiveNote = note.trim() || undefined;
    setSaving(true);
    try {
      let id = savedCaseId;
      if (!id) {
        // 尚未保存 → 先保存再标记
        const record = await saveCase({ input: effectiveInput(), result });
        id = record.id;
        setSavedCaseId(id);
      }
      await patchCase(id, { isFalsePositive: true, falsePositiveNote });
      toast("已标记为误判,可在历史案例中查看", "success");
    } catch (e) {
      toast(`标记失败:${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* min-w-0:grid item 默认 min-width:auto,会被内部宽内容(如问题明细表)撑破,
          导致移动端整页横向溢出。设 min-w-0 让其遵循列宽,表格改为在自身容器内横向滚动。 */}
      <div className="min-w-0 lg:sticky lg:top-[4.5rem] lg:self-start">
        <WorkOrderForm value={input} onChange={setInput} onSubmit={runReview} loading={loading} />
      </div>
      <div className="min-w-0">
        <ReviewResultPanel
          result={result}
          loading={loading}
          error={error}
          onSave={handleSave}
          onMarkFalsePositive={handleMarkFalsePositive}
          onReReview={runReview}
          saving={saving}
        />
      </div>
    </div>
  );
}
