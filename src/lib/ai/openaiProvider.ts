import OpenAI from "openai";
import type { AiEnvConfig, AiProvider, AiReviewContext, RawReviewOutput } from "./providers";
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from "../prompts/reviewPrompt";
import {
  VERIFY_SYSTEM_PROMPT,
  buildVerifyUserPrompt,
  type PriorReview,
} from "../prompts/verifyPrompt";
import {
  OCR_SYSTEM_PROMPT,
  buildOcrUserPrompt,
  buildTextExtractUserPrompt,
} from "../prompts/ocrPrompt";
import { ORDER_TYPES } from "../standards/defaultStandards";
import type { RiskLevel, ReviewConclusion, OcrExtractResult } from "../types";

// ==========================================================================
// OpenAI 兼容 provider(真实大模型)
// --------------------------------------------------------------------------
// 通过 OpenAI SDK 调用任意 OpenAI 兼容协议服务(OpenAI/DeepSeek/Qwen/Kimi/…)。
// API Key、baseURL、model 全部来自环境变量,绝不硬编码。
// 强制 JSON 输出,解析失败则抛错,由 aiClient 降级到 mock。
// ==========================================================================

const VALID_RISK: RiskLevel[] = ["高", "中", "低"];
const VALID_CONCLUSION: ReviewConclusion[] = ["通过", "建议修改", "建议退回"];

/** 宽松解析并校正大模型返回的 JSON,保证结构合法 */
function normalizeOutput(raw: any): RawReviewOutput {
  const riskLevel: RiskLevel = VALID_RISK.includes(raw?.riskLevel) ? raw.riskLevel : "中";
  const conclusion: ReviewConclusion = VALID_CONCLUSION.includes(raw?.conclusion)
    ? raw.conclusion
    : "建议修改";
  const issues = Array.isArray(raw?.issues)
    ? raw.issues.map((it: any) => ({
        weight: VALID_RISK.includes(it?.weight) ? it.weight : "中",
        category: String(it?.category ?? "其他问题"),
        evidence: String(it?.evidence ?? ""),
        analysis: String(it?.analysis ?? ""),
        requirement: String(it?.requirement ?? ""),
      }))
    : [];
  const summary = Array.isArray(raw?.summary) ? raw.summary.map((s: any) => String(s)) : [];
  const confidence = typeof raw?.confidence === "number" ? raw.confidence : 0.75;
  return {
    conclusion,
    riskLevel,
    summary,
    issues,
    reviewOpinion: String(raw?.reviewOpinion ?? ""),
    confidence,
  };
}

function parseJson(content: string): any {
  // 兼容模型偶尔包裹 ```json 代码块的情况
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

/** 校正 OCR 抽取输出:工单类型必须在枚举内否则置空,confidence clamp */
function normalizeOcr(raw: any): OcrExtractResult {
  const orderType = (ORDER_TYPES as readonly string[]).includes(raw?.orderType)
    ? String(raw.orderType)
    : "";
  let confidence = typeof raw?.confidence === "number" ? raw.confidence : 0.6;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    orderType,
    orderNo: raw?.orderNo ? String(raw.orderNo) : "",
    citizenAppeal: String(raw?.citizenAppeal ?? ""),
    replyContent: String(raw?.replyContent ?? ""),
    unit: raw?.unit ? String(raw.unit) : "",
    attachmentNote: raw?.attachmentNote ? String(raw.attachmentNote) : "",
    rawText: String(raw?.rawText ?? ""),
    confidence: Math.round(confidence * 100) / 100,
    notes: raw?.notes ? String(raw.notes) : "",
  };
}

export function createOpenAiProvider(env: AiEnvConfig): AiProvider {
  // 文本审核客户端
  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseUrl,
  });

  // 视觉客户端:允许与文本用不同服务商(如文本 DeepSeek、图片 OpenAI)。
  // 若视觉未单独配置,visionBaseUrl/visionApiKey 已在 readAiEnv 回退为文本那套。
  const visionClient =
    env.visionBaseUrl === env.baseUrl && env.visionApiKey === env.apiKey
      ? client
      : new OpenAI({ apiKey: env.visionApiKey, baseURL: env.visionBaseUrl });

  async function chat(system: string, user: string): Promise<RawReviewOutput> {
    const resp = await client.chat.completions.create({
      model: env.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = resp.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI 返回内容为空");
    return normalizeOutput(parseJson(content));
  }

  /** 视觉调用:文字 + 多张图片(image_url data URL)混排 */
  async function visionExtract(images: string[]): Promise<OcrExtractResult> {
    if (!env.visionEnabled) {
      throw new Error(
        "未配置图片识别所需的视觉模型 Key(AI_VISION_API_KEY),请配置后重试或改用手动粘贴。"
      );
    }
    const resp = await visionClient.chat.completions.create({
      model: env.visionModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildOcrUserPrompt(ORDER_TYPES) },
            ...images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        },
      ],
    });
    const content = resp.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI 返回内容为空");
    return normalizeOcr(parseJson(content));
  }

  /** 文本抽取:Word/Excel 解析出的文本走文本模型(client,非视觉),拆分字段 */
  async function textExtract(text: string): Promise<OcrExtractResult> {
    const resp = await client.chat.completions.create({
      model: env.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { role: "user", content: buildTextExtractUserPrompt(ORDER_TYPES, text) },
      ],
    });
    const content = resp.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI 返回内容为空");
    const result = normalizeOcr(parseJson(content));
    // 保底:模型没回 rawText 时用原文档文本填充,便于核对
    if (!result.rawText) result.rawText = text;
    return result;
  }

  return {
    mode: "real",
    name: `openai-compatible(text=${env.model}, vision=${env.visionEnabled ? env.visionModel : "off"})`,
    supportsVision: env.visionEnabled,

    async review(ctx: AiReviewContext): Promise<RawReviewOutput> {
      return chat(
        REVIEW_SYSTEM_PROMPT,
        buildReviewUserPrompt({
          input: ctx.input,
          ruleFindings: ctx.ruleFindings,
          standard: ctx.standard,
        })
      );
    },

    async verify(ctx: AiReviewContext, prior: RawReviewOutput): Promise<RawReviewOutput> {
      const priorForPrompt: PriorReview = {
        conclusion: prior.conclusion,
        riskLevel: prior.riskLevel,
        summary: prior.summary,
        issues: prior.issues,
        reviewOpinion: prior.reviewOpinion,
        confidence: prior.confidence,
      };
      return chat(
        VERIFY_SYSTEM_PROMPT,
        buildVerifyUserPrompt({
          input: ctx.input,
          ruleFindings: ctx.ruleFindings,
          standard: ctx.standard,
          prior: priorForPrompt,
        })
      );
    },

    async extractFromImages(images: string[]): Promise<OcrExtractResult> {
      return visionExtract(images);
    },

    async extractFromText(text: string): Promise<OcrExtractResult> {
      return textExtract(text);
    },
  };
}
