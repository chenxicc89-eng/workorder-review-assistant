import * as React from "react";
import type { OcrExtractResult, WorkOrderInput } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Eraser, FileText, Save } from "lucide-react";
import { OcrUploader } from "@/components/OcrUploader";
import { getHealth } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

// 需求文档第十七节示例数据
const EXAMPLE: WorkOrderInput = {
  orderType: "突发故障停电",
  citizenAppeal:
    "市民反映朝阳区某小区一年内频繁停电,2026年7月3日22点15分再次发生停电,希望解决小区常年停电问题。",
  replyContent:
    "【电力公司权属】【已联系】朝阳供电公司中央商务区供电服务中心工作人员隋师于2026年7月3日23时50分与市民联系;但市民电话保密无法联系。【已解决】主责单位:朝阳供电公司中央商务区供电服务中心。办理时间:2026年7月3日22时15分。经核实,因树砸线导致线路停电,采取临时检修的方式恢复供电。因市民信息保密无法核实具体停电时间。市民【未知意见】。",
  orderNo: "",
  attachmentNote: "",
  unit: "朝阳供电公司中央商务区供电服务中心",
  remark: "",
};

const EMPTY: WorkOrderInput = {
  orderNo: "",
  orderType: "",
  citizenAppeal: "",
  replyContent: "",
  attachmentNote: "",
  unit: "",
  remark: "",
};

const DRAFT_KEY = "wo-review-draft";

interface Props {
  value: WorkOrderInput;
  onChange: (value: WorkOrderInput) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function WorkOrderForm({ value, onChange, onSubmit, loading }: Props) {
  const { toast } = useToast();
  const set = <K extends keyof WorkOrderInput>(key: K, v: WorkOrderInput[K]) =>
    onChange({ ...value, [key]: v });

  // 视觉识别可用性(mock 模式始终可用作演示)
  const [visionAvailable, setVisionAvailable] = React.useState(true);
  const [visionHint, setVisionHint] = React.useState<string>("");
  React.useEffect(() => {
    getHealth()
      .then((h) => {
        const ok = h.supportsVision !== false;
        setVisionAvailable(ok);
        if (!ok) setVisionHint("当前模型不支持图片识别,请配置 AI_VISION_MODEL 或手动粘贴。");
      })
      .catch(() => {
        // 健康检查失败不阻断,仍允许尝试识别(失败会有 toast)
        setVisionAvailable(true);
      });
  }, []);

  // OCR 识别结果 → 回填表单
  const handleExtracted = (r: OcrExtractResult) => {
    onChange({
      ...value,
      orderType: r.orderType || value.orderType,
      orderNo: r.orderNo || value.orderNo,
      citizenAppeal: r.citizenAppeal || value.citizenAppeal,
      replyContent: r.replyContent || value.replyContent,
      unit: r.unit || value.unit,
      attachmentNote: r.attachmentNote || value.attachmentNote,
    });
    if (r.notes) toast(r.notes, "info");
    if (!r.orderType) {
      toast("已识别并填入,未能确定工单类型,审核将按通用规范处理", "info");
    } else {
      toast("已识别并填入,请核对后开始审核", "success");
    }
  };

  const loadDraftOnce = React.useRef(false);
  React.useEffect(() => {
    if (loadDraftOnce.current) return;
    loadDraftOnce.current = true;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw && !value.citizenAppeal && !value.replyContent) {
      try {
        onChange({ ...EMPTY, ...JSON.parse(raw) });
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>工单信息</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 图片/文件识别工单(可选前置步骤;Word/Excel 走文本模型,不受视觉可用性影响) */}
        <OcrUploader
          onExtracted={handleExtracted}
          visionAvailable={visionAvailable}
          visionHint={visionHint}
        />

        {/*
          工单编号 / 工单类型 / 承办单位 / 备注 已改为「由上传识别自动填入」,
          不再手动录入。其值仍随识别结果回填并参与审核与保存(见 handleExtracted)。
          工单类型若未识别出,审核时后端自动回退「其他」通用规范。
          仅保留市民诉求 / 回单内容作为「识别后可校对」区,供人工核对修改。
        */}
        {(value.orderType || value.orderNo || value.unit) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {value.orderType && (
              <span>
                工单类型:<span className="text-foreground">{value.orderType}</span>
              </span>
            )}
            {value.orderNo && (
              <span>
                编号:<span className="text-foreground">{value.orderNo}</span>
              </span>
            )}
            {value.unit && (
              <span>
                承办单位:<span className="text-foreground">{value.unit}</span>
              </span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="appeal">
            市民诉求 <span className="text-risk-high">*</span>
            <span className="ml-1 font-normal text-muted-foreground">(识别后可校对)</span>
          </Label>
          <Textarea
            id="appeal"
            className="min-h-[96px]"
            placeholder="上传工单图片识别后自动填入,或在此粘贴市民诉求原文…"
            value={value.citizenAppeal}
            onChange={(e) => set("citizenAppeal", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reply">
            回单内容 <span className="text-risk-high">*</span>
            <span className="ml-1 font-normal text-muted-foreground">(识别后可校对)</span>
          </Label>
          <Textarea
            id="reply"
            className="min-h-[160px]"
            placeholder="上传工单图片识别后自动填入,或在此粘贴承办单位回单内容原文…"
            value={value.replyContent}
            onChange={(e) => set("replyContent", e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            {loading ? "审核中…" : "开始审核"}
          </Button>
          <Button variant="outline" onClick={() => onChange({ ...EMPTY })} disabled={loading}>
            <Eraser /> 清空
          </Button>
          <Button variant="outline" onClick={() => onChange({ ...EXAMPLE })} disabled={loading}>
            <FileText /> 加载示例
          </Button>
          <Button variant="ghost" onClick={saveDraft} disabled={loading}>
            <Save /> 保存草稿
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { EMPTY as EMPTY_INPUT, EXAMPLE as EXAMPLE_INPUT };
