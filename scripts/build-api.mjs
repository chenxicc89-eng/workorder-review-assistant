// 把 Vercel Serverless Function 入口 api/_app.ts 及其整个 src/ 依赖图,
// 用 esbuild 打包成自包含的单文件 api/index.mjs。
//
// 为什么需要:项目是 "type":"module"(纯 ESM),而 src/server、src/lib 下大量
// 相对 import 省略了 .js 扩展名(bundler 风格)。Vercel 的 @vercel/node 在 ESM 下
// 会把这些无扩展名 import 原样保留到运行时,Node 无法解析 → ERR_MODULE_NOT_FOUND
// → 函数冷启动即崩溃,所有 /api/* 返回 500(含 /api/health)。
// 预打包后函数不再有任何未解析的相对 import,从根本上消除该问题。
//
// external:
//   @prisma/client —— Prisma 运行时按文件系统就近查找原生查询引擎
//     (node_modules/.prisma/client/libquery_engine-*.node),打包进来会破坏引擎解析,
//      故保持 external,并在 vercel.json 用 includeFiles 确保引擎随函数部署。
//   openai        —— 体积大且为纯运行时依赖,保持 external 从函数 node_modules 解析即可。
import { build } from "esbuild";

await build({
  entryPoints: ["api/_app.ts"],
  outfile: "api/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["@prisma/client", "openai"],
  // 打包后的 ESM 里会包含来自 CJS 依赖(express/cors 等)的 require(...),
  // ESM 顶层没有 require,需要用 createRequire 兜底,否则运行时报 "require is not defined"。
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log("✅ api/index.mjs 打包完成");
