// Vercel Serverless Function 入口(真正被 Vercel 识别的函数文件)。
//
// 为什么这么绕:项目是 "type":"module"(纯 ESM),src/server、src/lib 下大量相对
// import 省略了 .js 扩展名。若让 Vercel 直接编译并运行会得到:
//   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/server/app'
// 因为 ESM 运行时要求相对 import 带显式扩展名。
//
// 解决:构建时(scripts/build-api.mjs)用 esbuild 把入口 api/_bundle_entry.ts 及其整个
// src/ 依赖图打包成自包含的 api/_bundle.mjs;本文件只用【带扩展名】的 import 引用它。
// 带扩展名的相对 import 在 ESM 运行时能正常解析,而 _bundle.mjs 内部已无任何未解析 import。
//
// 注:functions 配置必须匹配仓库里真实存在的源文件(本文件 api/index.ts),
//     所以这里保留一个薄入口,而不是直接把打包产物设为函数。
import app from "./_bundle.mjs";

export default app;
