// ==========================================================================
// 核心类型定义 —— 前后端共享单一来源 (single source of truth)
// 后端用 tsx 直接运行 TS,前端由 Vite 编译,均 import 本文件。
// ==========================================================================

export type RiskLevel = "高" | "中" | "低";

export type ReviewConclusion = "通过" | "建议修改" | "建议退回";

/** 问题来源:本地规则 / AI 语义 / 二者合并 */
export type IssueSource = "rule" | "ai" | "merged";

/** 单条审核问题 */
export interface ReviewIssue {
  id: string;
  weight: RiskLevel;
  /** 问题分类,例如「联系情况前后矛盾」 */
  category: string;
  /** 原文依据(截取自诉求或回单) */
  evidence: string;
  /** 问题分析说明 */
  analysis: string;
  /** 整改要求 */
  requirement: string;
  source: IssueSource;
}

/** 最终审核结果(AI 与系统统一输出结构) */
export interface ReviewResult {
  conclusion: ReviewConclusion;
  riskLevel: RiskLevel;
  /** 问题摘要,用标签展示 */
  summary: string[];
  /** 合并后的问题明细 */
  issues: ReviewIssue[];
  /** 可直接复制的正式审核意见 */
  reviewOpinion: string;
  /** 本地规则命中结果 */
  ruleFindings: ReviewIssue[];
  /** AI 语义分析结果 */
  aiFindings: ReviewIssue[];
  /** 置信度 0~1 */
  confidence: number;
  /** 运行模式提示:是否走了真实 AI(用于前端展示) */
  aiMode?: "real" | "mock";
}

/** 工单输入 */
export interface WorkOrderInput {
  orderNo?: string;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  attachmentNote?: string;
  unit?: string;
  remark?: string;
}

/** 图片/文件 OCR 识别并抽取后的工单字段 */
export interface OcrExtractResult {
  /** 已映射到 ORDER_TYPES 的工单类型;无法确定则为 "" 由用户手动选择 */
  orderType: string;
  orderNo?: string;
  citizenAppeal: string;
  replyContent: string;
  unit?: string;
  attachmentNote?: string;
  /** OCR 识别的完整原文(供人工核对/兜底) */
  rawText: string;
  /** 识别 + 拆分置信度 0~1 */
  confidence: number;
  /** AI 对拆分的说明 / 不确定项 / mock 提示 */
  notes?: string;
}

/** 回单规范(规范库中的一条) */
export interface RuleStandard {
  id: string;
  orderType: string;
  name: string;
  requiredItems: string[];
  highRiskIssues: string[];
  mediumRiskIssues: string[];
  lowRiskIssues: string[];
  standardRequirements: string[];
  standardOpinionTemplates: string[];
  examples?: {
    good?: string[];
    bad?: string[];
  };
}

// ---- 与后端 API 交互用的辅助类型 ----

/** 历史案例(GET /api/cases 列表项 / 详情) */
export interface WorkOrderCaseRecord {
  id: string;
  orderNo?: string | null;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  attachmentNote?: string | null;
  unit?: string | null;
  remark?: string | null;
  conclusion: ReviewConclusion;
  riskLevel: RiskLevel;
  summary: string[];
  issues: ReviewIssue[];
  reviewOpinion: string;
  confidence?: number | null;
  finalOpinion?: string | null;
  humanEdited: boolean;
  isFalsePositive: boolean;
  falsePositiveNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 保存案例请求体 */
export interface SaveCasePayload {
  input: WorkOrderInput;
  result: ReviewResult;
  finalOpinion?: string;
  humanEdited?: boolean;
}

/** 修改案例请求体 */
export interface PatchCasePayload {
  finalOpinion?: string;
  isFalsePositive?: boolean;
  falsePositiveNote?: string;
  humanEdited?: boolean;
}

/** 案例查询过滤 */
export interface CaseQuery {
  orderType?: string;
  riskLevel?: RiskLevel;
  keyword?: string;
  from?: string;
  to?: string;
  isFalsePositive?: boolean;
}
