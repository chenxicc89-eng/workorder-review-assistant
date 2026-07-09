/// <reference types="vite/client" />
// vite/client 已声明 `*?url` 等虚拟模块类型,pdfjs worker 的 ?url 引入据此通过 tsc。

// mammoth 的浏览器构建无类型声明,这里补一个最小声明(仅用到 extractRawText)。
declare module "mammoth/mammoth.browser" {
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<{ value: string; messages: unknown[] }>;
  const _default: { extractRawText: typeof extractRawText };
  export default _default;
}
