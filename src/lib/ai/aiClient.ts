import { getProvider, type AiProvider, type AiReviewContext, type RawReviewOutput } from "./providers";
import { mockProvider } from "./mockProvider";
import type { OcrExtractResult } from "../types";

// ==========================================================================
// AI Client —— 三段式审核的统一入口
// --------------------------------------------------------------------------
// runFullReview: 主审核 → 复核,返回最终原始输出与运行模式。
// 真实 provider 调用出错时,自动降级到 mock,并把 mode 标记为 "mock",
// 保证服务永不因 AI 异常而中断。
// ==========================================================================

export interface AiRunResult {
  /** verify 之后的最终原始输出 */
  output: RawReviewOutput;
  /** 主审核输出(便于调试 / 展示中间态) */
  primary: RawReviewOutput;
  /** 实际生效的运行模式 */
  mode: "real" | "mock";
  /** 若发生降级,记录原因(用于日志与前端提示) */
  degraded?: string;
}

export async function runFullReview(ctx: AiReviewContext): Promise<AiRunResult> {
  let provider: AiProvider;
  try {
    provider = await getProvider();
  } catch {
    provider = mockProvider;
  }

  try {
    const primary = await provider.review(ctx);
    const output = await provider.verify(ctx, primary);
    return { output, primary, mode: provider.mode };
  } catch (err) {
    // 真实 provider 出错 → 降级到 mock,保证流程不中断
    if (provider.mode === "real") {
      const primary = await mockProvider.review(ctx);
      const output = await mockProvider.verify(ctx, primary);
      return {
        output,
        primary,
        mode: "mock",
        degraded: `真实 AI 调用失败,已降级到 mock:${(err as Error).message}`,
      };
    }
    throw err;
  }
}

/**
 * 图片 OCR + 字段抽取。
 * - 无 Key → mock provider,返回内置示例(带 mock 提示),UI 可演示;
 * - 真实 provider 若不支持视觉或调用失败 → 抛出可读错误(前端提示改用手动粘贴),
 *   不静默返回 mock 假数据以免误导。
 */
export async function runExtract(images: string[]): Promise<OcrExtractResult> {
  if (!images.length) throw new Error("未提供任何图片");
  let provider: AiProvider;
  try {
    provider = await getProvider();
  } catch {
    provider = mockProvider;
  }

  if (provider.mode === "mock") {
    return provider.extractFromImages(images);
  }

  if (!provider.supportsVision) {
    throw new Error("当前模型不支持图片识别,请配置 AI_VISION_MODEL 或改用手动粘贴。");
  }
  try {
    return await provider.extractFromImages(images);
  } catch (err) {
    throw new Error(
      `图片识别失败:${(err as Error).message}。请确认所配模型支持视觉(可设 AI_VISION_MODEL),或改用手动粘贴。`
    );
  }
}

/**
 * Word/Excel 文本 → 字段抽取(走文本模型,不依赖视觉)。
 * - mock → 返回内置示例;
 * - 真实 provider → 直接调 extractFromText,失败抛可读错误。
 */
export async function runExtractText(text: string): Promise<OcrExtractResult> {
  if (!text.trim()) throw new Error("文档内容为空");
  let provider: AiProvider;
  try {
    provider = await getProvider();
  } catch {
    provider = mockProvider;
  }

  if (provider.mode === "mock") {
    return provider.extractFromText(text);
  }
  try {
    return await provider.extractFromText(text);
  } catch (err) {
    throw new Error(
      `文档识别失败:${(err as Error).message}。请确认已配置文本模型(AI_API_KEY),或改用手动粘贴。`
    );
  }
}

/** 暴露单步调用(供扩展 / 测试) */
export async function runReview(ctx: AiReviewContext): Promise<RawReviewOutput> {
  const provider = await getProvider();
  return provider.review(ctx);
}

export async function runVerify(
  ctx: AiReviewContext,
  prior: RawReviewOutput
): Promise<RawReviewOutput> {
  const provider = await getProvider();
  return provider.verify(ctx, prior);
}
