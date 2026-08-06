import * as React from "react";
import { History, Loader2, RotateCcw, X, FlaskConical } from "lucide-react";
import type { RuleStandard, StandardVersionRecord, StandardEvaluation } from "@/lib/types";
import type { StandardListItem } from "@/lib/api";
import { listStandardVersions, rollbackStandardVersion, evaluateStandardVersions } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

const fields: { key: keyof RuleStandard; label: string }[] = [
  { key: "requiredItems", label: "必备要素" },
  { key: "standardRequirements", label: "规范要求" },
  { key: "highRiskIssues", label: "高风险" },
  { key: "mediumRiskIssues", label: "中风险" },
  { key: "lowRiskIssues", label: "低风险" },
  { key: "learnedRules", label: "学习加强" },
  { key: "learnedExemptions", label: "学习豁免" },
];

function listValue(standard: RuleStandard, key: keyof RuleStandard): string[] {
  const value = standard[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function diff(current: RuleStandard, previous?: RuleStandard) {
  if (!previous) return [];
  return fields.flatMap(({ key, label }) => {
    const now = listValue(current, key);
    const before = listValue(previous, key);
    const added = now.filter((item) => !before.includes(item));
    const removed = before.filter((item) => !now.includes(item));
    return added.length || removed.length ? [{ label, added, removed }] : [];
  });
}

const sourceLabel: Record<StandardVersionRecord["source"], string> = {
  manual: "人工编辑",
  template_import: "模板导入",
  learning: "学习中心",
  rollback: "版本回滚",
};

export function StandardVersionDialog({
  item,
  onClose,
  onRolledBack,
}: {
  item: StandardListItem;
  onClose: () => void;
  onRolledBack: (item: StandardListItem) => void;
}) {
  const { toast } = useToast();
  const [versions, setVersions] = React.useState<StandardVersionRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [evaluating, setEvaluating] = React.useState(false);
  const [evaluation, setEvaluation] = React.useState<StandardEvaluation | null>(null);

  React.useEffect(() => {
    listStandardVersions(item.id)
      .then(setVersions)
      .catch((e) => toast(`版本加载失败：${(e as Error).message}`, "error"))
      .finally(() => setLoading(false));
  }, [item.id, toast]);

  const rollback = async (version: StandardVersionRecord) => {
    if (!confirm(`确认回滚到 V${version.version}？当前规范会自动保留为历史版本。`)) return;
    setBusy(version.id);
    try {
      const updated = await rollbackStandardVersion(version.id);
      toast(`已回滚到 V${version.version}`, "success");
      onRolledBack(updated);
    } catch (e) {
      toast(`回滚失败：${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const evaluate = async () => {
    setEvaluating(true);
    try {
      setEvaluation(await evaluateStandardVersions(item.id));
    } catch (e) {
      toast(`评估失败：${(e as Error).message}`, "error");
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-lg border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 font-semibold"><History /> {item.name} · 版本历史</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={evaluate} disabled={evaluating || versions.length < 2}>
              {evaluating ? <Loader2 className="animate-spin" /> : <FlaskConical />} 样本回放评估
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose}><X /></Button>
          </div>
        </div>
        <div className="max-h-[72vh] space-y-3 overflow-auto p-4">
          {evaluation && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <b>V{evaluation.previousVersion} → V{evaluation.currentVersion}，回放 {evaluation.sampleCount} 条已通过样本</b>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <div>旧版：通过 {evaluation.before.passCount}/{evaluation.sampleCount}，识别问题 {evaluation.before.issueCount}</div>
                <div>新版：通过 {evaluation.after.passCount}/{evaluation.sampleCount}，识别问题 {evaluation.after.issueCount}</div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">已通过样本通过率下降通常意味着新规则可能过严，应结合候选证据人工复核。</p>
            </div>
          )}
          {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div> :
            versions.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                暂无版本快照。下一次保存、模板导入或采纳学习规则时会自动生成。
              </div>
            ) : versions.map((version, index) => {
              const changes = diff(version.standard, versions[index + 1]?.standard);
              return (
                <div key={version.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <b>V{version.version}</b>
                        {index === 0 && <Badge variant="pass">当前</Badge>}
                        <Badge variant="secondary">{sourceLabel[version.source] || version.source}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString()} {version.note ? `· ${version.note}` : ""}
                      </p>
                    </div>
                    {index !== 0 && (
                      <Button size="sm" variant="outline" onClick={() => rollback(version)} disabled={busy === version.id}>
                        {busy === version.id ? <Loader2 className="animate-spin" /> : <RotateCcw />} 回滚
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {changes.length === 0 ? <span className="text-muted-foreground">首个快照或无字段变化</span> : changes.map((change) => (
                      <div key={change.label}>
                        <span className="font-medium">{change.label}：</span>
                        {change.added.length > 0 && <span className="text-emerald-600"> +{change.added.length}</span>}
                        {change.removed.length > 0 && <span className="text-risk-high"> -{change.removed.length}</span>}
                        <div className="text-muted-foreground">
                          {change.added.slice(0, 2).map((x) => `新增「${x}」`).join("；")}
                          {change.added.length && change.removed.length ? "；" : ""}
                          {change.removed.slice(0, 2).map((x) => `移除「${x}」`).join("；")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
