import * as React from "react";
import type { RuleStandard } from "@/lib/types";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";
import {
  listStandards,
  upsertStandard,
  toggleStandard,
  deleteStandard,
  extractStandardsFromText,
  importStandards,
  type StandardListItem,
} from "@/lib/api";
import { isOfficeDoc, officeFilesToText } from "@/lib/utils/docFile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Loader2,
  Plus,
  Save,
  X,
  Power,
  Trash2,
  FileUp,
  ScanText,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

const EMPTY_STANDARD: RuleStandard = {
  id: "",
  orderType: "其他",
  name: "",
  requiredItems: [],
  highRiskIssues: [],
  mediumRiskIssues: [],
  lowRiskIssues: [],
  standardRequirements: [],
  standardOpinionTemplates: [],
};

export function StandardsPage() {
  const { toast } = useToast();
  const [items, setItems] = React.useState<StandardListItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<StandardListItem | "new" | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listStandards());
    } catch (e) {
      toast(`加载失败:${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (item: StandardListItem) => {
    try {
      const updated = await toggleStandard(item.id, !item.enabled);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast(updated.enabled ? "已启用" : "已停用", "success");
    } catch (e) {
      toast(`操作失败:${(e as Error).message}`, "error");
    }
  };

  const handleDelete = async (item: StandardListItem) => {
    if (!confirm(`确认删除规范「${item.name}」?`)) return;
    try {
      await deleteStandard(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast("已删除", "success");
    } catch (e) {
      toast(`删除失败:${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>规范库</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp /> 从模板导入
            </Button>
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> 新增规范
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              规范库为空。请先运行 <code>npm run db:seed</code> 写入默认规范,或点击「新增规范」。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.enabled ? (
                          <Badge variant="pass">启用</Badge>
                        ) : (
                          <Badge variant="secondary">停用</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{item.orderType}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={item.enabled ? "停用" : "启用"}
                        onClick={() => handleToggle(item)}
                      >
                        <Power className={item.enabled ? "text-emerald-600" : ""} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>必备要素:{item.standard.requiredItems.length} 项</p>
                    <p>
                      风险问题:高 {item.standard.highRiskIssues.length} / 中{" "}
                      {item.standard.mediumRiskIssues.length} / 低{" "}
                      {item.standard.lowRiskIssues.length}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => setEditing(item)}
                  >
                    查看 / 编辑
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <StandardEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((prev) => {
              const exists = prev.some((i) => i.id === saved.id);
              return exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved];
            });
            setEditing(null);
            toast("规范已保存", "success");
          }}
        />
      )}

      {importOpen && (
        <StandardImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void load(); // 覆盖导入后重新拉列表(可能新增或更新多条)
          }}
        />
      )}
    </div>
  );
}

// ---- 从模板导入(上传 → 识别 → 预览编辑 → 确认写入) ----
type ImportStage = "upload" | "preview";

function StandardImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = React.useState<ImportStage>("upload");
  const [files, setFiles] = React.useState<File[]>([]);
  const [recognizing, setRecognizing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [drafts, setDrafts] = React.useState<RuleStandard[]>([]);
  const [notes, setNotes] = React.useState<string>("");

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const picked = Array.from(fl).filter((f) => {
      if (!isOfficeDoc(f)) {
        toast(`已跳过不支持的文件:${f.name}(仅支持 .docx/.xlsx/.xls)`, "error");
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...picked].slice(0, 8));
  };

  const recognize = async () => {
    if (!files.length) {
      toast("请先选择模板文件(.docx/.xlsx/.xls)", "error");
      return;
    }
    setRecognizing(true);
    try {
      const text = await officeFilesToText(files); // 前端解析,不上传文件本身
      const result = await extractStandardsFromText(text);
      if (!result.standards.length) {
        toast("未从模板中识别出可用规范,请检查文件内容或改用手动新增。", "info");
        return;
      }
      setDrafts(result.standards);
      setNotes(result.notes ?? "");
      setStage("preview");
    } catch (e) {
      toast(`识别失败:${(e as Error).message}`, "error");
    } finally {
      setRecognizing(false);
    }
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const rows = await importStandards(drafts);
      toast(`已导入 ${rows.length} 条规范(同类型已覆盖)。`, "success");
      onImported();
    } catch (e) {
      toast(`导入失败:${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const setDraftField = <K extends keyof RuleStandard>(
    idx: number,
    key: K,
    value: RuleStandard[K]
  ) => setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="my-3 w-full max-w-3xl rounded-lg border bg-card shadow-xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">从模板导入规范</span>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="max-h-[80vh] space-y-4 overflow-auto p-4 sm:max-h-[75vh]">
          {stage === "upload" ? (
            <>
              <p className="text-sm text-muted-foreground">
                上传「12345 常见回单模板 / 范例」文件(.docx / .xlsx / .xls),系统会从中反推出各工单类型的审核规范,供你核对后写入规范库。文件在本地解析,不会被单独上传保存。
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground hover:border-primary/40">
                <FileUp className="h-6 w-6" />
                点击选择文件(可多选,最多 8 个)
                <input
                  type="file"
                  multiple
                  accept=".docx,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      {f.name.toLowerCase().endsWith(".docx") ? (
                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                      )}
                      <span className="flex-1 truncate">{f.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
                识别到 {drafts.length} 条规范。请核对/编辑后确认写入 ——
                <b>同工单类型的现有规范将被覆盖</b>。
                {notes && <span className="mt-1 block text-muted-foreground">说明:{notes}</span>}
              </div>
              {drafts.map((d, idx) => (
                <div key={idx} className="space-y-3 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>工单类型</Label>
                      {/* 模板可能带来枚举外的新类型(如"计划检修停电"),用可编辑输入而非下拉,
                          既能保留模板字面新类型,也能改成已有类型。 */}
                      <Input
                        list="order-type-options"
                        value={d.orderType}
                        onChange={(e) => setDraftField(idx, "orderType", e.target.value)}
                        placeholder="诉求类型(可沿用模板或改为已有类型)"
                      />
                      <datalist id="order-type-options">
                        {ORDER_TYPES.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <Label>规范名称</Label>
                      <Input
                        value={d.name}
                        onChange={(e) => setDraftField(idx, "name", e.target.value)}
                      />
                    </div>
                  </div>
                  <ImportListField
                    label="必须包含要素 / 佐证材料"
                    value={d.requiredItems}
                    onChange={(v) => setDraftField(idx, "requiredItems", v)}
                  />
                  <ImportListField
                    label="规范要求 / 法律依据"
                    value={d.standardRequirements}
                    onChange={(v) => setDraftField(idx, "standardRequirements", v)}
                  />
                  <ImportListField
                    label="豁免准则(不计入评价 / 不计入材料口径 → 满足即不报问题)"
                    value={d.learnedExemptions ?? []}
                    onChange={(v) => setDraftField(idx, "learnedExemptions", v)}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ImportListField
                      label="高风险问题"
                      value={d.highRiskIssues}
                      onChange={(v) => setDraftField(idx, "highRiskIssues", v)}
                    />
                    <ImportListField
                      label="中风险问题"
                      value={d.mediumRiskIssues}
                      onChange={(v) => setDraftField(idx, "mediumRiskIssues", v)}
                    />
                    <ImportListField
                      label="低风险问题"
                      value={d.lowRiskIssues}
                      onChange={(v) => setDraftField(idx, "lowRiskIssues", v)}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          {stage === "upload" ? (
            <>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button onClick={recognize} disabled={recognizing || !files.length}>
                {recognizing ? <Loader2 className="animate-spin" /> : <ScanText />}
                识别
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStage("upload")} disabled={saving}>
                返回
              </Button>
              <Button onClick={confirm} disabled={saving || !drafts.length}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                确认写入({drafts.length})
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 导入预览里的多行文本↔数组小字段(与编辑器 listField 同款,独立以免耦合) */
function ImportListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}(每行一条)</Label>
      <Textarea
        className="min-h-[72px] text-sm"
        value={(value ?? []).join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
      />
    </div>
  );
}

// ---- 规范编辑器 ----
function StandardEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: StandardListItem | null;
  onClose: () => void;
  onSaved: (item: StandardListItem) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<RuleStandard>(
    initial ? initial.standard : { ...EMPTY_STANDARD }
  );
  const enabled = initial?.enabled ?? true;

  const setField = <K extends keyof RuleStandard>(k: K, v: RuleStandard[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // 多行文本 <-> 数组
  const listField = (
    label: string,
    key:
      | "requiredItems"
      | "highRiskIssues"
      | "mediumRiskIssues"
      | "lowRiskIssues"
      | "standardRequirements"
      | "standardOpinionTemplates"
  ) => (
    <div className="space-y-1.5">
      <Label>{label}(每行一条)</Label>
      <Textarea
        className="min-h-[90px] text-sm"
        value={(form[key] ?? []).join("\n")}
        onChange={(e) =>
          setField(
            key,
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
      />
    </div>
  );

  const save = async () => {
    if (!form.name.trim()) {
      toast("请填写规范名称", "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertStandard({
        id: initial?.id,
        orderType: form.orderType,
        name: form.name,
        standard: form,
        enabled,
      });
      onSaved(saved);
    } catch (e) {
      toast(`保存失败:${(e as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div
        className="my-3 w-full max-w-3xl rounded-lg border bg-card shadow-xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">{initial ? "编辑规范" : "新增规范"}</span>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="max-h-[80vh] space-y-4 overflow-auto p-4 sm:max-h-[75vh]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>工单类型</Label>
              <Select value={form.orderType} onValueChange={(v) => setField("orderType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>规范名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="例如:突发故障停电回单规范"
              />
            </div>
          </div>

          {listField("必须包含要素", "requiredItems")}
          {listField("高风险问题", "highRiskIssues")}
          {listField("中风险问题", "mediumRiskIssues")}
          {listField("低风险问题", "lowRiskIssues")}
          {listField("规范要求", "standardRequirements")}
          {listField("审核意见模板", "standardOpinionTemplates")}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
