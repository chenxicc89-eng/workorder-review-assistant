import "dotenv/config";
import express from "express";
import cors from "cors";
import { reviewRouter } from "./routes/review";
import { casesRouter } from "./routes/cases";
import { standardsRouter } from "./routes/standards";
import { ocrRouter } from "./routes/ocr";
import { readAiEnv } from "../lib/ai/providers";

// ==========================================================================
// Express app 组装(不 listen)
// --------------------------------------------------------------------------
// 本地 dev 由 index.ts import 后 app.listen;
// Vercel serverless 由 api/index.ts 直接把本 app 当 handler。
// ==========================================================================

export const app = express();
app.use(cors());
// 图片以 base64 data URL 提交,请求体上限。Vercel serverless 硬上限约 4.5MB,
// 前端会激进压缩,这里设 4mb 与之对齐(本地不受此约束)。
app.use(express.json({ limit: "4mb" }));

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

// 兜底错误处理
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("未捕获错误:", err);
    res.status(500).json({ error: "服务器内部错误", message: err.message });
  }
);
