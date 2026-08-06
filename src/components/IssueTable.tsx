import type { ReviewIssue } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, riskVariant } from "@/components/ui/badge";

const SOURCE_LABEL: Record<ReviewIssue["source"], string> = {
  rule: "规则",
  ai: "AI",
  merged: "规则+AI",
};

const TARGET_LABEL = {
  reply: "回单",
  evaluation_report: "评价报告",
  cross_material: "跨材料",
} as const;

export function IssueTable({ issues }: { issues: ReviewIssue[] }) {
  if (!issues.length) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        未发现问题。
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead className="w-16">权重</TableHead>
          <TableHead className="w-24">审核对象</TableHead>
          <TableHead className="min-w-[9rem]">问题分类</TableHead>
          <TableHead className="min-w-[12rem]">原文依据</TableHead>
          <TableHead className="min-w-[14rem]">问题分析</TableHead>
          <TableHead className="min-w-[14rem]">整改要求</TableHead>
          <TableHead className="w-20">来源</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((it, i) => (
          <TableRow key={it.id}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell>
              <Badge variant={riskVariant(it.weight)}>{it.weight}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{TARGET_LABEL[it.target || "reply"]}</Badge>
            </TableCell>
            <TableCell className="font-medium">{it.category}</TableCell>
            <TableCell className="text-muted-foreground whitespace-pre-wrap">
              {it.evidence || "—"}
            </TableCell>
            <TableCell className="whitespace-pre-wrap">{it.analysis || "—"}</TableCell>
            <TableCell className="whitespace-pre-wrap">{it.requirement || "—"}</TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">{SOURCE_LABEL[it.source]}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
