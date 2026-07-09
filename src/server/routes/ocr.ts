import { Router } from "express";
import { z } from "zod";
import { runExtract, runExtractText } from "../../lib/ai/aiClient";

// POST /api/ocr/extract —— 图片 OCR + 工单字段抽取
export const ocrRouter = Router();

const MAX_IMAGES = 16;
// 单张 data URL 最大约 40MB(base64 后),总量受 app.ts 的 json limit(50mb)约束。
// 放得尽量宽松;Vercel 部署时仍受平台约 4.5MB 请求体硬上限约束,前端会压到阈值内。
const MAX_ONE = 40 * 1024 * 1024;

const bodySchema = z.object({
  images: z
    .array(
      z
        .string()
        .startsWith("data:", "图片必须为 data URL 格式")
        .max(MAX_ONE, "单张图片过大(压缩后应小于 8MB)")
    )
    .min(1, "请至少上传一张图片")
    .max(MAX_IMAGES, `一次最多上传 ${MAX_IMAGES} 张图片`),
});

ocrRouter.post("/extract", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "输入校验失败",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  try {
    const result = await runExtract(parsed.data.images);
    res.json(result);
  } catch (err) {
    console.error("图片识别失败:", err);
    // 识别失败属于业务可预期错误,返回 422 便于前端区分
    res.status(422).json({ error: "图片识别失败", message: (err as Error).message });
  }
});

// POST /api/ocr/extract-text —— Word/Excel 解析出的纯文本 → 字段抽取(走文本模型)
const MAX_TEXT = 100_000; // 字符上限
const textSchema = z.object({
  text: z.string().min(1, "文档内容为空").max(MAX_TEXT, "文档内容过长(超过 10 万字符)"),
});

ocrRouter.post("/extract-text", async (req, res) => {
  const parsed = textSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "输入校验失败",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  try {
    const result = await runExtractText(parsed.data.text);
    res.json(result);
  } catch (err) {
    console.error("文档识别失败:", err);
    res.status(422).json({ error: "文档识别失败", message: (err as Error).message });
  }
});
