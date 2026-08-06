import * as React from "react";
import { ChevronDown, ChevronRight, Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { ApprovedCaseRecord, ImportBatchRecord } from "@/lib/types";
import {
  deleteApprovedCase,
  deleteApprovedImportBatch,
  listApprovedCases,
  listApprovedImportBatches,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

export function ApprovedCaseLibraryCard({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [cases, setCases] = React.useState<ApprovedCaseRecord[]>([]);
  const [batches, setBatches] = React.useState<ImportBatchRecord[]>([]);
  const [batchId, setBatchId] = React.useState("all");
  const [orderType, setOrderType] = React.useState("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [caseRows, batchRows] = await Promise.all([
        listApprovedCases({
          batchId: batchId === "all" ? undefined : batchId,
          orderType: orderType === "all" ? undefined : orderType,
        }),
        listApprovedImportBatches(),
      ]);
      setCases(caseRows);
      setBatches(batchRows);
    } catch (e) {
      toast(`样本加载失败：${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [batchId, orderType, toast]);

  React.useEffect(() => { void load(); }, [load]);

  const types = React.useMemo(
    () => Array.from(new Set(cases.map((item) => item.orderType))).sort(),
    [cases]
  );
  const batchMap = React.useMemo(
    () => new Map(batches.map((batch) => [batch.id, batch])),
    [batches]
  );

  const removeCase = async (item: ApprovedCaseRecord) => {
    if (!confirm(`确认删除已通过工单「${item.orderNo}」？尚未采纳候选中的来源引用也会同步清理。`)) return;
    setDeleting(item.id);
    try {
      await deleteApprovedCase(item.id);
      toast("工单样本已删除", "success");
      setExpandedId(null);
      await load();
      onChanged();
    } catch (e) {
      toast(`删除失败：${(e as Error).message}`, "error");
    } finally { setDeleting(null); }
  };

  const removeBatch = async () => {
    if (batchId === "all") return;
    const batch = batchMap.get(batchId);
    if (!confirm(`确认删除批次「${batch?.name || batchId}」及其中全部工单？`)) return;
    setDeleting(batchId);
    try {
      await deleteApprovedImportBatch(batchId);
      toast("导入批次已删除", "success");
      setBatchId("all");
      setExpandedId(null);
      onChanged();
    } catch (e) {
      toast(`删除批次失败：${(e as Error).message}`, "error");
    } finally { setDeleting(null); }
  };

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">已通过工单样本库</CardTitle>
          <Badge variant="secondary">{cases.length} 条</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger className="w-[210px]"><SelectValue placeholder="全部导入批次" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部导入批次</SelectItem>
              {batches.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={orderType} onValueChange={setOrderType}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="全部类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              {types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          {batchId !== "all" && (
            <Button size="sm" variant="outline" onClick={removeBatch} disabled={deleting === batchId}>
              <Trash2 /> 删除整批
            </Button>
          )}
          <Button size="icon" variant="ghost" title="刷新" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : cases.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无已导入工单。</div>
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>工单编号</TableHead><TableHead>类型</TableHead><TableHead>资料</TableHead>
                <TableHead>导入批次</TableHead><TableHead>导入时间</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>{cases.map((item) => {
                const expanded = expandedId === item.id;
                return <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell className="font-medium">{item.orderNo}</TableCell>
                    <TableCell>{item.orderType}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">工单✓ 回单✓ 报告{item.evaluationReport ? "✓" : "—"}</TableCell>
                    <TableCell className="max-w-52 truncate text-xs">{batchMap.get(item.batchId)?.name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(item.createdAt).toLocaleString()}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : item.id)}>
                        {expanded ? <ChevronDown /> : <ChevronRight />} {expanded ? "收起" : "查看"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeCase(item)} disabled={deleting === item.id}>
                        {deleting === item.id ? <Loader2 className="animate-spin" /> : <Trash2 />} 删除
                      </Button>
                    </div></TableCell>
                  </TableRow>
                  {expanded && <TableRow>
                    <TableCell colSpan={6} className="bg-muted/20">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <MaterialBlock title="工单内容" text={item.citizenAppeal} />
                        <MaterialBlock title="工单回复内容" text={item.replyContent} />
                        <MaterialBlock title="不计入考核评价报告" text={item.evaluationReport || "未上传"} muted={!item.evaluationReport} />
                      </div>
                      {(item.unit || item.sourceFile) && <p className="mt-2 text-xs text-muted-foreground">承办单位：{item.unit || "—"} · 来源：{item.sourceFile || "—"}</p>}
                    </TableCell>
                  </TableRow>}
                </React.Fragment>;
              })}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialBlock({ title, text, muted = false }: { title: string; text: string; muted?: boolean }) {
  return <div className="rounded-md border bg-card p-3">
    <b className="text-sm">{title}</b>
    <pre className={`mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed ${muted ? "text-muted-foreground" : "text-foreground"}`}>{text}</pre>
  </div>;
}
