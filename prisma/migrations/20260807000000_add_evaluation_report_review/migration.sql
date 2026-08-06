-- 历史审核案例保存独立的不计入考核评价报告，供详情回看与后续纠错学习。
ALTER TABLE "WorkOrderCase" ADD COLUMN "evaluationReport" TEXT;
