import * as React from "react";
import { Files, Loader2, ScanText, Upload, X, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { getHealth, importApprovedCases, listApprovedOrderTypes } from "@/lib/api";
import { recognizeAndPairMaterials, type MaterialPairPreview } from "@/lib/utils/materialPairing";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";

const MAX_MATERIAL_FILES = 100;

export function MultiMaterialImportCard({ onImported }: { onImported: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);
  const [rows, setRows] = React.useState<MaterialPairPreview[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const [knownTypes, setKnownTypes] = React.useState<string[]>([...ORDER_TYPES]);

  React.useEffect(() => {
    listApprovedOrderTypes()
      .then((types) => setKnownTypes(Array.from(new Set([...ORDER_TYPES, ...types]))))
      .catch(() => undefined);
  }, [open]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((file) =>
      /\.(docx|xlsx|xls|pdf|png|jpe?g|webp)$/i.test(file.name)
    );
    const health = await getHealth().catch(() => null);
    if (picked.some((file) => /\.(pdf|png|jpe?g|webp)$/i.test(file.name)) && !health?.supportsVision) {
      toast("图片/PDF 需要先配置视觉模型；Word/Excel 仍可使用", "error");
    }
    setFiles((prev) => {
      const merged = [...prev, ...picked];
      if (merged.length > MAX_MATERIAL_FILES) {
        toast(`单次最多选择 ${MAX_MATERIAL_FILES} 个文件，超出部分未添加`, "info");
      }
      return merged.slice(0, MAX_MATERIAL_FILES);
    });
  };

  const recognize = async () => {
    if (files.length < 1) return toast("请至少选择一个资料文件", "error");
    setBusy(true);
    try {
      const result = await recognizeAndPairMaterials(files, (done, total, name) =>
        setProgress(`${done}/${total} · ${name}`)
      );
      setRows(result);
      toast(`识别完成，归并为 ${result.length} 条工单`, "success");
    } catch (e) {
      toast(`识别失败：${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const update = (index: number, key: "orderNo" | "orderType", value: string) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const marker = key === "orderNo" ? "工单编号" : "工单类型";
      const errors = row.errors.filter((error) => !error.includes(marker));
      if (!value.trim()) errors.push(key === "orderNo" ? "未识别工单编号" : "未识别工单类型，请选择或输入新类型");
      return { ...row, value: { ...row.value, [key]: value }, errors };
    }));
  };

  const valid = rows.filter((row) => row.errors.length === 0);
  const save = async () => {
    if (valid.length < 1) return toast("至少需要一条完整配对的工单", "error");
    setSaving(true);
    try {
      await importApprovedCases({
        name: `多资料智能配对（${files.length}个文件）`,
        fileName: files.map((file) => file.name).join("; ").slice(0, 300),
        rows: valid.map((row) => row.value),
      });
      toast(`已导入 ${valid.length} 条配对工单`, "success");
      setFiles([]); setRows([]); setOpen(false); onImported();
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, "error");
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2"><Files className="h-5 w-5 text-primary" /><CardTitle className="text-base">多文件智能配对</CardTitle></div>
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>{open ? "收起" : "开始配对"}</Button>
      </CardHeader>
      {open && <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">支持 Word、Excel、PDF、图片。Excel 台账会按“工单编号 / 受理内容 / 处理情况”等表头逐行读取，不受整表 10 万字符限制；其他资料按工单编号自动归并。</p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-5 text-sm hover:border-primary/50">
          <Upload /> 选择资料文件（最多{MAX_MATERIAL_FILES}个）
          <input className="hidden" type="file" multiple accept=".docx,.xlsx,.xls,.pdf,image/*" onChange={(e) => void addFiles(e.target.files)} />
        </label>
        {files.length > 0 && <div className="flex flex-wrap gap-1.5">{files.map((file, index) => <span key={`${file.name}-${index}`} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">{file.name}<button onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}><X className="h-3 w-3" /></button></span>)}</div>}
        <Button onClick={recognize} disabled={busy || files.length < 1}>{busy ? <Loader2 className="animate-spin" /> : <ScanText />}{busy ? `识别中 ${progress}` : "识别并自动配对"}</Button>
        {rows.length > 0 && <>
          {rows.some((row) => !row.value.orderType) && (
            <div className="rounded-md border border-risk-medium/40 bg-risk-medium/10 px-3 py-2 text-xs text-risk-medium">
              部分工单无法判断类型，请在“类型”栏选择已有类型或直接输入新类型；填写后才能导入。
            </div>
          )}
          <datalist id="approved-order-type-options">
            {knownTypes.map((type) => <option key={type} value={type} />)}
          </datalist>
          <div className="max-h-80 overflow-auto rounded-md border"><Table>
            <TableHeader><TableRow><TableHead>来源文件</TableHead><TableHead>工单编号</TableHead><TableHead>类型</TableHead><TableHead>资料</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row, index) => <TableRow key={`${row.key}-${index}`}>
              <TableCell className="max-w-48 text-xs">{row.files.join("；")}</TableCell>
              <TableCell><Input className="min-w-36" value={row.value.orderNo} onChange={(e) => update(index, "orderNo", e.target.value)} /></TableCell>
              <TableCell>
                <Input
                  className={!row.value.orderType ? "min-w-36 border-risk-medium" : "min-w-36"}
                  list="approved-order-type-options"
                  value={row.value.orderType}
                  placeholder="选择或输入新类型"
                  onChange={(e) => update(index, "orderType", e.target.value)}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs">工单{row.value.citizenAppeal ? "✓" : "—"} 回单{row.value.replyContent ? "✓" : "—"} 报告{row.value.evaluationReport ? "✓" : "—"}</TableCell>
              <TableCell className={row.errors.length ? "text-risk-high" : "text-emerald-600"}>{row.errors.join("；") || "可导入"}</TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
          <Button onClick={save} disabled={saving || valid.length < 1}>{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}确认导入 {valid.length} 条</Button>
        </>}
      </CardContent>}
    </Card>
  );
}
