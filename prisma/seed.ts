import { PrismaClient } from "@prisma/client";
import { DEFAULT_STANDARDS } from "../src/lib/standards/defaultStandards";

// ==========================================================================
// 种子脚本:把内置默认规范写入 StandardRule 表(幂等 upsert)。
// contentJson 存完整 RuleStandard(含 requiredItems / 各级风险 / 规范要求 / 模板)。
// 使用 defaultStandards 里的稳定 id(std-*)作为主键,重复执行不会产生重复数据。
// ==========================================================================

const prisma = new PrismaClient();

async function main() {
  console.log("开始写入默认规范库…");
  for (const std of DEFAULT_STANDARDS) {
    await prisma.standardRule.upsert({
      where: { id: std.id },
      create: {
        id: std.id,
        orderType: std.orderType,
        name: std.name,
        contentJson: JSON.stringify(std),
        enabled: true,
      },
      update: {
        orderType: std.orderType,
        name: std.name,
        contentJson: JSON.stringify(std),
      },
    });
    console.log(`  ✓ ${std.orderType} —— ${std.name}`);
  }
  const count = await prisma.standardRule.count();
  console.log(`完成。当前规范库共 ${count} 条。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
