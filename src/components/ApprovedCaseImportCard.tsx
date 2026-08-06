import * as React from "react";
import { FileSpreadsheet, Download, Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { importApprovedCases, listApprovedImportBatches } from "@/lib/api";
import type { ImportBatchRecord } from "@/lib/types";
import {
  downloadApprovedCaseTemplate,
  parseApprovedCaseWorkbook,
  type ApprovedCasePreview,
} from "@/lib/utils/approvedCaseFile";

export function ApprovedCaseImportCard({ onImported }: { onImported: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [rows, setRows] = React.useState<ApprovedCasePreview[]>([]);
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [batches, setBatches] = React.useState<ImportBatchRecord[]>([]);

  const loadBatches = React.useCallback(() => {
    listApprovedImportBatches().then(setBatches).catch(() => undefined);
  }, []);
  React.useEffect(loadBatches, [loadBatches]);

  const choose = async (picked?: File) => {
    if (!picked) return;
    setFile(picked);
    setParsing(true);
    try {
      setRows(await parseApprovedCaseWorkbook(picked));
    } catch (e) {
      setRows([]);
      toast((e as Error).message, "error");
    } finally {
      setParsing(false);
    }
  };

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.length - valid.length;
  const confirm = async () => {
    if (!file || valid.length < 1) {
      toast("至少需要一条校验通过的工单", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await importApprovedCases({
        name: `${file.name} 导入`,
        fileName: file.name,
        rows: valid.map((r) => r.value),
      });
      toast(`已导入 ${result.batch.importedRows} 条已通过工单`, "success");
      setFile(null);
      setRows([]);
      loadBatches();
      onImported();
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">批量导入已通过工单</CardTitle>
        </div>
        <Button size="sm" variant="outline" onClick={() => void downloadApprovedCaseTemplate()}>
          <Download /> 下载字段模板
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Excel 每行一单。必填：工单编号、工单类型、工单内容、工单回复内容；“不计入考核评价报告”和承办单位可选。
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm hover:border-primary/60 hover:bg-primary/5">
          {parsing ? <Loader2 className="animate-spin" /> : <Upload />}
          {file ? file.name : "选择 .xlsx / .xls 文件"}
          <input
            className="hidden"
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="pass"><CheckCircle2 /> 可导入 {valid.length}</Badge>
              {invalid > 0 && <Badge variant="high"><AlertTriangle /> 需处理 {invalid}</Badge>}
              <span className="text-muted-foreground">有问题的行不会导入，请修改 Excel 后重新选择。</span>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>行</TableHead><TableHead>工单编号</TableHead><TableHead>类型</TableHead>
                  <TableHead>资料状态</TableHead><TableHead>校验</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((row) => (
                    <TableRow key={`${row.rowNo}-${row.value.orderNo}`}>
                      <TableCell>{row.rowNo}</TableCell>
                      <TableCell className="max-w-40 break-all">{row.value.orderNo || "—"}</TableCell>
                      <TableCell>{row.value.orderType || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        工单✓ 回单✓ 报告{row.value.evaluationReport ? "✓" : "—"}
                      </TableCell>
                      <TableCell className={row.errors.length ? "text-risk-high" : "text-emerald-600"}>
                        {row.errors.join("；") || "通过"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={confirm} disabled={saving || valid.length < 1}>
              {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              确认导入 {valid.length} 条
            </Button>
          </>
        )}

        {batches.length > 0 && (
          <div className="border-t pt-3 text-xs text-muted-foreground">
            最近导入：{batches.slice(0, 3).map((b) => `${b.name}（${b.importedRows}条）`).join("；")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
