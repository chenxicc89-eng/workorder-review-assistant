// ==========================================================================
// 核心类型定义 —— 前后端共享单一来源 (single source of truth)
// 后端用 tsx 直接运行 TS,前端由 Vite 编译,均 import 本文件。
// ==========================================================================

export type RiskLevel = "高" | "中" | "低";

export type ReviewConclusion = "通过" | "建议修改" | "建议退回";

/** 问题来源:本地规则 / AI 语义 / 二者合并 */
export type IssueSource = "rule" | "ai" | "merged";

/** 问题针对的审核材料 */
export type ReviewIssueTarget = "reply" | "evaluation_report" | "cross_material";

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
  /** 回单、评价报告，或两份材料之间的一致性问题 */
  target?: ReviewIssueTarget;
}

/** 本次审核引用的单条历史反馈的摘要(用于让"学习"对用户可见) */
export interface LearningRef {
  /** 该反馈来自的工单类型 */
  orderType: string;
  /** 是否与当前工单同类型(跨类参考会标记为 false) */
  sameType: boolean;
  /** 语义相似度 0~1(仅 Tier2 语义检索时有;Tier1 recency 回退时为 undefined) */
  similarity?: number;
  /** 一句话要点:误判原因或人工意见的摘要 */
  gist: string;
}

/** 本次审核的"学习依据"汇总:参考了哪些历史反馈 / 是否应用了提炼准则 */
export interface LearningContext {
  /** 本次注入 prompt 的历史纠错条数 */
  usedCorrectionCount: number;
  /** 引用的历史反馈摘要(供前端展示) */
  usedCorrections: LearningRef[];
  /** 生效规范的名称(内置默认或库中规范) */
  appliedStandardName?: string;
  /** 生效规范中"从反馈提炼的准则/豁免"条数(Tier3;当前无则为 0) */
  distilledRuleCount: number;
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
  /** 本次审核的学习依据(引用了哪些历史反馈/准则),让持续学习对用户可见 */
  learningContext?: LearningContext;
}

/** 工单输入 */
export interface WorkOrderInput {
  orderNo?: string;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  evaluationReport?: string;
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
  /** 不计入考核评价报告/案件不计入评价情况说明 */
  evaluationReport?: string;
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
  /**
   * Tier3:从历史反馈提炼、并经人工采纳的「加强准则」。
   * 随规范块(formatStandard)一同注入审核 prompt,不占 few-shot 预算 → 永久生效。
   */
  learnedRules?: string[];
  /**
   * Tier3:从历史误判提炼、并经人工采纳的「豁免准则」(以下情形不应报为问题)。
   */
  learnedExemptions?: string[];
}

/** 从模板文件(回单范例)AI 抽取出的规范结果(入库前的预览形态) */
export interface StandardExtractResult {
  /** 抽取出的一个或多个类型规范;id 留空,入库时由服务端定 */
  standards: RuleStandard[];
  /** AI 对不确定项 / mock 提示的说明 */
  notes?: string;
  /** 抽取置信度 0~1 */
  confidence: number;
}

/** Tier3:一条学习到的规则(蒸馏候选 / 已采纳规则)的类型 */
export type LearnedRuleKind = "reinforce" | "exempt";
export type LearnedRuleStatus = "pending" | "adopted" | "rejected";
export type LearnedRuleSource = "correction" | "approved_case";
export type LearnedCandidateType =
  | "reinforce"
  | "exemption"
  | "required_item"
  | "requirement"
  | "good_example";

/** Tier3:LLM 从历史反馈蒸馏出的候选规则(尚未落库前的形状) */
export interface DistilledCandidate {
  /** reinforce=加强规则(补 AI 漏报);exempt=豁免规则(止 AI 误报) */
  kind: LearnedRuleKind;
  /** 规则正文(一句可直接放进规范的表述) */
  text: string;
  /** 提炼理由(给人工审核看,不进审核 prompt) */
  rationale: string;
  /** 支撑该规则的历史案例 id(溯源) */
  supportingCaseIds: string[];
  /** 加强规则的建议风险等级(exempt 可空) */
  riskLevel?: RiskLevel;
  /** 蒸馏置信度 0~1 */
  confidence: number;
}

/** Tier3:一条学习规则记录(GET /api/learning/rules 列表项 / 详情) */
export interface LearnedRuleRecord extends DistilledCandidate {
  id: string;
  orderType: string;
  status: LearnedRuleStatus;
  /** 同一批「生成候选」的批次标识,便于按批查看 */
  sourceBatchId: string;
  createdAt: string;
  updatedAt: string;
  adoptedAt?: string | null;
  sourceType: LearnedRuleSource;
  candidateType: LearnedCandidateType;
  conflictStatus: "none" | "duplicate" | "conflict";
  conflictDetail?: string | null;
}

export interface StandardVersionRecord {
  id: string;
  standardRuleId: string;
  orderType: string;
  version: number;
  standard: RuleStandard;
  source: "manual" | "template_import" | "learning" | "rollback";
  note?: string | null;
  createdAt: string;
}

export interface StandardDiff {
  added: Partial<Record<keyof RuleStandard, string[]>>;
  removed: Partial<Record<keyof RuleStandard, string[]>>;
}

export interface StandardEvaluation {
  orderType: string;
  sampleCount: number;
  previousVersion?: number;
  currentVersion?: number;
  before: { passCount: number; issueCount: number };
  after: { passCount: number; issueCount: number };
}

/** 批量导入前端提交的一条已通过工单。 */
export interface ApprovedCaseInput {
  orderNo: string;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  evaluationReport?: string;
  unit?: string;
}

export interface ApprovedCaseRecord extends ApprovedCaseInput {
  id: string;
  batchId: string;
  sourceFile?: string | null;
  createdAt: string;
}

export interface ImportBatchRecord {
  id: string;
  name: string;
  fileName?: string | null;
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  createdAt: string;
}

/** 从已通过样本提炼前传给 AI 的轻量证据。 */
export interface ApprovedLearningExample {
  caseId: string;
  orderNo: string;
  citizenAppeal: string;
  replyContent: string;
  evaluationReport?: string;
}

export interface ApprovedDistilledCandidate extends DistilledCandidate {
  candidateType: Exclude<LearnedCandidateType, "reinforce">;
}

// ---- 与后端 API 交互用的辅助类型 ----

/** 历史案例(GET /api/cases 列表项 / 详情) */
export interface WorkOrderCaseRecord {
  id: string;
  orderNo?: string | null;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  evaluationReport?: string | null;
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
