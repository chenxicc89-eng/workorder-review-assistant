import * as React from "react";
import type { OcrExtractResult } from "@/lib/types";
import { extractFromImages, extractFromText } from "@/lib/api";
import { filesToImages, type PreparedImage } from "@/lib/utils/imageFile";
import { isOfficeDoc, officeFilesToText } from "@/lib/utils/docFile";
import { mergeExtractResults } from "@/lib/utils/extractMerge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  ImagePlus,
  Loader2,
  ScanText,
  X,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Props {
  onExtracted: (result: OcrExtractResult) => void;
  /** 视觉是否可用(图片/PDF 识别所需)。为 false 时图片路径不可用,但 Word/Excel 仍可用。 */
  visionAvailable?: boolean;
  /** 视觉不可用时的说明文案 */
  visionHint?: string;
}

const MAX_IMAGES = 6;
const MAX_DOCS = 8;
// 单张图片请求体上限。手机照片过大时视觉模型容易超过 serverless 时限导致 504。
const MAX_IMAGE_PAYLOAD = 1.8 * 1024 * 1024;

/** 估算 data URL 数组作为 JSON body 的字节体积 */
function estimatePayload(dataUrls: string[]): number {
  // base64 字符数 ≈ 字节数;再加 JSON 结构少量开销
  return dataUrls.reduce((sum, u) => sum + u.length, 0) + 64;
}

interface DocItem {
  file: File;
  name: string;
  kind: "word" | "excel";
}

function docKind(file: File): "word" | "excel" {
  const n = file.name.toLowerCase();
  return n.endsWith(".docx") ? "word" : "excel";
}

export function OcrUploader({ onExtracted, visionAvailable = true, visionHint }: Props) {
  const { toast } = useToast();
  const [images, setImages] = React.useState<PreparedImage[]>([]);
  const [docs, setDocs] = React.useState<DocItem[]>([]);
  const [preparing, setPreparing] = React.useState(false);
  const [recognizing, setRecognizing] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [lastRaw, setLastRaw] = React.useState<string>("");
  const [showRaw, setShowRaw] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    const officeFiles = all.filter(isOfficeDoc);
    const imageOrPdf = all.filter((f) => !isOfficeDoc(f));

    setPreparing(true);
    try {
      // Office 文件:仅登记(解析推迟到识别时,避免频繁解析)
      if (officeFiles.length) {
        setDocs((prev) => {
          const merged = [
            ...prev,
            ...officeFiles.map((f) => ({ file: f, name: f.name, kind: docKind(f) })),
          ];
          if (merged.length > MAX_DOCS) toast(`Word/Excel 最多 ${MAX_DOCS} 个`, "info");
          return merged.slice(0, MAX_DOCS);
        });
      }
      // 图片/PDF:立即压缩/转图
      if (imageOrPdf.length) {
        if (!visionAvailable) {
          toast("当前未配置视觉模型,暂不能识别图片/PDF(Word/Excel 可用)", "info");
        } else {
          const prepared = await filesToImages(imageOrPdf);
          setImages((prev) => {
            const merged = [...prev, ...prepared];
            if (merged.length > MAX_IMAGES) toast(`图片最多 ${MAX_IMAGES} 张`, "info");
            return merged.slice(0, MAX_IMAGES);
          });
        }
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const removeDoc = (i: number) => setDocs((prev) => prev.filter((_, idx) => idx !== i));

  const moveImage = (i: number, dir: -1 | 1) =>
    setImages((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const clearAll = () => {
    setImages([]);
    setDocs([]);
  };

  const recognize = async () => {
    if (!images.length && !docs.length) {
      toast("请先添加图片、PDF 或 Word/Excel 文档", "error");
      return;
    }
    setRecognizing(true);
    try {
      const results: OcrExtractResult[] = [];

      // 图片/PDF 路径(视觉)
      if (images.length) {
        if (!visionAvailable) {
          toast("图片识别不可用,已跳过图片,仅识别 Word/Excel", "info");
        } else {
          for (const im of images) {
            if (estimatePayload([im.dataUrl]) > MAX_IMAGE_PAYLOAD) {
              toast(`图片 ${im.name} 体积偏大,请裁剪或重新拍摄后重试`, "error");
              return;
            }
            results.push(await extractFromImages([im.dataUrl]));
          }
        }
      }

      // Word/Excel 路径(文本):前端解析 → 后端拆分
      if (docs.length) {
        const text = await officeFilesToText(docs.map((d) => d.file));
        results.push(await extractFromText(text));
      }

      if (!results.length) {
        toast("没有可识别的内容", "error");
        return;
      }

      const merged = mergeExtractResults(results);
      setLastRaw(merged.rawText || "");
      onExtracted(merged);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRecognizing(false);
    }
  };

  const busy = preparing || recognizing;
  const hasFiles = images.length > 0 || docs.length > 0;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ScanText className="h-4 w-4 text-primary" />
        上传工单图片 / PDF / Word / Excel 自动识别
      </div>

      {/* 视觉不可用提示(不阻断整体,Word/Excel 仍可用) */}
      {!visionAvailable && (
        <div className="mb-2 rounded-md border border-risk-medium/40 bg-risk-medium/10 px-3 py-1.5 text-xs text-risk-medium">
          {visionHint || "当前未配置视觉模型,图片/PDF 识别不可用;Word/Excel 与手动粘贴仍可用。"}
        </div>
      )}

      {/* 拖拽 / 选择区 */}
      <div
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-input hover:border-primary/40"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <ImagePlus className="h-6 w-6 text-muted-foreground" />
        <span className="text-muted-foreground">
          点击或拖拽上传(图片 / PDF / Word .docx / Excel .xlsx,可多个)
        </span>
        <span className="text-xs text-muted-foreground/70">
          诉求主表放前面、回单/附件在后,识别更准
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.docx,.xlsx,.xls,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* 图片/PDF 缩略图 */}
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((im, i) => (
            <div key={i} className="group relative overflow-hidden rounded-md border">
              <img src={im.dataUrl} alt={im.name} className="h-20 w-full object-cover" />
              <div className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                {i + 1}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  className="text-white disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveImage(i, -1)}
                  title="上移"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="text-white disabled:opacity-30"
                  disabled={i === images.length - 1}
                  onClick={() => moveImage(i, 1)}
                  title="下移"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button className="text-white" onClick={() => removeImage(i)} title="删除">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Word/Excel 文件列表 */}
      {docs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {docs.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
            >
              {d.kind === "word" ? (
                <FileText className="h-4 w-4 text-blue-600" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              )}
              <span className="flex-1 truncate">{d.name}</span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeDoc(i)}
                title="删除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={recognize} disabled={busy || !hasFiles}>
          {recognizing ? <Loader2 className="animate-spin" /> : <ScanText />}
          {recognizing ? "识别中…" : "识别并填入"}
        </Button>
        {preparing && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> 正在处理文件…
          </span>
        )}
        {hasFiles && !busy && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAll}
          >
            清空
          </button>
        )}
      </div>

      {/* 识别原文折叠区 */}
      {lastRaw && (
        <div className="mt-3">
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            查看识别原文(供核对)
          </button>
          {showRaw && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-card p-2 text-xs leading-relaxed text-muted-foreground">
              {lastRaw}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
