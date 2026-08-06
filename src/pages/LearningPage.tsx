import * as React from "react";
import type { LearnedRuleRecord } from "@/lib/types";
import { ORDER_TYPES } from "@/lib/standards/defaultStandards";
import {
  generateLearnedCandidates,
  listLearnedRules,
  adoptLearnedRule,
  rejectLearnedRule,
  listApprovedOrderTypes,
  generateAllLearnedCandidates,
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
import { HelpDialog } from "@/components/HelpDialog";
import { ApprovedCaseImportCard } from "@/components/ApprovedCaseImportCard";
import { MultiMaterialImportCard } from "@/components/MultiMaterialImportCard";
import { ApprovedCaseLibraryCard } from "@/components/ApprovedCaseLibraryCard";
import {
  Loader2,
  Sparkles,
  Check,
  X,
  Undo2,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  HelpCircle,
} from "lucide-react";

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
  const [orderType, setOrderType] = React.useState<string>("__all");
  const [rules, setRules] = React.useState<LearnedRuleRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [orderTypes, setOrderTypes] = React.useState<string[]>([...ORDER_TYPES]);

  React.useEffect(() => {
    listApprovedOrderTypes()
      .then((types) => setOrderTypes(Array.from(new Set([...ORDER_TYPES, ...types]))))
      .catch(() => undefined);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // 只看 pending / adopted(rejected 不展示,避免噪音)
      const [pending, adopted] = await Promise.all([
        listLearnedRules({ orderType: orderType === "__all" ? undefined : orderType, status: "pending" }),
        listLearnedRules({ orderType: orderType === "__all" ? undefined : orderType, status: "adopted" }),
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
      const created = orderType === "__all"
        ? await generateAllLearnedCandidates()
        : await generateLearnedCandidates(orderType);
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
                <SelectItem value="__all">全部类型</SelectItem>
                {orderTypes.map((t) => (
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
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            从「{orderType === "__all" ? "全部类型" : orderType}」的历史人工纠错和批量导入的已通过工单中提炼可长期复用的审核准则。
            人工纠错用于校准误报漏报，已通过样本用于提炼必备要素、规范要求、豁免条件和标准正例；
            采纳后即写入生效规范、影响此后每一次审核,且不占用示例预算 —— 反馈由此被永久记住。
          </p>

          {/* 可折叠的三步使用说明 */}
          <div className="rounded-md border">
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium text-foreground"
            >
              {guideOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1">怎么用?(三步)</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setHelpOpen(true);
                  }
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-normal text-primary hover:bg-primary/10"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                查看完整帮助
              </span>
            </button>
            {guideOpen && (
              <div className="space-y-2 border-t px-3 py-2.5">
                <ol className="ml-4 list-decimal space-y-1.5">
                  <li>
                    <b className="text-foreground">准备资料</b>:日常审核时记录人工纠错，或在下方按模板批量导入已审核通过的工单。
                  </li>
                  <li>
                    <b className="text-foreground">生成候选</b>:选择工单类型后点右上「生成候选准则」，系统分开分析纠错和已通过样本并归纳候选。
                  </li>
                  <li>
                    <b className="text-foreground">你来拍板</b>:看每条候选的理由与支撑案例数,点「采纳」即写入规范并从下一单起生效;不合适则「驳回」;已采纳的可「撤回」。
                  </li>
                </ol>
                <p className="rounded bg-primary/5 px-2.5 py-1.5 text-primary">
                  系统绝不会自动改规则，一定是你点「采纳」才生效；单条样本也可生成候选，但会以较低置信度提示人工谨慎确认。
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ApprovedCaseImportCard
        onImported={() => {
          void load();
          void listApprovedOrderTypes().then((types) =>
            setOrderTypes(Array.from(new Set([...ORDER_TYPES, ...types])))
          );
        }}
      />
      <MultiMaterialImportCard
        onImported={() => {
          void load();
          void listApprovedOrderTypes().then((types) =>
            setOrderTypes(Array.from(new Set([...ORDER_TYPES, ...types])))
          );
        }}
      />
      <ApprovedCaseLibraryCard
        onChanged={() => {
          void load();
          void listApprovedOrderTypes().then((types) =>
            setOrderTypes(Array.from(new Set([...ORDER_TYPES, ...types])))
          );
        }}
      />

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

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} initialSection="learning" />
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
  const typeLabels: Record<LearnedRuleRecord["candidateType"], string> = {
    reinforce: "加强准则",
    exemption: "豁免准则",
    required_item: "必备要素",
    requirement: "规范要求",
    good_example: "标准正例",
  };
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {kindBadge(rule.kind)}
            <Badge variant="outline">{rule.orderType}</Badge>
            <Badge variant="outline">{typeLabels[rule.candidateType]}</Badge>
            <Badge variant="secondary">
              {rule.sourceType === "approved_case" ? "已通过样本" : "人工纠错"}
            </Badge>
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
          {rule.conflictStatus !== "none" && (
            <p className="mt-1 rounded bg-risk-high/10 px-2 py-1 text-xs text-risk-high">
              {rule.conflictStatus === "duplicate" ? "疑似重复" : "疑似冲突"}：
              {rule.conflictDetail || "请人工核对后处理"}
            </p>
          )}
          {rule.rationale && (
            <p className="mt-1 text-xs text-muted-foreground">依据:{rule.rationale}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {!adopted && onAdopt && (
            <Button
              size="sm"
              onClick={onAdopt}
              disabled={busy || rule.conflictStatus !== "none"}
              title={rule.conflictStatus !== "none" ? "重复或冲突候选不可直接采纳" : undefined}
            >
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
