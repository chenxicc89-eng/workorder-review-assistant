import { Router } from "express";
import { z } from "zod";
import {
  adoptRule,
  generateCandidates,
  listLearningSourceTypes,
  listRules,
  rejectRule,
  bulkAdoptRules,
  bulkRejectRules,
  LearningError,
} from "../services/learningService";
import type { LearnedRuleStatus } from "../../lib/types";
import {
  importApprovedCases,
  listImportBatches,
  listApprovedOrderTypes,
  listApprovedCases,
  deleteApprovedCase,
  deleteImportBatch,
  updateApprovedCaseOrderType,
  bulkUpdateApprovedCaseOrderType,
  bulkDeleteApprovedCases,
} from "../services/approvedCaseService";

// /api/learning —— 学习中心(Tier3:反馈 → 常驻规则)
export const learningRouter = Router();

const generateSchema = z.object({ orderType: z.string().min(1) });
const bulkRuleSchema = z.object({ ids: z.array(z.string().trim().min(1)).min(1).max(500) });
const approvedCaseSchema = z.object({
  orderNo: z.string().trim().min(1, "工单编号不能为空").max(200),
  orderType: z.string().trim().min(1, "工单类型不能为空").max(100),
  citizenAppeal: z.string().trim().min(1, "工单内容不能为空").max(30_000),
  replyContent: z.string().trim().min(1, "回单内容不能为空").max(30_000),
  evaluationReport: z.string().trim().max(30_000).optional(),
  unit: z.string().trim().max(300).optional(),
});
const importApprovedSchema = z.object({
  name: z.string().trim().min(1).max(200),
  fileName: z.string().trim().max(300).optional(),
  rows: z.array(approvedCaseSchema).min(1, "至少导入一条已通过工单").max(2_000),
});

learningRouter.get("/source-types", async (_req, res) => {
  try {
    res.json(await listLearningSourceTypes());
  } catch (err) {
    res.status(500).json({ error: "查询学习资料类型失败", message: (err as Error).message });
  }
});

learningRouter.post("/approved-cases/import", async (req, res) => {
  const parsed = importApprovedSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "导入数据校验失败", details: parsed.error.issues });
  }
  try {
    const result = await importApprovedCases(parsed.data);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || "导入失败" });
  }
});

learningRouter.get("/approved-cases/batches", async (_req, res) => {
  try {
    res.json(await listImportBatches());
  } catch (err) {
    res.status(500).json({ error: "查询导入批次失败", message: (err as Error).message });
  }
});

learningRouter.get("/approved-cases/order-types", async (_req, res) => {
  try {
    res.json(await listApprovedOrderTypes());
  } catch (err) {
    res.status(500).json({ error: "查询样本类型失败", message: (err as Error).message });
  }
});

learningRouter.get("/approved-cases", async (req, res) => {
  try {
    const orderType = typeof req.query.orderType === "string" ? req.query.orderType : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    res.json(await listApprovedCases(orderType, batchId));
  } catch (err) {
    res.status(500).json({ error: "查询已通过工单失败", message: (err as Error).message });
  }
});

learningRouter.delete("/approved-cases/batches/:id", async (req, res) => {
  try {
    await deleteImportBatch(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message || "删除批次失败" });
  }
});

learningRouter.delete("/approved-cases/:id", async (req, res) => {
  try {
    await deleteApprovedCase(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: (err as Error).message || "删除工单失败" });
  }
});

learningRouter.patch("/approved-cases/bulk-order-type", async (req, res) => {
  const parsed = z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(500),
    orderType: z.string().trim().min(1).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "请选择工单并填写目标类型" });
  try {
    const updatedCount = await bulkUpdateApprovedCaseOrderType(
      parsed.data.ids,
      parsed.data.orderType
    );
    res.json({ updatedCount });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || "批量修改工单类型失败" });
  }
});

learningRouter.post("/approved-cases/bulk-delete", async (req, res) => {
  const parsed = z.object({
    ids: z.array(z.string().trim().min(1)).min(1).max(500),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "请至少选择一条工单" });
  try {
    const deletedCount = await bulkDeleteApprovedCases(parsed.data.ids);
    res.json({ deletedCount });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message || "批量删除工单失败" });
  }
});

learningRouter.patch("/approved-cases/:id", async (req, res) => {
  const parsed = z.object({ orderType: z.string().trim().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "请填写工单类型" });
  try {
    res.json(await updateApprovedCaseOrderType(req.params.id, parsed.data.orderType));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message || "修改工单类型失败" });
  }
});

// POST /api/learning/candidates —— 生成候选准则(触发离线蒸馏)
learningRouter.post("/candidates", async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "输入校验失败", details: parsed.error.issues });
  }
  try {
    const created = await generateCandidates(parsed.data.orderType);
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof LearningError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("生成候选准则失败:", err);
    res.status(500).json({ error: "生成候选准则失败", message: (err as Error).message });
  }
});

// GET /api/learning/rules?orderType=&status= —— 列出候选 / 已采纳规则
learningRouter.get("/rules", async (req, res) => {
  try {
    const orderType = typeof req.query.orderType === "string" ? req.query.orderType : undefined;
    const status =
      typeof req.query.status === "string" &&
      ["pending", "adopted", "rejected"].includes(req.query.status)
        ? (req.query.status as LearnedRuleStatus)
        : undefined;
    const list = await listRules({ orderType, status });
    res.json(list);
  } catch (err) {
    console.error("查询学习规则失败:", err);
    res.status(500).json({ error: "查询学习规则失败", message: (err as Error).message });
  }
});

learningRouter.post("/rules/bulk-adopt", async (req, res) => {
  const parsed = bulkRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "请至少选择一条候选准则" });
  try {
    res.json(await bulkAdoptRules(parsed.data.ids));
  } catch (err) {
    res.status(500).json({ error: "批量采纳失败", message: (err as Error).message });
  }
});

learningRouter.post("/rules/bulk-reject", async (req, res) => {
  const parsed = bulkRuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "请至少选择一条候选准则" });
  try {
    res.json(await bulkRejectRules(parsed.data.ids));
  } catch (err) {
    res.status(500).json({ error: "批量驳回失败", message: (err as Error).message });
  }
});

// POST /api/learning/rules/:id/adopt —— 采纳(写入生效规范)
learningRouter.post("/rules/:id/adopt", async (req, res) => {
  try {
    const rule = await adoptRule(req.params.id);
    res.json(rule);
  } catch (err) {
    if (err instanceof LearningError) return res.status(400).json({ error: err.message });
    console.error("采纳规则失败:", err);
    res.status(500).json({ error: "采纳规则失败", message: (err as Error).message });
  }
});

// POST /api/learning/rules/:id/reject —— 驳回 / 撤回(从规范剔除)
learningRouter.post("/rules/:id/reject", async (req, res) => {
  try {
    const rule = await rejectRule(req.params.id);
    res.json(rule);
  } catch (err) {
    if (err instanceof LearningError) return res.status(404).json({ error: err.message });
    console.error("驳回规则失败:", err);
    res.status(500).json({ error: "驳回规则失败", message: (err as Error).message });
  }
});
