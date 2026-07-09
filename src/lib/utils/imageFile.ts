// ==========================================================================
// 文件 → base64 data URL 工具(供 OCR 上传)
// --------------------------------------------------------------------------
// - 图片:用 canvas 压缩(限制最长边,降体积、提识别速度),输出 JPEG data URL;
// - PDF:动态 import pdfjs-dist,逐页渲染为图片再压缩。
// pdfjs 仅在选到 PDF 时才加载,不进入主包关键路径。
// ==========================================================================

// 首选压缩参数:分辨率与质量都放高,尽量保留清晰度,识别更准。
// 工单/手写扫描件文字较多,提高分辨率有助于识别。
const MAX_EDGE = 2400; // 最长边像素上限
const JPEG_QUALITY = 0.85;

// 单张图片编码后(base64 data URL)的体积上限 —— 放到尽可能大。
// 唯一的硬约束来自部署平台:Vercel serverless 请求体约 4.5MB 且无法调大。
// 为在“一次多张”时也不触发该上限,单张压到 ~3.8MB 以内(单张场景足够宽松;
// 若一次要传多张大图,后端已就 413 给出可读提示,可减少数量重试)。
// 自托管/本地部署无此平台上限,后端 express.json 已放开到 50mb。
const MAX_ENCODED_BYTES = 3.8 * 1024 * 1024;

/** 估算 data URL 的字节数(base64 部分每 4 字符 ≈ 3 字节) */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

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

/** 把 img 以指定最长边、质量编码为 JPEG data URL(拿不到 canvas 上下文时回退原图) */
function encodeAtEdge(
  img: HTMLImageElement,
  maxEdge: number,
  quality: number,
  fallback: string
): string {
  const { width, height } = img;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback; // 兜底:拿不到 canvas 上下文就用原图
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 把一个 data URL 图片压缩并转 JPEG data URL。
 * 先按 MAX_EDGE / JPEG_QUALITY 压一版;若仍超过单张体积上限
 * (常见于高分辨率手写扫描件),逐步降质量、再降分辨率,直到装得下,
 * 从根本上避免上传时触发后端 413 / Vercel 请求体上限导致的 500。
 */
async function compressDataUrl(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);

  let out = encodeAtEdge(img, MAX_EDGE, JPEG_QUALITY, dataUrl);
  if (dataUrlBytes(out) <= MAX_ENCODED_BYTES) return out;

  // 第一轮:保持高分辨率,逐步降质量
  for (const q of [0.75, 0.65, 0.55]) {
    out = encodeAtEdge(img, MAX_EDGE, q, out);
    if (dataUrlBytes(out) <= MAX_ENCODED_BYTES) return out;
  }
  // 第二轮:仍超标则同时缩小最长边(文字件降到 1600 / 1280 / 1024 仍可识别)
  for (const edge of [1600, 1280, 1024]) {
    out = encodeAtEdge(img, edge, 0.6, out);
    if (dataUrlBytes(out) <= MAX_ENCODED_BYTES) return out;
  }
  // 已尽力压缩,返回当前最小的一版(极端情况下仍可能偏大,交由后端给出可读提示)
  return out;
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
