import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  ClipboardCheck,
  ScanText,
  GraduationCap,
  BookOpen,
  Sparkles,
  Check,
  Undo2,
} from "lucide-react";

// ==========================================================================
// 全局帮助弹窗:一处集中说明各功能怎么用。
// 复用项目现有的自写遮罩模式(fixed inset-0 + 点遮罩关闭 + 内层 stopPropagation),
// 与 StandardsPage / CasesPage 的弹层风格一致,不引入新依赖。
// 通过 initialSection 可直接定位到某一节(如学习中心页的"查看完整帮助")。
// ==========================================================================

type SectionKey = "review" | "ocr" | "learning" | "standards";

const SECTIONS: {
  key: SectionKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: React.ReactNode;
}[] = [
  {
    key: "review",
    title: "工单审核",
    icon: ClipboardCheck,
    body: (
      <>
        <p>填写或识别工单后点「开始审核」,系统会结合规范、本地规则和你的历史反馈给出预审意见。</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>结论分「通过 / 建议修改 / 建议退回」,风险分「高 / 中 / 低」。</li>
          <li>每条问题都给出原文依据与整改要求,审核意见可直接复制给承办单位。</li>
          <li>
            不认同判断时:点「标记误判」并填写<b>错在哪</b>,或直接修改审核意见后保存。这两个动作会成为系统学习的依据(见「学习中心」)。
          </li>
        </ul>
      </>
    ),
  },
  {
    key: "ocr",
    title: "图片 / 文档识别",
    icon: ScanText,
    body: (
      <>
        <p>可上传工单截图或 Word/Excel,系统自动识别并拆分为诉求、回单、承办单位等字段,免去手动录入。</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>识别后请<b>核对关键字段</b>再审核,识别置信度较低的项会有提示。</li>
          <li>图片较大时识别可能偏慢,建议一次上传数量不宜过多。</li>
        </ul>
      </>
    ),
  },
  {
    key: "learning",
    title: "学习中心(重点)",
    icon: GraduationCap,
    body: (
      <>
        <p>把你反复出现的纠正,固化成<b>永久生效</b>的审核规则——你教一次,以后同类工单系统就照着办。</p>
        <div className="space-y-2">
          <div>
            <div className="font-medium text-foreground">三步使用:</div>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                <b>日常纠正</b>:审核时标记误判(填错在哪)或修改意见并保存,正常做即可。
              </li>
              <li>
                <b>生成候选</b>:进学习中心,选工单类型 → 点
                <span className="mx-1 inline-flex items-center gap-1 rounded border px-1 py-0.5 text-xs">
                  <Sparkles className="h-3 w-3" />生成候选准则
                </span>
                ,系统归纳出候选规则。
              </li>
              <li>
                <b>你来拍板</b>:看理由与支撑案例数,点
                <span className="mx-1 inline-flex items-center gap-1 rounded border px-1 py-0.5 text-xs">
                  <Check className="h-3 w-3" />采纳
                </span>
                即生效,或驳回;已采纳的可
                <span className="mx-1 inline-flex items-center gap-1 rounded border px-1 py-0.5 text-xs">
                  <Undo2 className="h-3 w-3" />撤回
                </span>
                。
              </li>
            </ol>
          </div>
          <div>
            <div className="font-medium text-foreground">两类规则:</div>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>加强准则</b>:你总在补的要点 → 以后系统主动审这一项。
              </li>
              <li>
                <b>豁免准则</b>:你总说不该报的情形 → 以后系统不再当成问题。
              </li>
            </ul>
          </div>
          <p className="rounded-md bg-primary/5 px-3 py-2 text-primary">
            系统绝不会自动改规则,一定是你点了「采纳」才生效;只有<b>反复出现</b>的纠正才会被提炼,一次性纠正不会成规则。
          </p>
          <p>
            审核结果页顶部的「本次学习依据」会显示这一单参考了几条历史反馈、应用了几条已采纳规则,可追溯。系统还会把相近情形的<b>其他类型</b>反馈作类比参考(会标明"仅作类比",最终以本类型规范为准)。
          </p>
        </div>
      </>
    ),
  },
  {
    key: "standards",
    title: "规范库",
    icon: BookOpen,
    body: (
      <>
        <p>各工单类型的审核规范(必备要素、风险问题、规范要求等),是审核的判断基准。</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>可新增 / 编辑 / 启停各类型规范。</li>
          <li>学习中心里被「采纳」的准则,会自动写入对应类型规范,在这里也能看到。</li>
        </ul>
      </>
    ),
  },
];

export function HelpDialog({
  open,
  onClose,
  initialSection,
}: {
  open: boolean;
  onClose: () => void;
  /** 打开时高亮/滚动到的初始分节(如从学习中心页进入) */
  initialSection?: SectionKey;
}) {
  // Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 打开时滚动到初始分节
  const bodyRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || !initialSection) return;
    const el = bodyRef.current?.querySelector(`[data-help-section="${initialSection}"]`);
    el?.scrollIntoView({ block: "start" });
  }, [open, initialSection]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="使用帮助"
    >
      <div
        className="my-3 w-full max-w-2xl rounded-lg border bg-card shadow-xl sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">使用帮助</span>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="关闭">
            <X />
          </Button>
        </div>
        <div ref={bodyRef} className="max-h-[78vh] space-y-5 overflow-auto p-4 text-sm sm:max-h-[75vh]">
          {SECTIONS.map((s) => (
            <section key={s.key} data-help-section={s.key} className="space-y-2">
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <s.icon className="h-4 w-4 shrink-0 text-primary" />
                {s.title}
              </h3>
              <div className="space-y-2 text-muted-foreground">{s.body}</div>
            </section>
          ))}
        </div>
        <div className="flex justify-end border-t px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            我知道了
          </Button>
        </div>
      </div>
    </div>
  );
}
