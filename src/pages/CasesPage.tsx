import * as React from "react";
import type { CaseQuery, PatchCasePayload, RiskLevel, WorkOrderCaseRecord } from "@/lib/types";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";
import { listCases, patchCase } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, riskVariant, conclusionVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyButton } from "@/components/CopyButton";
import { IssueTable } from "@/components/IssueTable";
import { ReviewOpinionBox } from "@/components/ReviewOpinionBox";
import { useToast } from "@/components/ui/toast";
import { Loader2, Search, Flag, FlagOff, Pencil, X } from "lucide-react";

const ALL = "__all__";

export function CasesPage() {
  const { toast } = useToast();
  const [cases, setCases] = React.useState<WorkOrderCaseRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<WorkOrderCaseRecord | null>(null);
  const [falsePositiveTarget, setFalsePositiveTarget] = React.useState<WorkOrderCaseRecord | null>(null);
  const [falsePositiveNote, setFalsePositiveNote] = React.useState("");
  const [markingId, setMarkingId] = React.useState<string | null>(null);

  // 过滤条件
  const [orderType, setOrderType] = React.useState<string>(ALL);
  const [riskLevel, setRiskLevel] = React.useState<string>(ALL);
  const [fpFilter, setFpFilter] = React.useState<string>(ALL);
  const [keyword, setKeyword] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query: CaseQuery = {
        orderType: orderType === ALL ? undefined : orderType,
        riskLevel: riskLevel === ALL ? undefined : (riskLevel as RiskLevel),
        keyword: keyword.trim() || undefined,
        isFalsePositive: fpFilter === ALL ? undefined : fpFilter === "yes",
      };
      const list = await listCases(query);
      setCases(list);
    } catch (e) {
      toast(`加载失败:${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [orderType, riskLevel, fpFilter, keyword, toast]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, riskLevel, fpFilter]);

  const applyFalsePositive = async (
    rec: WorkOrderCaseRecord,
    isFalsePositive: boolean,
    note = ""
  ) => {
    const patch: PatchCasePayload = {
      isFalsePositive,
      falsePositiveNote: isFalsePositive ? note.trim() : "",
    };
    setMarkingId(rec.id);
    try {
      const updated = await patchCase(rec.id, patch);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (detail?.id === updated.id) setDetail(updated);
      toast(updated.isFalsePositive ? "已标记为误判" : "已取消误判标记", "success");
      setFalsePositiveTarget(null);
    } catch (e) {
      toast(`操作失败:${(e as Error).message}`, "error");
    } finally {
      setMarkingId(null);
    }
  };

  const markFalsePositive = (rec: WorkOrderCaseRecord) => {
    setFalsePositiveTarget(rec);
    setFalsePositiveNote(rec.falsePositiveNote || "");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>历史案例</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 过滤栏 */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[9rem] flex-1 sm:w-40 sm:flex-none">
              <label className="mb-1 block text-xs text-muted-foreground">工单类型</label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部类型</SelectItem>
                  {ORDER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[6rem] flex-1 sm:w-28 sm:flex-none">
              <label className="mb-1 block text-xs text-muted-foreground">风险等级</label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  <SelectItem value="高">高</SelectItem>
                  <SelectItem value="中">中</SelectItem>
                  <SelectItem value="低">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[6rem] flex-1 sm:w-28 sm:flex-none">
              <label className="mb-1 block text-xs text-muted-foreground">误判</label>
              <Select value={fpFilter} onValueChange={setFpFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部</SelectItem>
                  <SelectItem value="yes">仅误判</SelectItem>
                  <SelectItem value="no">非误判</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[12rem]">
              <label className="mb-1 block text-xs text-muted-foreground">关键词</label>
              <div className="flex gap-2">
                <Input
                  placeholder="搜索诉求 / 回单 / 评价报告 / 意见 / 单位…"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && load()}
                />
                <Button variant="outline" onClick={load}>
                  <Search /> 搜索
                </Button>
              </div>
            </div>
          </div>

          {/* 列表 */}
          <div className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
              </div>
            ) : cases.length === 0 ? (
              <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                暂无历史案例。可在「工单审核」页审核后保存为案例。
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>工单类型</TableHead>
                    <TableHead>编号</TableHead>
                    <TableHead>结论</TableHead>
                    <TableHead>风险</TableHead>
                    <TableHead className="min-w-[16rem]">审核意见</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-56 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{c.orderType}</TableCell>
                      <TableCell className="text-muted-foreground">{c.orderNo || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={conclusionVariant(c.conclusion)}>{c.conclusion}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={riskVariant(c.riskLevel)}>{c.riskLevel}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[22rem]">
                        <span className="line-clamp-2 text-muted-foreground">
                          {c.finalOpinion || c.reviewOpinion}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {c.isFalsePositive && (
                          <Badge variant="high" className="mr-1">
                            误判
                          </Badge>
                        )}
                        {c.humanEdited && <Badge variant="secondary">已修改</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDetail(c)}>
                            详情
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markFalsePositive(c)}
                            disabled={markingId === c.id}
                            className={c.isFalsePositive ? "text-risk-high" : ""}
                          >
                            {markingId === c.id ? <Loader2 className="animate-spin" /> : c.isFalsePositive ? <Pencil /> : <Flag />}
                            {c.isFalsePositive ? "查看/编辑误判" : "标记误判"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {detail && (
        <CaseDetailModal
          record={detail}
          onClose={() => setDetail(null)}
          onToggleFalsePositive={() => markFalsePositive(detail)}
          marking={markingId === detail.id}
        />
      )}
      {falsePositiveTarget && (
        <FalsePositiveDialog
          record={falsePositiveTarget}
          note={falsePositiveNote}
          onNoteChange={setFalsePositiveNote}
          saving={markingId === falsePositiveTarget.id}
          onClose={() => setFalsePositiveTarget(null)}
          onConfirm={() => void applyFalsePositive(falsePositiveTarget, true, falsePositiveNote)}
          onUnmark={() => {
            if (confirm("确认取消误判标记？取消后该案例不会再作为误判反馈参与学习。")) {
              void applyFalsePositive(falsePositiveTarget, false);
            }
          }}
        />
      )}
    </div>
  );
}

// ---- 案例详情弹窗 ----
function CaseDetailModal({
  record,
  onClose,
  onToggleFalsePositive,
  marking,
}: {
  record: WorkOrderCaseRecord;
  onClose: () => void;
  onToggleFalsePositive: () => void;
  marking: boolean;
}) {
  const finalOpinion = record.finalOpinion || record.reviewOpinion;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="my-3 w-full max-w-4xl rounded-lg border bg-card shadow-xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">案例详情</span>
            <Badge variant={conclusionVariant(record.conclusion)}>{record.conclusion}</Badge>
            <Badge variant={riskVariant(record.riskLevel)}>风险:{record.riskLevel}</Badge>
            {record.isFalsePositive && <Badge variant="high">误判</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleFalsePositive}
              disabled={marking}
              className={record.isFalsePositive ? "text-risk-high" : ""}
            >
              {marking ? <Loader2 className="animate-spin" /> : record.isFalsePositive ? <Pencil /> : <Flag />}
              {record.isFalsePositive ? "查看/编辑误判" : "标记为误判"}
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <div className="max-h-[80vh] space-y-4 overflow-auto p-4 sm:max-h-[75vh]">
          <section className="grid gap-3 sm:grid-cols-2">
            <Field label="工单类型" value={record.orderType} />
            <Field label="工单编号" value={record.orderNo || "—"} />
            <Field label="承办单位" value={record.unit || "—"} />
            <Field
              label="创建时间"
              value={new Date(record.createdAt).toLocaleString("zh-CN", { hour12: false })}
            />
          </section>
          {record.isFalsePositive && record.falsePositiveNote && (
            <Field label="误判说明(错在哪)" value={record.falsePositiveNote} block />
          )}
          <Field label="市民诉求" value={record.citizenAppeal} block />
          <Field label="回单内容" value={record.replyContent} block />
          {record.evaluationReport && (
            <Field label="不计入考核评价报告" value={record.evaluationReport} block />
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">最终审核意见</span>
              <CopyButton text={finalOpinion} toastMessage="最终意见已复制" />
            </div>
            <ReviewOpinionBox opinion={finalOpinion} editable={false} />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-muted-foreground">问题明细</div>
            <IssueTable issues={record.issues} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FalsePositiveDialog({
  record,
  note,
  onNoteChange,
  saving,
  onClose,
  onConfirm,
  onUnmark,
}: {
  record: WorkOrderCaseRecord;
  note: string;
  onNoteChange: (value: string) => void;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUnmark: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Flag className="text-risk-high" />
            {record.isFalsePositive ? "查看 / 编辑误判说明" : "标记为 AI 误判"}
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} disabled={saving}><X /></Button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            工单：{record.orderNo || "未填写编号"} · {record.orderType}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">AI 错在哪里？</label>
            <Textarea
              className="min-h-32"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="例如：承办单位已在附件补充处理时间，不应判定为要素缺失。"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">建议填写具体原因，这将帮助学习中心生成更准确的豁免准则。</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          {record.isFalsePositive && (
            <Button variant="outline" onClick={onUnmark} disabled={saving} className="mr-auto text-risk-high">
              <FlagOff /> 取消误判标记
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : record.isFalsePositive ? <Pencil /> : <Flag />}
            {record.isFalsePositive ? "保存误判说明" : "确认标记为误判"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div
        className={
          block
            ? "whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed"
            : "text-sm"
        }
      >
        {value}
      </div>
    </div>
  );
}
