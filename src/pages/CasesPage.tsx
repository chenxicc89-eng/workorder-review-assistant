import * as React from "react";
import type { CaseQuery, RiskLevel, WorkOrderCaseRecord } from "@/lib/types";
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
import { Loader2, Search, Flag, X } from "lucide-react";

const ALL = "__all__";

export function CasesPage() {
  const { toast } = useToast();
  const [cases, setCases] = React.useState<WorkOrderCaseRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<WorkOrderCaseRecord | null>(null);

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

  const markFalsePositive = async (rec: WorkOrderCaseRecord) => {
    try {
      const updated = await patchCase(rec.id, { isFalsePositive: !rec.isFalsePositive });
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (detail?.id === updated.id) setDetail(updated);
      toast(updated.isFalsePositive ? "已标记为误判" : "已取消误判标记", "success");
    } catch (e) {
      toast(`操作失败:${(e as Error).message}`, "error");
    }
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
                  placeholder="搜索诉求 / 回单 / 意见 / 单位…"
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
                    <TableHead className="w-40 text-right">操作</TableHead>
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
                            variant="ghost"
                            onClick={() => markFalsePositive(c)}
                            title="标记/取消误判"
                          >
                            <Flag />
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

      {detail && <CaseDetailModal record={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ---- 案例详情弹窗 ----
function CaseDetailModal({
  record,
  onClose,
}: {
  record: WorkOrderCaseRecord;
  onClose: () => void;
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
          <Button size="icon" variant="ghost" onClick={onClose} className="shrink-0">
            <X />
          </Button>
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
          <Field label="市民诉求" value={record.citizenAppeal} block />
          <Field label="回单内容" value={record.replyContent} block />

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
