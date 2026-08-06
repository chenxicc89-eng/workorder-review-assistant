import { prisma } from "../db";
import type {
  CaseQuery,
  PatchCasePayload,
  ReviewIssue,
  ReviewResult,
  WorkOrderCaseRecord,
  WorkOrderInput,
  ReviewConclusion,
  RiskLevel,
} from "../../lib/types";
import type { Prisma } from "@prisma/client";

// ==========================================================================
// 历史案例服务
// --------------------------------------------------------------------------
// summary/issues 以 JSON 字符串列存储;读出时反序列化为对象。
// 支持按工单类型 / 风险等级 / 关键词 / 时间范围 / 是否误判过滤。
// ==========================================================================

type CaseRow = {
  id: string;
  orderNo: string | null;
  orderType: string;
  citizenAppeal: string;
  replyContent: string;
  evaluationReport: string | null;
  attachmentNote: string | null;
  unit: string | null;
  remark: string | null;
  conclusion: string;
  riskLevel: string;
  summaryJson: string;
  issuesJson: string;
  reviewOpinion: string;
  confidence: number | null;
  finalOpinion: string | null;
  humanEdited: boolean;
  isFalsePositive: boolean;
  falsePositiveNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: CaseRow): WorkOrderCaseRecord {
  return {
    id: row.id,
    orderNo: row.orderNo,
    orderType: row.orderType,
    citizenAppeal: row.citizenAppeal,
    replyContent: row.replyContent,
    evaluationReport: row.evaluationReport,
    attachmentNote: row.attachmentNote,
    unit: row.unit,
    remark: row.remark,
    conclusion: row.conclusion as ReviewConclusion,
    riskLevel: row.riskLevel as RiskLevel,
    summary: safeParse<string[]>(row.summaryJson, []),
    issues: safeParse<ReviewIssue[]>(row.issuesJson, []),
    reviewOpinion: row.reviewOpinion,
    confidence: row.confidence,
    finalOpinion: row.finalOpinion,
    humanEdited: row.humanEdited,
    isFalsePositive: row.isFalsePositive,
    falsePositiveNote: row.falsePositiveNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface SaveCaseInput {
  input: WorkOrderInput;
  result: ReviewResult;
  finalOpinion?: string;
  humanEdited?: boolean;
}

/** 保存案例 */
export async function saveCase(payload: SaveCaseInput): Promise<WorkOrderCaseRecord> {
  const { input, result } = payload;
  const created = await prisma.workOrderCase.create({
    data: {
      orderNo: input.orderNo || null,
      orderType: input.orderType,
      citizenAppeal: input.citizenAppeal,
      replyContent: input.replyContent,
      evaluationReport: input.evaluationReport || null,
      attachmentNote: input.attachmentNote || null,
      unit: input.unit || null,
      remark: input.remark || null,
      conclusion: result.conclusion,
      riskLevel: result.riskLevel,
      summaryJson: JSON.stringify(result.summary ?? []),
      issuesJson: JSON.stringify(result.issues ?? []),
      reviewOpinion: result.reviewOpinion,
      confidence: result.confidence ?? null,
      finalOpinion: payload.finalOpinion ?? null,
      humanEdited: payload.humanEdited ?? false,
    },
  });
  return rowToRecord(created);
}

/** 查询案例列表 */
export async function listCases(query: CaseQuery): Promise<WorkOrderCaseRecord[]> {
  const where: Prisma.WorkOrderCaseWhereInput = {};
  if (query.orderType) where.orderType = query.orderType;
  if (query.riskLevel) where.riskLevel = query.riskLevel;
  if (typeof query.isFalsePositive === "boolean") where.isFalsePositive = query.isFalsePositive;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(query.from);
    if (query.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(query.to);
  }
  if (query.keyword) {
    const kw = query.keyword;
    where.OR = [
      { citizenAppeal: { contains: kw } },
      { replyContent: { contains: kw } },
      { evaluationReport: { contains: kw } },
      { reviewOpinion: { contains: kw } },
      { orderNo: { contains: kw } },
      { unit: { contains: kw } },
    ];
  }
  const rows = await prisma.workOrderCase.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map(rowToRecord);
}

/** 获取单条案例详情 */
export async function getCase(id: string): Promise<WorkOrderCaseRecord | null> {
  const row = await prisma.workOrderCase.findUnique({ where: { id } });
  return row ? rowToRecord(row) : null;
}

/** 修改案例(最终意见 / 误判标记 / 备注) */
export async function patchCase(
  id: string,
  patch: PatchCasePayload
): Promise<WorkOrderCaseRecord> {
  const data: Prisma.WorkOrderCaseUpdateInput = {};
  if (patch.finalOpinion !== undefined) {
    data.finalOpinion = patch.finalOpinion;
    data.humanEdited = true;
  }
  if (patch.humanEdited !== undefined) data.humanEdited = patch.humanEdited;
  if (patch.isFalsePositive !== undefined) data.isFalsePositive = patch.isFalsePositive;
  if (patch.falsePositiveNote !== undefined) data.falsePositiveNote = patch.falsePositiveNote;

  const updated = await prisma.workOrderCase.update({ where: { id }, data });
  return rowToRecord(updated);
}
