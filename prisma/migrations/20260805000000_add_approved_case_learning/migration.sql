ALTER TABLE "LearnedRule"
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'correction',
ADD COLUMN "candidateType" TEXT NOT NULL DEFAULT 'reinforce';

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovedCase" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "citizenAppeal" TEXT NOT NULL,
    "replyContent" TEXT NOT NULL,
    "evaluationReport" TEXT,
    "unit" TEXT,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovedCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearnedRule_sourceType_idx" ON "LearnedRule"("sourceType");
CREATE INDEX "ApprovedCase_orderType_idx" ON "ApprovedCase"("orderType");
CREATE INDEX "ApprovedCase_orderNo_idx" ON "ApprovedCase"("orderNo");
CREATE INDEX "ApprovedCase_batchId_idx" ON "ApprovedCase"("batchId");
CREATE UNIQUE INDEX "ApprovedCase_batchId_orderNo_key" ON "ApprovedCase"("batchId", "orderNo");

ALTER TABLE "ApprovedCase" ADD CONSTRAINT "ApprovedCase_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
