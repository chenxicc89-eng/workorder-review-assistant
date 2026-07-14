import { Router } from "express";
import { z } from "zod";
import {
  adoptRule,
  generateCandidates,
  listRules,
  rejectRule,
  LearningError,
} from "../services/learningService";
import type { LearnedRuleStatus } from "../../lib/types";

// /api/learning —— 学习中心(Tier3:反馈 → 常驻规则)
export const learningRouter = Router();

const generateSchema = z.object({ orderType: z.string().min(1) });

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

// POST /api/learning/rules/:id/adopt —— 采纳(写入生效规范)
learningRouter.post("/rules/:id/adopt", async (req, res) => {
  try {
    const rule = await adoptRule(req.params.id);
    res.json(rule);
  } catch (err) {
    if (err instanceof LearningError) return res.status(404).json({ error: err.message });
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
