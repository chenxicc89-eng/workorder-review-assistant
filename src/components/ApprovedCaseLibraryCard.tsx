import * as React from "react";
import { Check, ChevronDown, ChevronRight, Database, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import type { ApprovedCaseRecord, ImportBatchRecord } from "@/lib/types";
import {
  deleteApprovedCase,
  deleteApprovedImportBatch,
  listApprovedCases,
  listApprovedImportBatches,
  updateApprovedCaseOrderType,
  bulkUpdateApprovedCaseOrderType,
  bulkDeleteApprovedCases,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";

export function ApprovedCaseLibraryCard({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const [cases, setCases] = React.useState<ApprovedCaseRecord[]>([]);
  const [batches, setBatches] = React.useState<ImportBatchRecord[]>([]);
  const [batchId, setBatchId] = React.useState("all");
  const [orderType, setOrderType] = React.useState("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingType, setEditingType] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = React.useState("");
  const [bulkUpdating, setBulkUpdating] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);

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
      const visibleIds = new Set(caseRows.map((row) => row.id));
      setSelectedIds((prev) => new Set(Array.from(prev).filter((id) => visibleIds.has(id))));
    } catch (e) {
      toast(`样本加载失败：${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [batchId, orderType, toast]);

  React.useEffect(() => { void load(); }, [load]);

  const types = React.useMemo(
    () => Array.from(new Set([...ORDER_TYPES, ...cases.map((item) => item.orderType)])).sort(),
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

  const saveType = async (item: ApprovedCaseRecord) => {
    if (!editingType.trim()) return toast("请选择或填写工单类型", "error");
    setDeleting(item.id);
    try {
      const updated = await updateApprovedCaseOrderType(item.id, editingType);
      setCases((prev) => prev.map((row) => row.id === item.id ? updated : row));
      setEditingId(null);
      toast("工单类型已更新，请按新类型重新生成候选准则", "success");
      onChanged();
    } catch (e) {
      toast(`修改失败：${(e as Error).message}`, "error");
    } finally { setDeleting(null); }
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(cases.map((item) => item.id)) : new Set());
  };

  const saveBulkType = async () => {
    if (!selectedIds.size) return toast("请先选择需要修改的工单", "error");
    if (!bulkType.trim()) return toast("请选择或填写目标工单类型", "error");
    setBulkUpdating(true);
    try {
      const result = await bulkUpdateApprovedCaseOrderType(Array.from(selectedIds), bulkType);
      toast(`已将 ${result.updatedCount} 条工单修改为「${bulkType.trim()}」`, "success");
      setSelectedIds(new Set());
      setBulkType("");
      await load();
      onChanged();
    } catch (e) {
      toast(`批量修改失败：${(e as Error).message}`, "error");
    } finally { setBulkUpdating(false); }
  };

  const removeSelected = async () => {
    if (!selectedIds.size) return toast("请先选择需要删除的工单", "error");
    const count = selectedIds.size;
    if (!confirm(`确认删除选中的 ${count} 条已通过工单？\n\n删除后无法恢复，相关待审候选中的来源引用也会同步清理。`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await bulkDeleteApprovedCases(ids);
      if (expandedId && selectedIds.has(expandedId)) setExpandedId(null);
      setSelectedIds(new Set());
      toast(`已删除 ${result.deletedCount} 条工单样本`, "success");
      await load();
      onChanged();
    } catch (e) {
      toast(`批量删除失败：${(e as Error).message}`, "error");
    } finally { setBulkDeleting(false); }
  };

  const allSelected = cases.length > 0 && cases.every((item) => selectedIds.has(item.id));

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
        <datalist id="library-order-type-options">
          {types.map((type) => <option key={type} value={type} />)}
        </datalist>
        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
            <span className="shrink-0 text-sm font-medium">已选择 {selectedIds.size} 条</span>
            <Input
              className="sm:max-w-xs"
              list="library-order-type-options"
              value={bulkType}
              placeholder="选择已有类型或输入新类型"
              onChange={(e) => setBulkType(e.target.value)}
            />
            <Button size="sm" onClick={() => void saveBulkType()} disabled={bulkUpdating || bulkDeleting}>
              {bulkUpdating ? <Loader2 className="animate-spin" /> : <Check />} 批量修改类型
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void removeSelected()} disabled={bulkUpdating || bulkDeleting}>
              {bulkDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />} 批量删除
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkUpdating || bulkDeleting}>取消选择</Button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : cases.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无已导入工单。</div>
        ) : (
          <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="全选当前列表"
                    className="h-4 w-4 accent-primary"
                  />
                </TableHead>
                <TableHead>工单编号</TableHead><TableHead>类型</TableHead><TableHead>资料</TableHead>
                <TableHead>导入批次</TableHead><TableHead>导入时间</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>{cases.map((item) => {
                const expanded = expandedId === item.id;
                return <React.Fragment key={item.id}>
                  <TableRow>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => toggleOne(item.id, e.target.checked)}
                        aria-label={`选择工单 ${item.orderNo}`}
                        className="h-4 w-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.orderNo}</TableCell>
                    <TableCell>
                      {editingId === item.id ? (
                        <Input
                          className="min-w-36"
                          list="library-order-type-options"
                          value={editingType}
                          placeholder="选择或输入新类型"
                          onChange={(e) => setEditingType(e.target.value)}
                        />
                      ) : (
                        <span className={item.orderType === "其他" ? "text-risk-medium" : ""}>{item.orderType}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">工单✓ 回单✓ 报告{item.evaluationReport ? "✓" : "—"}</TableCell>
                    <TableCell className="max-w-52 truncate text-xs">{batchMap.get(item.batchId)?.name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(item.createdAt).toLocaleString()}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      {editingId === item.id ? <>
                        <Button size="sm" variant="ghost" onClick={() => void saveType(item)} disabled={deleting === item.id}>
                          {deleting === item.id ? <Loader2 className="animate-spin" /> : <Check />} 保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X /> 取消</Button>
                      </> : (
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(item.id); setEditingType(item.orderType === "其他" ? "" : item.orderType); }}>
                          <Pencil /> 改类型
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : item.id)}>
                        {expanded ? <ChevronDown /> : <ChevronRight />} {expanded ? "收起" : "查看"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void removeCase(item)} disabled={deleting === item.id}>
                        {deleting === item.id ? <Loader2 className="animate-spin" /> : <Trash2 />} 删除
                      </Button>
                    </div></TableCell>
                  </TableRow>
                  {expanded && <TableRow>
                    <TableCell colSpan={7} className="bg-muted/20">
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
