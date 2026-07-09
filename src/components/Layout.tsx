import * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils/cn";
import { ClipboardCheck, History, BookOpen } from "lucide-react";
import { getHealth, type HealthInfo } from "@/lib/api";

const NAV = [
  { to: "/", label: "工单审核", icon: ClipboardCheck, end: true },
  { to: "/cases", label: "历史案例", icon: History, end: false },
  { to: "/standards", label: "规范库", icon: BookOpen, end: false },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = React.useState<HealthInfo | null>(null);

  React.useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 sm:h-14 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-0">
          {/* 第一行:品牌 + AI 状态 */}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-2 font-semibold">
              <ClipboardCheck className="h-5 w-5 shrink-0 text-primary" />
              {/* 窄屏用短标题,宽屏用全称 */}
              <span className="truncate sm:hidden">12345预审助手</span>
              <span className="hidden truncate sm:inline">12345回单智能预审助手</span>
            </div>
            {health && (
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-full border px-2 py-0.5 text-xs sm:hidden",
                  health.aiMode === "real"
                    ? "border-emerald-500/40 text-emerald-600"
                    : "border-border text-muted-foreground"
                )}
              >
                AI:{health.aiMode === "real" ? "真实" : "Mock"}
              </span>
            )}
          </div>

          {/* 导航:窄屏平铺占满、可横向滚动;宽屏常规 */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:justify-start",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {n.label}
              </NavLink>
            ))}
          </nav>

          {/* 宽屏才显示的完整 AI 状态(含模型名) */}
          <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            {health && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5",
                  health.aiMode === "real"
                    ? "border-emerald-500/40 text-emerald-600"
                    : "border-border"
                )}
              >
                AI:{health.aiMode === "real" ? `真实(${health.model})` : "Mock 模式"}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-5">{children}</main>
    </div>
  );
}
