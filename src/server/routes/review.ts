import { Router } from "express";
import { z } from "zod";
import { reviewWorkOrder, ReviewInputError } from "../services/reviewService";

// POST /api/review —— 单条工单预审
export const reviewRouter = Router();

const inputSchema = z.object({
  orderNo: z.string().optional(),
  // 工单类型由识别自动填入,可缺省(后端回退「其他」通用规范)
  orderType: z.string().optional().default(""),
  citizenAppeal: z.string().min(1, "市民诉求不能为空"),
  replyContent: z.string().min(1, "回单内容不能为空"),
  evaluationReport: z.string().optional(),
  attachmentNote: z.string().optional(),
  unit: z.string().optional(),
  remark: z.string().optional(),
});

reviewRouter.post("/", async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "输入校验失败",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  try {
    const result = await reviewWorkOrder(parsed.data);
    res.json(result);
  } catch (err) {
    if (err instanceof ReviewInputError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("审核失败:", err);
    res.status(500).json({ error: "审核服务异常", message: (err as Error).message });
  }
});
