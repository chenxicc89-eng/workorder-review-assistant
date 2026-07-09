import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";
import type { RiskLevel, ReviewConclusion } from "@/lib/types";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        // 风险等级色
        high: "border-transparent bg-risk-high/12 text-risk-high border-risk-high/30",
        medium: "border-transparent bg-risk-medium/12 text-risk-medium border-risk-medium/30",
        low: "border-transparent bg-risk-low/12 text-risk-low border-risk-low/30",
        // 结论色
        pass: "border-transparent bg-emerald-500/12 text-emerald-600 border-emerald-500/30",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** 把风险等级映射到 badge variant */
export function riskVariant(level: RiskLevel): "high" | "medium" | "low" {
  return level === "高" ? "high" : level === "中" ? "medium" : "low";
}

/** 把审核结论映射到 badge variant */
export function conclusionVariant(c: ReviewConclusion): "pass" | "medium" | "high" {
  if (c === "通过") return "pass";
  if (c === "建议修改") return "medium";
  return "high";
}

export { Badge, badgeVariants };
