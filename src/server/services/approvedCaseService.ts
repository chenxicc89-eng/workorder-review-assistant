import { prisma } from "../db";
import type { ApprovedCaseInput, ApprovedCaseRecord, ImportBatchRecord } from "../../lib/types";
import type { Prisma } from "@prisma/client";

type BatchRow = {
  id: string;
  name: string;
  fileName: string | null;
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  createdAt: Date;
};

export async function importApprovedCases(input: {
  name: string;
  fileName?: string;
  rows: ApprovedCaseInput[];
}): Promise<{ batch: ImportBatchRecord; cases: ApprovedCaseRecord[] }> {
  const orderNos = input.rows.map((r) => r.orderNo.trim());
  const duplicateCount = orderNos.length - new Set(orderNos).size;
  if (duplicateCount > 0) throw new Error(`导入数据中有 ${duplicateCount} 个重复工单编号`);

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        name: input.name.trim(),
        fileName: input.fileName?.trim() || null,
        totalRows: input.rows.length,
        importedRows: input.rows.length,
      },
    });
    const cases = [];
    for (const row of input.rows) {
      cases.push(await tx.approvedCase.create({
        data: {
          batchId: batch.id,
          orderNo: row.orderNo.trim(),
          orderType: row.orderType.trim(),
          citizenAppeal: row.citizenAppeal.trim(),
          replyContent: row.replyContent.trim(),
          evaluationReport: row.evaluationReport?.trim() || null,
          unit: row.unit?.trim() || null,
          sourceFile: input.fileName?.trim() || null,
        },
      }));
    }
    return { batch, cases };
  });

  return {
    batch: batchToRecord(result.batch as BatchRow),
    cases: result.cases.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      orderNo: row.orderNo,
      orderType: row.orderType,
      citizenAppeal: row.citizenAppeal,
      replyContent: row.replyContent,
      evaluationReport: row.evaluationReport ?? undefined,
      unit: row.unit ?? undefined,
      sourceFile: row.sourceFile,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

function batchToRecord(row: BatchRow): ImportBatchRecord {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listImportBatches(): Promise<ImportBatchRecord[]> {
  const rows = await prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (rows as BatchRow[]).map(batchToRecord);
}

export async function listApprovedCases(
  orderType?: string,
  batchId?: string
): Promise<ApprovedCaseRecord[]> {
  const rows = await prisma.approvedCase.findMany({
    where: {
      ...(orderType ? { orderType } : {}),
      ...(batchId ? { batchId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    batchId: row.batchId,
    orderNo: row.orderNo,
    orderType: row.orderType,
    citizenAppeal: row.citizenAppeal,
    replyContent: row.replyContent,
    evaluationReport: row.evaluationReport ?? undefined,
    unit: row.unit ?? undefined,
    sourceFile: row.sourceFile,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** 删除样本前同步清理候选中的来源引用；失去全部支撑的 pending 候选一并删除。 */
async function detachCaseEvidence(
  tx: Prisma.TransactionClient,
  caseIds: string[]
): Promise<void> {
  if (!caseIds.length) return;
  const idSet = new Set(caseIds);
  const rules = await tx.learnedRule.findMany({
    where: { sourceType: "approved_case" },
  });
  for (const rule of rules) {
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(rule.supportingCaseIds);
      ids = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      ids = [];
    }
    const next = ids.filter((id) => !idSet.has(id));
    if (next.length === ids.length) continue;
    if (next.length === 0 && rule.status === "pending") {
      await tx.learnedRule.delete({ where: { id: rule.id } });
    } else {
      await tx.learnedRule.update({
        where: { id: rule.id },
        data: { supportingCaseIds: JSON.stringify(next) },
      });
    }
  }
}

export async function deleteApprovedCase(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.approvedCase.findUnique({ where: { id } });
    if (!row) throw new Error("已通过工单不存在");
    await detachCaseEvidence(tx, [id]);
    await tx.approvedCase.delete({ where: { id } });
    const remaining = await tx.approvedCase.count({ where: { batchId: row.batchId } });
    if (remaining === 0) {
      await tx.importBatch.delete({ where: { id: row.batchId } });
    } else {
      await tx.importBatch.update({
        where: { id: row.batchId },
        data: { importedRows: remaining },
      });
    }
  });
}

export async function updateApprovedCaseOrderType(
  id: string,
  orderType: string
): Promise<ApprovedCaseRecord> {
  const value = orderType.trim();
  if (!value) throw new Error("工单类型不能为空");
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.approvedCase.findUnique({ where: { id } });
    if (!row) throw new Error("已通过工单不存在");
    if (row.orderType !== value) {
      // 待审候选若仍引用旧分类样本，应清除引用并重新生成。
      await detachCaseEvidence(tx, [id]);
    }
    return tx.approvedCase.update({ where: { id }, data: { orderType: value } });
  });
  return {
    id: updated.id,
    batchId: updated.batchId,
    orderNo: updated.orderNo,
    orderType: updated.orderType,
    citizenAppeal: updated.citizenAppeal,
    replyContent: updated.replyContent,
    evaluationReport: updated.evaluationReport ?? undefined,
    unit: updated.unit ?? undefined,
    sourceFile: updated.sourceFile,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function bulkUpdateApprovedCaseOrderType(
  ids: string[],
  orderType: string
): Promise<number> {
  const value = orderType.trim();
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (!value) throw new Error("工单类型不能为空");
  if (!uniqueIds.length) throw new Error("请至少选择一条工单");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.approvedCase.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, orderType: true },
    });
    if (rows.length !== uniqueIds.length) throw new Error("部分已通过工单不存在，请刷新后重试");
    const changedIds = rows.filter((row) => row.orderType !== value).map((row) => row.id);
    if (changedIds.length) await detachCaseEvidence(tx, changedIds);
    const result = await tx.approvedCase.updateMany({
      where: { id: { in: uniqueIds } },
      data: { orderType: value },
    });
    return result.count;
  });
}

export async function deleteImportBatch(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.approvedCase.findMany({ where: { batchId: id }, select: { id: true } });
    const batch = await tx.importBatch.findUnique({ where: { id } });
    if (!batch) throw new Error("导入批次不存在");
    await detachCaseEvidence(tx, rows.map((row) => row.id));
    await tx.importBatch.delete({ where: { id } });
  });
}

export async function listApprovedOrderTypes(): Promise<string[]> {
  const rows = await prisma.approvedCase.findMany({
    distinct: ["orderType"],
    select: { orderType: true },
    orderBy: { orderType: "asc" },
  });
  return rows.map((row) => row.orderType);
}
