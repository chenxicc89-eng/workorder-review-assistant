import { Router } from "express";
import { z } from "zod";
import { getCase, listCases, patchCase, saveCase } from "../services/caseService";
import type { CaseQuery } from "../../lib/types";

// /api/cases —— 历史案例
export const casesRouter = Router();

const riskEnum = z.enum(["高", "中", "低"]);

const saveSchema = z.object({
  input: z.object({
    orderNo: z.string().optional(),
    // 工单类型由识别自动填入,可缺省(保存时前端已回退「其他」)
    orderType: z.string().optional().default("其他"),
    citizenAppeal: z.string().min(1),
    replyContent: z.string().min(1),
    attachmentNote: z.string().optional(),
    unit: z.string().optional(),
    remark: z.string().optional(),
  }),
  result: z.object({
    conclusion: z.enum(["通过", "建议修改", "建议退回"]),
    riskLevel: riskEnum,
    summary: z.array(z.string()),
    issues: z.array(z.any()),
    reviewOpinion: z.string(),
    ruleFindings: z.array(z.any()).optional(),
    aiFindings: z.array(z.any()).optional(),
    confidence: z.number().optional(),
    aiMode: z.enum(["real", "mock"]).optional(),
  }),
  finalOpinion: z.string().optional(),
  humanEdited: z.boolean().optional(),
});

const patchSchema = z.object({
  finalOpinion: z.string().optional(),
  isFalsePositive: z.boolean().optional(),
  falsePositiveNote: z.string().optional(),
  humanEdited: z.boolean().optional(),
});

// POST /api/cases —— 保存案例
casesRouter.post("/", async (req, res) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "输入校验失败", details: parsed.error.issues });
  }
  try {
    const record = await saveCase(parsed.data as any);
    res.status(201).json(record);
  } catch (err) {
    console.error("保存案例失败:", err);
    res.status(500).json({ error: "保存案例失败", message: (err as Error).message });
  }
});

// GET /api/cases —— 列表 + 过滤
casesRouter.get("/", async (req, res) => {
  try {
    const q = req.query;
    const query: CaseQuery = {
      orderType: typeof q.orderType === "string" ? q.orderType : undefined,
      riskLevel: (typeof q.riskLevel === "string" ? q.riskLevel : undefined) as CaseQuery["riskLevel"],
      keyword: typeof q.keyword === "string" ? q.keyword : undefined,
      from: typeof q.from === "string" ? q.from : undefined,
      to: typeof q.to === "string" ? q.to : undefined,
      isFalsePositive:
        q.isFalsePositive === "true" ? true : q.isFalsePositive === "false" ? false : undefined,
    };
    const list = await listCases(query);
    res.json(list);
  } catch (err) {
    console.error("查询案例失败:", err);
    res.status(500).json({ error: "查询案例失败", message: (err as Error).message });
  }
});

// GET /api/cases/:id —— 详情
casesRouter.get("/:id", async (req, res) => {
  try {
    const record = await getCase(req.params.id);
    if (!record) return res.status(404).json({ error: "案例不存在" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: "查询案例失败", message: (err as Error).message });
  }
});

// PATCH /api/cases/:id —— 修改
casesRouter.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "输入校验失败", details: parsed.error.issues });
  }
  try {
    const record = await patchCase(req.params.id, parsed.data);
    res.json(record);
  } catch (err) {
    console.error("修改案例失败:", err);
    res.status(500).json({ error: "修改案例失败", message: (err as Error).message });
  }
});
