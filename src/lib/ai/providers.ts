import type {
  RiskLevel,
  ReviewConclusion,
  RuleStandard,
  WorkOrderInput,
  ReviewIssue,
  OcrExtractResult,
} from "../types";

// ==========================================================================
// AI Provider 抽象层
// --------------------------------------------------------------------------
// 把大模型调用抽象成统一接口,后期可切换 OpenAI / DeepSeek / Qwen / 本地模型。
// review = 主审核,verify = 复核。二者都返回 RawReviewOutput(未合并的原始结论)。
// getProvider() 依据环境变量决定使用真实 provider 还是 mock。
// ==========================================================================

/** 大模型原始输出的单条问题(尚未附加 id / source) */
export interface RawIssue {
  weight: RiskLevel;
  category: string;
  evidence: string;
  analysis: string;
  requirement: string;
}

/** 大模型一轮审核/复核的原始输出结构 */
export interface RawReviewOutput {
  conclusion: ReviewConclusion;
  riskLevel: RiskLevel;
  summary: string[];
  issues: RawIssue[];
  reviewOpinion: string;
  confidence: number;
}

/** 传给 provider 的上下文 */
export interface AiReviewContext {
  input: WorkOrderInput;
  ruleFindings: ReviewIssue[];
  standard?: RuleStandard | null;
}

/** provider 统一接口 */
export interface AiProvider {
  /** 运行模式标识,用于结果展示 */
  readonly mode: "real" | "mock";
  /** provider 名称,便于日志与调试 */
  readonly name: string;
  /** 是否支持图片识别(视觉多模态) */
  readonly supportsVision: boolean;
  /** 第二步:主审核 */
  review(ctx: AiReviewContext): Promise<RawReviewOutput>;
  /** 第三步:复核(基于主审核结果) */
  verify(ctx: AiReviewContext, prior: RawReviewOutput): Promise<RawReviewOutput>;
  /** 图片 OCR + 字段抽取。images 为 base64 data URL 数组。 */
  extractFromImages(images: string[]): Promise<OcrExtractResult>;
  /** 纯文本(Word/Excel 解析结果)字段抽取。走文本模型,不依赖视觉。 */
  extractFromText(text: string): Promise<OcrExtractResult>;
}

// ---- provider 选择 ----
// 延迟 require,避免前端打包时把 openai SDK 打进来(providers 仅后端使用)。

interface AiEnvConfig {
  enabled: boolean;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 视觉模型(图片识别)。未配置时复用 model。 */
  visionModel: string;
  /** 视觉服务的 Base URL。未配置时复用 baseUrl(与文本同一家)。 */
  visionBaseUrl: string;
  /** 视觉服务的 API Key。未配置时复用 apiKey(与文本同一家)。 */
  visionApiKey: string;
  /**
   * 视觉是否可用:AI 已启用,且视觉那侧有 key(独立 key 或复用文本 key)。
   * 用于图片识别功能的可用性判定,与文本审核相互独立。
   */
  visionEnabled: boolean;
}

export function readAiEnv(): AiEnvConfig {
  const enabled = String(process.env.AI_ENABLED ?? "").toLowerCase() === "true";
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const apiKey = process.env.AI_API_KEY ?? "";
  const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

  // 视觉可独立配置一家(如文本 DeepSeek、图片 OpenAI);缺省则回退到文本那套。
  const visionApiKey = (process.env.AI_VISION_API_KEY ?? "").trim() || apiKey;
  const visionBaseUrl = (process.env.AI_VISION_BASE_URL ?? "").trim() || baseUrl;
  const visionModel = (process.env.AI_VISION_MODEL ?? "").trim() || model;

  return {
    enabled,
    provider: process.env.AI_PROVIDER ?? "openai",
    apiKey,
    baseUrl,
    model,
    visionModel,
    visionBaseUrl,
    visionApiKey,
    visionEnabled: enabled && !!visionApiKey.trim(),
  };
}

/**
 * 根据环境变量返回 provider。
 * AI_ENABLED=true 且 AI_API_KEY 非空 → 真实 OpenAI 兼容 provider;
 * 否则 → mockProvider(确定性模拟,保证无 Key 也能完整跑通)。
 */
export async function getProvider(): Promise<AiProvider> {
  const env = readAiEnv();
  if (env.enabled && env.apiKey.trim()) {
    const { createOpenAiProvider } = await import("./openaiProvider");
    return createOpenAiProvider(env);
  }
  const { mockProvider } = await import("./mockProvider");
  return mockProvider;
}

export type { AiEnvConfig };
