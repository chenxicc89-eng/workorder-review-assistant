import { Router } from "express";
import { z } from "zod";
import {
  deleteStandard,
  listStandards,
  setStandardEnabled,
  upsertStandard,
} from "../services/standardService";

// /api/standards —— 规范库
export const standardsRouter = Router();

const ruleStandardSchema = z.object({
  id: z.string().optional(),
  orderType: z.string(),
  name: z.string(),
  requiredItems: z.array(z.string()).default([]),
  highRiskIssues: z.array(z.string()).default([]),
  mediumRiskIssues: z.array(z.string()).default([]),
  lowRiskIssues: z.array(z.string()).default([]),
  standardRequirements: z.array(z.string()).default([]),
  standardOpinionTemplates: z.array(z.string()).default([]),
  examples: z
    .object({ good: z.array(z.string()).optional(), bad: z.array(z.string()).optional() })
    .optional(),
  // Tier3:从反馈提炼采纳的准则。放行,否则经规范编辑器保存时会被 zod strip 丢失。
  learnedRules: z.array(z.string()).optional(),
  learnedExemptions: z.array(z.string()).optional(),
});

const upsertSchema = z.object({
  id: z.string().optional(),
  orderType: z.string().min(1),
  name: z.string().min(1),
  standard: ruleStandardSchema,
  enabled: z.boolean().optional(),
});

const toggleSchema = z.object({ enabled: z.boolean() });

// GET /api/standards —— 列表(可 ?orderType= 过滤)
standardsRouter.get("/", async (req, res) => {
  try {
    const orderType = typeof req.query.orderType === "string" ? req.query.orderType : undefined;
    const list = await listStandards(orderType);
    res.json(list);
  } catch (err) {
    console.error("查询规范失败:", err);
    res.status(500).json({ error: "查询规范失败", message: (err as Error).message });
  }
});

// POST /api/standards —— 新增或更新
standardsRouter.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "输入校验失败", details: parsed.error.issues });
  }
  try {
    const row = await upsertStandard({
      id: parsed.data.id,
      orderType: parsed.data.orderType,
      name: parsed.data.name,
      standard: { ...parsed.data.standard, orderType: parsed.data.orderType, name: parsed.data.name } as any,
      enabled: parsed.data.enabled,
    });
    res.status(parsed.data.id ? 200 : 201).json(row);
  } catch (err) {
    console.error("保存规范失败:", err);
    res.status(500).json({ error: "保存规范失败", message: (err as Error).message });
  }
});

// PATCH /api/standards/:id —— 启用/停用
standardsRouter.patch("/:id", async (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "输入校验失败", details: parsed.error.issues });
  }
  try {
    const row = await setStandardEnabled(req.params.id, parsed.data.enabled);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "更新规范失败", message: (err as Error).message });
  }
});

// DELETE /api/standards/:id
standardsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteStandard(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: "删除规范失败", message: (err as Error).message });
  }
});
