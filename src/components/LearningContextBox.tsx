import * as React from "react";
import type { LearningContext } from "@/lib/types";
import { GraduationCap, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * 学习依据展示(C2):把"本次审核参考了哪些历史反馈/准则"从黑箱变为可见。
 * - 引用条数为 0 且无提炼准则时不渲染(避免噪音)。
 * - 每条反馈显示同类/跨类标签、相似度(Tier2 语义检索才有)、一句话要点。
 */
export function LearningContextBox({ ctx }: { ctx?: LearningContext }) {
  const [open, setOpen] = React.useState(false);
  if (!ctx) return null;
  const { usedCorrectionCount, usedCorrections, appliedStandardName, distilledRuleCount } = ctx;

  // 完全没有学习依据时不展示
  if (usedCorrectionCount === 0 && distilledRuleCount === 0) return null;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-primary"
      >
        <GraduationCap className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          本次学习依据:参考 {usedCorrectionCount} 条历史纠错
          {distilledRuleCount > 0 ? `,应用 ${distilledRuleCount} 条提炼准则` : ""}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-primary/20 px-3 py-2 text-xs">
          {appliedStandardName && (
            <div className="text-muted-foreground">
              生效规范:<span className="text-foreground">{appliedStandardName}</span>
            </div>
          )}
          {usedCorrections.length > 0 ? (
            <ul className="space-y-1.5">
              {usedCorrections.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Badge variant={r.sameType ? "secondary" : "outline"} className="shrink-0">
                    {r.sameType ? "同类" : "跨类"}
                  </Badge>
                  {typeof r.similarity === "number" && (
                    <span className="shrink-0 text-muted-foreground">
                      相似度 {Math.round(r.similarity * 100)}%
                    </span>
                  )}
                  <span className="text-foreground/80">{r.gist || "(无摘要)"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-muted-foreground">本次未引用历史反馈(仅按规范审核)。</div>
          )}
        </div>
      )}
    </div>
  );
}
