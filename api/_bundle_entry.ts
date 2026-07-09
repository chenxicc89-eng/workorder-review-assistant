// esbuild 打包入口(源码,非路由;api/ 下「_」开头文件不会被 Vercel 当作函数)。
// 由 scripts/build-api.mjs 打包成自包含的 api/_bundle.mjs,再由 api/index.ts 引用。
// 打包会把整个 src/server、src/lib 依赖图内联,消除 ESM 下无扩展名相对 import
// 在 Vercel 运行时报 ERR_MODULE_NOT_FOUND 的问题。
// 所有路由/service/AI 逻辑复用 src/server 下的现有实现,无需逐个改写。
import { app } from "../src/server/app";

export default app;
