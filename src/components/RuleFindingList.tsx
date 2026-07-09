import type { ReviewIssue } from "@/lib/types";
import { Badge, riskVariant } from "@/components/ui/badge";

interface Props {
  title: string;
  issues: ReviewIssue[];
  emptyText?: string;
}

/** 展示一组问题(用于「规则命中结果」「AI 语义分析」) */
export function RuleFindingList({ title, issues, emptyText = "无" }: Props) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-muted-foreground">
        {title}
        <span className="ml-1 text-xs">({issues.length})</span>
      </div>
      {issues.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-2">
          {issues.map((it) => (
            <li key={it.id} className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={riskVariant(it.weight)}>{it.weight}</Badge>
                <span className="font-medium">{it.category}</span>
              </div>
              {it.evidence && (
                <p className="mt-1.5 text-muted-foreground">
                  <span className="text-foreground/70">依据:</span>
                  {it.evidence}
                </p>
              )}
              <p className="mt-1 leading-relaxed">{it.analysis}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
