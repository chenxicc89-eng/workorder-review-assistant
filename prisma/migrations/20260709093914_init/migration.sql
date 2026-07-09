-- CreateTable
CREATE TABLE "WorkOrderCase" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT,
    "orderType" TEXT NOT NULL,
    "citizenAppeal" TEXT NOT NULL,
    "replyContent" TEXT NOT NULL,
    "attachmentNote" TEXT,
    "unit" TEXT,
    "remark" TEXT,
    "conclusion" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "issuesJson" TEXT NOT NULL,
    "reviewOpinion" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "finalOpinion" TEXT,
    "humanEdited" BOOLEAN NOT NULL DEFAULT false,
    "isFalsePositive" BOOLEAN NOT NULL DEFAULT false,
    "falsePositiveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardRule" (
    "id" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderCase_orderType_idx" ON "WorkOrderCase"("orderType");

-- CreateIndex
CREATE INDEX "WorkOrderCase_riskLevel_idx" ON "WorkOrderCase"("riskLevel");

-- CreateIndex
CREATE INDEX "WorkOrderCase_createdAt_idx" ON "WorkOrderCase"("createdAt");

-- CreateIndex
CREATE INDEX "StandardRule_orderType_idx" ON "StandardRule"("orderType");
