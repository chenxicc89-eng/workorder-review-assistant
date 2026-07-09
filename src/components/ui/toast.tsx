import * as React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ==========================================================================
// 轻量 toast:Context + Provider + useToast()。无第三方依赖。
// ==========================================================================

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = React.createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const toast = React.useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const remove = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,90vw)]">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-toast-in flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-md text-sm",
              t.kind === "success" && "border-emerald-500/40",
              t.kind === "error" && "border-risk-high/40",
              t.kind === "info" && "border-border"
            )}
          >
            {t.kind === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />}
            {t.kind === "error" && <AlertTriangle className="h-4 w-4 text-risk-high mt-0.5" />}
            {t.kind === "info" && <Info className="h-4 w-4 text-primary mt-0.5" />}
            <span className="flex-1 leading-relaxed break-words">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
