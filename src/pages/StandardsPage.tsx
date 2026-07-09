import * as React from "react";
import type { RuleStandard } from "@/lib/types";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";
import {
  listStandards,
  upsertStandard,
  toggleStandard,
  deleteStandard,
  type StandardListItem,
} from "@/lib/api";
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
import { Loader2, Plus, Save, X, Power, Trash2 } from "lucide-react";

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
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> 新增规范
          </Button>
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
