-- CreateTable
CREATE TABLE "LearnedRule" (
    "id" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "riskLevel" TEXT,
    "confidence" DOUBLE PRECISION,
    "supportingCaseIds" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "adoptedAt" TIMESTAMP(3),

    CONSTRAINT "LearnedRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnedRule_orderType_idx" ON "LearnedRule"("orderType");

-- CreateIndex
CREATE INDEX "LearnedRule_status_idx" ON "LearnedRule"("status");

