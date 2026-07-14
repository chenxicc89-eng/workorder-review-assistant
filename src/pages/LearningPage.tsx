import * as React from "react";
import type { LearnedRuleRecord } from "@/lib/types";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";
import {
  generateLearnedCandidates,
  listLearnedRules,
  adoptLearnedRule,
  rejectLearnedRule,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Loader2, Sparkles, Check, X, Undo2, GraduationCap } from "lucide-react";

// ==========================================================================
// 学习中心(Tier3):把历史反馈蒸馏为候选常驻规则,人工采纳后写入生效规范。
// - 选类型 →「生成候选准则」触发离线蒸馏;
// - pending 候选:加强(reinforce)/ 豁免(exempt),可采纳 / 驳回;
// - adopted 已采纳:已写入规范、正在影响每一次审核,可撤回。
// 采纳是唯一写入生效规范的入口,且必须人工点击 —— 系统绝不自动改规范。
// ==========================================================================

function kindBadge(kind: LearnedRuleRecord["kind"]) {
  return kind === "reinforce" ? (
    <Badge variant="high">加强</Badge>
  ) : (
    <Badge variant="pass">豁免</Badge>
  );
}

export function LearningPage() {
  const { toast } = useToast();
  const [orderType, setOrderType] = React.useState<string>(ORDER_TYPES[0]);
  const [rules, setRules] = React.useState<LearnedRuleRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // 只看 pending / adopted(rejected 不展示,避免噪音)
      const [pending, adopted] = await Promise.all([
        listLearnedRules({ orderType, status: "pending" }),
        listLearnedRules({ orderType, status: "adopted" }),
      ]);
      setRules([...pending, ...adopted]);
    } catch (e) {
      toast(`加载失败:${(e as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [orderType, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const created = await generateLearnedCandidates(orderType);
      if (created.length === 0) {
        toast("未发现新的可提炼准则(可能已提炼或反馈信号不足)。", "info");
      } else {
        toast(`已生成 ${created.length} 条候选准则,请审核采纳。`, "success");
      }
      await load();
    } catch (e) {
      toast(`生成失败:${(e as Error).message}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleAdopt = async (rule: LearnedRuleRecord) => {
    setBusyId(rule.id);
    try {
      await adoptLearnedRule(rule.id);
      toast("已采纳,该准则已写入生效规范。", "success");
      await load();
    } catch (e) {
      toast(`采纳失败:${(e as Error).message}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (rule: LearnedRuleRecord, adopted: boolean) => {
    setBusyId(rule.id);
    try {
      await rejectLearnedRule(rule.id);
      toast(adopted ? "已撤回,该准则已从规范移除。" : "已驳回。", "success");
      await load();
    } catch (e) {
      toast(`操作失败:${(e as Error).message}`, "error");
    } finally {
      setBusyId(null);
    }
  };

  const pending = rules.filter((r) => r.status === "pending");
  const adopted = rules.filter((r) => r.status === "adopted");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <CardTitle>学习中心</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="w-[140px]">
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
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              生成候选准则
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          从「{orderType}」的历史人工纠错(误判 / 人工改意见)中提炼可长期复用的审核准则。
          <b className="text-foreground">加强准则</b>补 AI 漏报、<b className="text-foreground">豁免准则</b>止 AI 误报;
          采纳后即写入生效规范、影响此后每一次审核,且不占用示例预算 —— 反馈由此被永久记住。
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : (
        <>
          {/* 待审候选 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">待审候选({pending.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  暂无候选。点击「生成候选准则」从历史反馈中提炼。
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((r) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      busy={busyId === r.id}
                      onAdopt={() => handleAdopt(r)}
                      onReject={() => handleReject(r, false)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 已采纳(生效中) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">已采纳 · 生效中({adopted.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {adopted.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  暂无已采纳准则。采纳后的准则会出现在这里,并影响此后每一次同类审核。
                </div>
              ) : (
                <div className="space-y-3">
                  {adopted.map((r) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      adopted
                      busy={busyId === r.id}
                      onReject={() => handleReject(r, true)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  adopted = false,
  busy,
  onAdopt,
  onReject,
}: {
  rule: LearnedRuleRecord;
  adopted?: boolean;
  busy: boolean;
  onAdopt?: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {kindBadge(rule.kind)}
            {rule.riskLevel && (
              <Badge
                variant={rule.riskLevel === "高" ? "high" : rule.riskLevel === "中" ? "medium" : "low"}
              >
                {rule.riskLevel}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              支撑 {rule.supportingCaseIds.length} 例 · 置信度 {Math.round(rule.confidence * 100)}%
            </span>
          </div>
          <p className="mt-1.5 text-sm text-foreground">{rule.text}</p>
          {rule.rationale && (
            <p className="mt-1 text-xs text-muted-foreground">依据:{rule.rationale}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {!adopted && onAdopt && (
            <Button size="sm" onClick={onAdopt} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              采纳
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
            {adopted ? <Undo2 /> : <X />}
            {adopted ? "撤回" : "驳回"}
          </Button>
        </div>
      </div>
    </div>
  );
}
