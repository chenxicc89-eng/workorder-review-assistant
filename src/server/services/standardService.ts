import { prisma } from "../db";
import type { RuleStandard, StandardVersionRecord, StandardEvaluation } from "../../lib/types";
import { getProvider } from "../../lib/ai/providers";
import { listApprovedCases } from "./approvedCaseService";
import { getDefaultStandard, DEFAULT_STANDARDS } from "../../lib/standards/defaultStandards";

// ==========================================================================
// 规范库服务
// --------------------------------------------------------------------------
// StandardRule 表中 contentJson 存完整 RuleStandard。
// 读出时以 contentJson 为准,并用行的 id/orderType/name/enabled 校正。
// ==========================================================================

export interface StandardRow {
  id: string;
  orderType: string;
  name: string;
  enabled: boolean;
  standard: RuleStandard;
  createdAt: string;
  updatedAt: string;
}

function rowToStandard(row: {
  id: string;
  orderType: string;
  name: string;
  contentJson: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StandardRow {
  let parsed: RuleStandard;
  try {
    parsed = JSON.parse(row.contentJson);
  } catch {
    parsed = getDefaultStandard(row.orderType);
  }
  // 以行字段为准校正
  const standard: RuleStandard = { ...parsed, id: row.id, orderType: row.orderType, name: row.name };
  return {
    id: row.id,
    orderType: row.orderType,
    name: row.name,
    enabled: row.enabled,
    standard,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 把内置默认规范包装成 StandardRow(数据库为空时的兜底展示) */
function builtinAsRows(orderType?: string): StandardRow[] {
  const now = new Date().toISOString();
  return DEFAULT_STANDARDS.filter((s) => !orderType || s.orderType === orderType).map((s) => ({
    id: s.id,
    orderType: s.orderType,
    name: s.name,
    enabled: true,
    standard: s,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * 列出全部规范(可按类型过滤)。
 * 数据库为空时(如刚部署未 seed)自动返回内置默认规范,保证开箱即用;
 * 一旦库中有数据,则以库为准。用户新增/编辑会正常写入库。
 */
export async function listStandards(orderType?: string): Promise<StandardRow[]> {
  const rows = await prisma.standardRule.findMany({
    where: orderType ? { orderType } : undefined,
    orderBy: { orderType: "asc" },
  });
  if (rows.length === 0) {
    // 全库是否真的为空(避免"按类型过滤后为空"却误判)
    const total = orderType ? await prisma.standardRule.count() : 0;
    if (!orderType || total === 0) return builtinAsRows(orderType);
  }
  return rows.map(rowToStandard);
}

/**
 * 取某工单类型当前生效的规范(供审核使用)。
 * 优先取数据库中 enabled 的记录;数据库无记录时回退内置默认。
 */
export async function getActiveStandard(orderType: string): Promise<RuleStandard> {
  const row = await prisma.standardRule.findFirst({
    where: { orderType, enabled: true },
    orderBy: { updatedAt: "desc" },
  });
  if (row) return rowToStandard(row).standard;
  return getDefaultStandard(orderType);
}

export interface UpsertStandardInput {
  id?: string;
  orderType: string;
  name: string;
  standard: RuleStandard;
  enabled?: boolean;
  source?: "manual" | "template_import" | "learning" | "rollback";
  note?: string;
}

/** 新增或更新规范 */
export async function upsertStandard(input: UpsertStandardInput): Promise<StandardRow> {
  const contentJson = JSON.stringify(input.standard);
  if (input.id) {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.standardRule.update({
        where: { id: input.id },
        data: {
          orderType: input.orderType,
          name: input.name,
          contentJson,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        },
      });
      const latest = await tx.standardVersion.findFirst({
        where: { standardRuleId: row.id },
        orderBy: { version: "desc" },
      });
      await tx.standardVersion.create({
        data: {
          standardRuleId: row.id,
          orderType: input.orderType,
          version: (latest?.version ?? 0) + 1,
          snapshotJson: contentJson,
          source: input.source ?? "manual",
          note: input.note ?? null,
        },
      });
      return row;
    });
    return rowToStandard(updated);
  }
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.standardRule.create({
      data: {
        orderType: input.orderType,
        name: input.name,
        contentJson,
        enabled: input.enabled ?? true,
      },
    });
    await tx.standardVersion.create({
      data: {
        standardRuleId: row.id,
        orderType: input.orderType,
        version: 1,
        snapshotJson: contentJson,
        source: input.source ?? "manual",
        note: input.note ?? null,
      },
    });
    return row;
  });
  return rowToStandard(created);
}

/**
 * 按工单类型 upsert(用于「从模板导入」的覆盖策略):
 * 该类型已有 enabled 记录 → 更新它(覆盖旧规范);否则新建。
 * 传入的 standard 会被强制对齐 orderType,并清掉 id(以行为准)。
 */
export async function upsertStandardByOrderType(
  orderType: string,
  name: string,
  standard: RuleStandard
): Promise<StandardRow> {
  const existing = await prisma.standardRule.findFirst({
    where: { orderType, enabled: true },
    orderBy: { updatedAt: "desc" },
  });
  const normalized: RuleStandard = { ...standard, orderType, name };
  return upsertStandard({
    id: existing?.id, // 有则覆盖更新,无则新建
    orderType,
    name,
    standard: normalized,
    enabled: true,
    source: "template_import",
  });
}

export async function listStandardVersions(standardRuleId: string): Promise<StandardVersionRecord[]> {
  const rows = await prisma.standardVersion.findMany({
    where: { standardRuleId },
    orderBy: { version: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    standardRuleId: row.standardRuleId,
    orderType: row.orderType,
    version: row.version,
    standard: JSON.parse(row.snapshotJson) as RuleStandard,
    source: row.source as StandardVersionRecord["source"],
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function rollbackStandardVersion(versionId: string): Promise<StandardRow> {
  const version = await prisma.standardVersion.findUnique({
    where: { id: versionId },
    include: { standardRule: true },
  });
  if (!version) throw new Error("规范版本不存在");
  const snapshot = JSON.parse(version.snapshotJson) as RuleStandard;
  return upsertStandard({
    id: version.standardRuleId,
    orderType: version.orderType,
    name: snapshot.name || version.standardRule.name,
    standard: snapshot,
    enabled: true,
    source: "rollback",
    note: `回滚自 V${version.version}`,
  });
}

export async function evaluateLatestStandardVersions(
  standardRuleId: string
): Promise<StandardEvaluation> {
  const versions = await prisma.standardVersion.findMany({
    where: { standardRuleId },
    orderBy: { version: "desc" },
    take: 2,
  });
  if (versions.length < 2) throw new Error("至少需要两个规范版本才能评估");
  const [current, previous] = versions;
  const samples = (await listApprovedCases(current.orderType)).slice(0, 8);
  if (samples.length < 2) throw new Error("该类型至少需要两条已通过工单才能评估");
  const clip = (text: string | undefined) => {
    const value = (text || "").trim();
    return value.length > 800 ? value.slice(0, 800) + "…" : value;
  };
  const provider = await getProvider();
  return provider.evaluateStandards({
    orderType: current.orderType,
    previousVersion: previous.version,
    currentVersion: current.version,
    before: JSON.parse(previous.snapshotJson) as RuleStandard,
    after: JSON.parse(current.snapshotJson) as RuleStandard,
    examples: samples.map((sample) => ({
      caseId: sample.id,
      orderNo: sample.orderNo,
      citizenAppeal: clip(sample.citizenAppeal),
      replyContent: clip(sample.replyContent),
      evaluationReport: sample.evaluationReport ? clip(sample.evaluationReport) : undefined,
    })),
  });
}

/** 启用/停用 */
export async function setStandardEnabled(id: string, enabled: boolean): Promise<StandardRow> {
  const updated = await prisma.standardRule.update({
    where: { id },
    data: { enabled },
  });
  return rowToStandard(updated);
}

/** 删除 */
export async function deleteStandard(id: string): Promise<void> {
  await prisma.standardRule.delete({ where: { id } });
}

/** 内置默认规范(前端做兜底展示 / 表单初始化用) */
export function builtinStandards(): RuleStandard[] {
  return DEFAULT_STANDARDS;
}
