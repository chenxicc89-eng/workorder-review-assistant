import { PrismaClient } from "@prisma/client";

// ==========================================================================
// 单例 Prisma 客户端
// --------------------------------------------------------------------------
// 关键:延迟实例化(lazy)。
//   直接在模块顶层 `new PrismaClient()` 有风险 —— 一旦查询引擎缺失 / DATABASE_URL
//   未配置,构造/加载失败会在【模块加载期】抛错,进而拖垮整个 serverless 函数的
//   冷启动,导致所有 /api/* 全部 500(连不依赖 DB 的 /api/health、OCR 也一起挂)。
//   改为首次真正访问时才构造:DB 出问题只影响 DB 相关路由,健康检查与识别不受牵连。
// ==========================================================================

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const client =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: ["warn", "error"],
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

let instance: PrismaClient | null = null;

/** 惰性获取 Prisma 客户端(首次调用才构造)。构造失败会抛出,由调用方捕获处理。 */
export function getPrisma(): PrismaClient {
  if (!instance) instance = createClient();
  return instance;
}

// 通过 Proxy 暴露与原来完全一致的 `prisma` 用法(prisma.workOrderCase.xxx),
// 但把实际构造推迟到第一次属性访问时,保持各 service 代码零改动。
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
