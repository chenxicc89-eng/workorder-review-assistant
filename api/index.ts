// Vercel Serverless Function 入口。
// 把整个 Express app 作为 handler 导出;vercel.json 把 /api/* 全部重写到这里。
// 所有路由/service/AI 逻辑复用 src/server 下的现有实现,无需逐个改写。
import { app } from "../src/server/app";

export default app;
