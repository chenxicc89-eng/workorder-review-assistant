ALTER TABLE "LearnedRule"
ADD COLUMN "conflictStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "conflictDetail" TEXT;

CREATE TABLE "StandardVersion" (
    "id" TEXT NOT NULL,
    "standardRuleId" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StandardVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StandardVersion" (
    "id", "standardRuleId", "orderType", "version", "snapshotJson", "source", "note", "createdAt"
)
SELECT
    'sv_' || md5(random()::text || clock_timestamp()::text || "id"),
    "id", "orderType", 1, "contentJson", 'manual', '迁移生成的基线版本', CURRENT_TIMESTAMP
FROM "StandardRule";

CREATE INDEX "StandardVersion_standardRuleId_idx" ON "StandardVersion"("standardRuleId");
CREATE INDEX "StandardVersion_orderType_idx" ON "StandardVersion"("orderType");
CREATE UNIQUE INDEX "StandardVersion_standardRuleId_version_key" ON "StandardVersion"("standardRuleId", "version");
ALTER TABLE "StandardVersion" ADD CONSTRAINT "StandardVersion_standardRuleId_fkey"
FOREIGN KEY ("standardRuleId") REFERENCES "StandardRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
