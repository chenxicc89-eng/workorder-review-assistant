import * as React from "react";
import type { ReviewResult } from "@/lib/types";
import type { ReviewResponse } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, riskVariant, conclusionVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueTable } from "@/components/IssueTable";
import { RuleFindingList } from "@/components/RuleFindingList";
import { ReviewOpinionBox } from "@/components/ReviewOpinionBox";
import { LearningContextBox } from "@/components/LearningContextBox";
import { Save, Flag, RefreshCw, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

interface Props {
  result: ReviewResponse | null;
  loading: boolean;
  error?: string | null;
  onSave: (finalOpinion: string, humanEdited: boolean) => void;
  onMarkFalsePositive: () => void;
  onReReview: () => void;
  saving?: boolean;
}

export function ReviewResultPanel({
  result,
  loading,
  error,
  onSave,
  onMarkFalsePositive,
  onReReview,
  saving,
}: Props) {
  const [editedOpinion, setEditedOpinion] = React.useState<string>("");
  const [humanEdited, setHumanEdited] = React.useState(false);

  React.useEffect(() => {
    if (result) {
      setEditedOpinion(result.reviewOpinion);
      setHumanEdited(false);
    }
  }, [result]);

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">正在进行三段式审核(规则预检 → AI 主审核 → AI 复核)…</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-[40vh] flex-col items-center justify-center gap-3">
          <ShieldAlert className="h-8 w-8 text-risk-high" />
          <p className="text-sm text-risk-high">审核失败:{error}</p>
          <Button variant="outline" onClick={onReReview}>
            <RefreshCw /> 重试
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="h-full">
        <CardContent className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <ShieldCheck className="h-10 w-10 opacity-40" />
          <p className="text-sm">
            在左侧填写工单信息后点击「开始审核」,
            <br />
            审核结果将显示在这里。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 结论概览 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>审核结果</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={conclusionVariant(result.conclusion)} className="text-sm px-2.5 py-1">
                {result.conclusion}
              </Badge>
              <Badge variant={riskVariant(result.riskLevel)} className="text-sm px-2.5 py-1">
                风险:{result.riskLevel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                置信度 {Math.round((result.confidence ?? 0) * 100)}%
              </span>
              <Badge variant={result.aiMode === "real" ? "default" : "secondary"}>
                {result.aiMode === "real" ? "真实AI" : "Mock模式"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.degradedNote && (
            <div className="rounded-md border border-risk-medium/40 bg-risk-medium/10 px-3 py-2 text-xs text-risk-medium">
              {result.degradedNote}
            </div>
          )}
          {/* 学习依据(C2):本次参考了哪些历史反馈/准则 */}
          <LearningContextBox ctx={result.learningContext} />
          {/* 问题摘要标签 */}
          <div>
            <div className="mb-1.5 text-sm font-medium text-muted-foreground">问题摘要</div>
            {result.summary.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.summary.map((s) => (
                  <Badge key={s} variant="outline">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">未发现明显问题</span>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => onSave(editedOpinion, humanEdited)} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {humanEdited ? "人工修改后保存" : "保存为案例"}
            </Button>
            <Button size="sm" variant="outline" onClick={onMarkFalsePositive} disabled={saving}>
              <Flag /> 标记为误判
            </Button>
            <Button size="sm" variant="ghost" onClick={onReReview}>
              <RefreshCw /> 重新审核
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 审核意见 */}
      <ReviewOpinionBox
        opinion={result.reviewOpinion}
        onChange={(v) => {
          setEditedOpinion(v);
          setHumanEdited(v.trim() !== result.reviewOpinion.trim());
        }}
      />

      {/* 明细 / 规则命中 / AI 分析 */}
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="issues">
            <TabsList className="flex w-full overflow-x-auto">
              <TabsTrigger value="issues" className="flex-1 whitespace-nowrap">
                问题明细 ({result.issues.length})
              </TabsTrigger>
              <TabsTrigger value="rule" className="flex-1 whitespace-nowrap">
                规则命中 ({result.ruleFindings.length})
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex-1 whitespace-nowrap">
                <span className="sm:hidden">AI ({result.aiFindings.length})</span>
                <span className="hidden sm:inline">AI 语义分析 ({result.aiFindings.length})</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="issues">
              <IssueTable issues={result.issues} />
            </TabsContent>
            <TabsContent value="rule">
              <RuleFindingList
                title="本地规则命中结果"
                issues={result.ruleFindings}
                emptyText="本地规则未命中确定性问题。"
              />
            </TabsContent>
            <TabsContent value="ai">
              <RuleFindingList
                title="AI 语义分析结果"
                issues={result.aiFindings}
                emptyText="AI 未补充语义问题。"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/** 供案例详情复用的只读结果视图 */
export function ReadonlyResultView({ result }: { result: ReviewResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={conclusionVariant(result.conclusion)} className="text-sm px-2.5 py-1">
          {result.conclusion}
        </Badge>
        <Badge variant={riskVariant(result.riskLevel)} className="text-sm px-2.5 py-1">
          风险:{result.riskLevel}
        </Badge>
      </div>
      <ReviewOpinionBox opinion={result.reviewOpinion} editable={false} />
      <IssueTable issues={result.issues} />
    </div>
  );
}
