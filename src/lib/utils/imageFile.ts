// ==========================================================================
// 文件 → base64 data URL 工具(供 OCR 上传)
// --------------------------------------------------------------------------
// - 图片:用 canvas 压缩(限制最长边,降体积、提识别速度),输出 JPEG data URL;
// - PDF:动态 import pdfjs-dist,逐页渲染为图片再压缩。
// pdfjs 仅在选到 PDF 时才加载,不进入主包关键路径。
// ==========================================================================

// 压缩参数偏激进,以适配 Vercel Serverless ~4.5MB 请求体上限。
// 工单截图多为文字,1280px + 0.72 质量已足够清晰识别。
const MAX_EDGE = 1280; // 最长边像素上限
const JPEG_QUALITY = 0.72;

export interface PreparedImage {
  /** base64 data URL */
  dataUrl: string;
  /** 展示用名称 */
  name: string;
}

/** 读取 File 为 data URL */
function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** 把一个 data URL 图片压缩(限制最长边)并转 JPEG data URL */
async function compressDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const { width, height } = img;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // 兜底:拿不到 canvas 上下文就用原图
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/** 渲染 PDF 为逐页图片 data URL */
async function pdfToImages(file: File): Promise<PreparedImage[]> {
  const pdfjs: any = await import("pdfjs-dist");
  // 配置 worker(Vite:用 ?url 方式引入 worker 文件)
  try {
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // 某些版本路径不同,退回不设 worker(pdfjs 会用主线程,较慢但可用)
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: PreparedImage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const raw = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    out.push({ dataUrl: await compressDataUrl(raw), name: `${file.name} 第${p}页` });
  }
  return out;
}

/**
 * 把用户选择的文件(图片或 PDF)转成可上传的图片 data URL 列表。
 * 图片压缩,PDF 逐页转图。
 */
export async function filesToImages(files: File[]): Promise<PreparedImage[]> {
  const result: PreparedImage[] = [];
  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const pages = await pdfToImages(file);
      result.push(...pages);
    } else if (file.type.startsWith("image/")) {
      const raw = await readAsDataUrl(file);
      result.push({ dataUrl: await compressDataUrl(raw), name: file.name });
    } else {
      throw new Error(`不支持的文件类型:${file.name}(仅支持图片与 PDF)`);
    }
  }
  return result;
}
