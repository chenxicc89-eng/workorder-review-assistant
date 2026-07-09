import { app } from "./app";
import { readAiEnv } from "../lib/ai/providers";

// ==========================================================================
// 本地开发入口:启动常驻 Express 服务。
// (Vercel 部署不走这里,而是 api/index.ts 把 app 当 serverless handler。)
// ==========================================================================

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  const env = readAiEnv();
  const mode = env.enabled && env.apiKey.trim() ? `real (${env.model})` : "mock";
  console.log(`\n  ✅ 12345回单智能预审助手 后端已启动`);
  console.log(`     http://localhost:${PORT}`);
  console.log(`     AI 模式: ${mode}\n`);
});
