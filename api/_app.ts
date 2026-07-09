// Vercel Serverless Function 入口(源码,非路由)。
// api/ 下以「_」开头的文件不会被 Vercel 当作函数;构建时由 scripts/build-api.mjs
// 用 esbuild 打包成自包含的 api/index.mjs 作为真正的函数。
// 这样可避免 ESM 下无扩展名相对 import 在 Vercel 运行时报 ERR_MODULE_NOT_FOUND
// (整个 src/server、src/lib 依赖图会被内联进单文件)。
// 所有路由/service/AI 逻辑复用 src/server 下的现有实现,无需逐个改写。
import { app } from "../src/server/app";

export default app;
