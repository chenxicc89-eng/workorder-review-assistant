import "dotenv/config";
import express from "express";
import cors from "cors";
import { reviewRouter } from "./routes/review";
import { casesRouter } from "./routes/cases";
import { standardsRouter } from "./routes/standards";
import { ocrRouter } from "./routes/ocr";
import { learningRouter } from "./routes/learning";
import { readAiEnv } from "../lib/ai/providers";

// ==========================================================================
// Express app 组装(不 listen)
// --------------------------------------------------------------------------
// 本地 dev 由 index.ts import 后 app.listen;
// Vercel serverless 由 api/index.ts 直接把本 app 当 handler。
// ==========================================================================

export const app = express();
app.use(cors());
// 图片以 base64 data URL 提交,请求体上限。设得尽可能大(50mb),让本地/自托管
// 部署几乎不受限。注意:部署到 Vercel serverless 时另有约 4.5MB 的平台级硬上限,
// 由平台在进入本服务前直接拦截,无法在代码里放开;前端压缩会把请求体压到该阈值以内。
app.use(express.json({ limit: "50mb" }));

// 健康检查 & 运行模式
app.get("/api/health", (_req, res) => {
  const env = readAiEnv();
  const isReal = env.enabled && !!env.apiKey.trim();
  res.json({
    ok: true,
    aiMode: isReal ? "real" : "mock",
    provider: env.provider,
    model: env.model,
    visionModel: env.visionModel,
    // mock 模式始终可演示;真实模式按视觉侧是否配置了 Key 判定(能否真识别以调用为准)
    supportsVision: isReal ? env.visionEnabled : true,
  });
});

app.use("/api/review", reviewRouter);
app.use("/api/cases", casesRouter);
app.use("/api/standards", standardsRouter);
app.use("/api/ocr", ocrRouter);
app.use("/api/learning", learningRouter);

// 兜底错误处理
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // 请求体超过 express.json limit(常见于上传的图片过大)。
    // 单独识别为 413,给出可读提示,避免暴露为无意义的 500。
    // 注:Vercel serverless 另有约 4.5MB 的平台级请求体硬上限,超过它由平台直接拦截,
    //     无法进入此处;前端已在压缩阶段把单张控制在 ~1.5MB 以内以规避两处上限。
    if ((err as any)?.type === "entity.too.large" || (err as any)?.status === 413) {
      return res.status(413).json({
        error: "上传内容过大",
        message: "图片或文档体积过大,请减少一次上传的数量或换用更小的图片后重试。",
      });
    }
    // 请求体 JSON 解析失败
    if (err instanceof SyntaxError && (err as any)?.status === 400 && "body" in err) {
      return res.status(400).json({ error: "请求格式错误", message: "请求体不是合法 JSON。" });
    }
    console.error("未捕获错误:", err);
    res.status(500).json({ error: "服务器内部错误", message: err.message });
  }
);
