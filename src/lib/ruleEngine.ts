import type { ReviewIssue, WorkOrderInput } from "./types";
import {
  containsAny,
  matchedKeywords,
  evidenceFor,
  snippetAround,
  hasTimeInfo,
} from "./utils/textExtract";

// ==========================================================================
// 本地规则引擎
// --------------------------------------------------------------------------
// 确定性检查:先于 AI 运行,命中即产出结构化 ReviewIssue。
// 每条规则严格对应需求文档「五、本地规则引擎要求」的关键词与权重。
// 所有 issue 的 source 均为 "rule"。
// ==========================================================================

/** 生成稳定的规则问题 id(不依赖随机数,便于测试与合并去重) */
function ruleId(n: number): string {
  return `rule-${n}`;
}

// ---- 关键词字典 ----

const CONTACTED_MARK = ["【已联系】", "已联系"];
const NOT_CONTACTED_WORDS = [
  "无法联系",
  "电话保密",
  "未联系到",
  "未接通",
  "号码保密",
  "信息保密",
  "00000000",
];

const CITIZEN_OPINION_BAD = [
  "未知意见",
  "不清楚意见",
  "无法知道意见",
  "无反馈",
  "未反馈意见",
];

const VAGUE_ACTIONS = [
  "已处理",
  "已解决",
  "已恢复",
  "临时检修",
  "现场处理",
  "已协调",
  "已解释",
];

/**
 * 支撑「处理措施具体」的过程性关键词 —— 命中说明确有具体处置过程。
 * 注意:不含「恢复供电」「原因」等结论性/宽泛词,避免仅凭结论就掩盖笼统表述。
 */
const CONCRETE_PROCESS = [
  "现场核实",
  "现场检查",
  "巡视",
  "排查",
  "更换",
  "修复",
  "接火",
  "消缺",
  "带电作业",
  "抢修人员",
  "抢修班",
  "工作票",
  "试送",
  "验电",
];

/** 明确属于笼统/敷衍的动作表述(出现即可疑,需具体过程支撑) */
const VAGUE_ONLY_ACTIONS = ["临时检修", "现场处理", "已处理", "已协调", "已解释"];

const FREQUENT_APPEAL = [
  "频繁停电",
  "经常停电",
  "一年内多次停电",
  "常年停电",
  "反复停电",
  "总停电",
  "多次停电",
];

/** 回单中若出现这些词,说明已回应频繁停电诉求 */
const FREQUENT_RESPONSE = [
  "停电记录",
  "近期",
  "一年内",
  "频繁原因",
  "频繁停电原因",
  "治理措施",
  "隐患排查",
  "后续整改",
  "减少类似问题",
  "历史停电",
];

/** 恢复供电时间相关关键词 */
const RECOVERY_TIME = [
  "恢复供电时间",
  "恢复时间",
  "恢复供电",
  "送电",
  "复电",
];

/** 口语化 / 内部化表述 */
const COLLOQUIAL_WORDS = [
  "师傅",
  "某师",
  "隋师",
  "跟用户说",
  "打电话说了",
  "咱们",
  "那边",
];

const RESOLVED_MARK = ["【已解决】", "已解决"];

// 需要针对突发/频繁停电类才检查时间节点完整性的工单类型
const OUTAGE_TYPES = ["突发故障停电", "频繁停电"];

// ==========================================================================

export function checkRules(input: WorkOrderInput): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const appeal = input.citizenAppeal ?? "";
  const reply = input.replyContent ?? "";
  const report = input.evaluationReport?.trim() ?? "";
  const orderType = input.orderType ?? "";

  // ---- 规则 1:联系情况前后矛盾(高)----
  {
    const marked = containsAny(reply, CONTACTED_MARK);
    const cannotHits = matchedKeywords(reply, NOT_CONTACTED_WORDS);
    if (marked && cannotHits.length > 0) {
      issues.push({
        id: ruleId(1),
        weight: "高",
        category: "联系情况前后矛盾",
        evidence: evidenceFor(reply, [...CONTACTED_MARK.slice(0, 1), ...cannotHits], 3),
        analysis: "回单标注已联系,但正文又表述无法联系,前后不一致。",
        requirement:
          "请按实际情况修改为「【未联系】」,并补充具体联系时间、未联系原因及报备情况。",
        source: "rule",
      });
    }
  }

  // ---- 规则 2:市民意见表述不规范(中/高)----
  {
    const hits = matchedKeywords(reply, CITIZEN_OPINION_BAD);
    if (hits.length > 0) {
      // 若同时联系情况矛盾/无法联系,意见表述不规范升为高风险
      const escalate = containsAny(reply, NOT_CONTACTED_WORDS);
      issues.push({
        id: ruleId(2),
        weight: escalate ? "高" : "中",
        category: "市民意见表述不规范",
        evidence: evidenceFor(reply, hits, 2),
        analysis: `市民意见表述为「${hits.join("、")}」,不符合规范要求。`,
        requirement:
          "请根据实际联系情况规范表述市民意见。若因号码保密或未联系到市民,应写明未能征询市民意见,并按规范使用「【非公开信息】」等统一口径。",
        source: "rule",
      });
    }
  }

  // ---- 规则 3:处理措施过于笼统(中)----
  {
    const vagueHits = matchedKeywords(reply, VAGUE_ACTIONS);
    // 是否给出了具体的处置过程(而非仅结论)
    const hasConcreteProcess = containsAny(reply, CONCRETE_PROCESS);
    // 是否出现明确笼统表述(临时检修/现场处理/已处理…)
    const hasVagueOnly = containsAny(reply, VAGUE_ONLY_ACTIONS);
    // 命中条件:
    //   a) 出现明确笼统动作,且缺少具体处置过程;或
    //   b) 出现「已处理/已解决/已恢复」等结论,但既无具体过程、也无时间线
    const hitA = hasVagueOnly && !hasConcreteProcess;
    const hitB = vagueHits.length > 0 && !hasConcreteProcess && !hasTimeInfo(reply);
    if (hitA || hitB) {
      issues.push({
        id: ruleId(3),
        weight: "中",
        category: "处理措施过于笼统",
        evidence: evidenceFor(reply, vagueHits.length ? vagueHits : VAGUE_ONLY_ACTIONS, 2),
        analysis:
          "回单以「临时检修」「已处理」等笼统表述带过,缺少具体处置过程、处理结果的说明。",
        requirement:
          "请补充现场核实情况、具体处理过程、处理结果及关键时间节点,避免仅使用「已处理」「临时检修」等笼统表述。",
        source: "rule",
      });
    }
  }

  // ---- 规则 4:频繁停电诉求未回应(高)----
  {
    const appealFrequent = containsAny(appeal, FREQUENT_APPEAL);
    const replyResponded = containsAny(reply, FREQUENT_RESPONSE);
    if (appealFrequent && !replyResponded) {
      issues.push({
        id: ruleId(4),
        weight: "高",
        category: "频繁停电诉求未回应",
        evidence: evidenceFor(appeal, FREQUENT_APPEAL, 1),
        analysis:
          "市民反映频繁停电,但回单仅说明本次停电原因或已恢复供电,未回应频繁停电这一核心诉求。",
        requirement:
          "请补充核查该小区或该区域近期/一年内停电记录,说明是否存在频繁停电、频繁停电原因及后续治理措施。",
        source: "rule",
      });
    }
  }

  // ---- 规则 5:时间节点不完整(中)----
  // 对突发/频繁停电类:必须明确「恢复供电时间」。仅出现「恢复供电」而无对应时间,
  // 视为时间线不完整(需求示例即为此情形:只说恢复供电,未给恢复时间)。
  {
    if (OUTAGE_TYPES.includes(orderType)) {
      const recoveryHit = matchedKeywords(reply, RECOVERY_TIME)[0];
      // 是否在恢复表述附近给出了时间
      const recoveryHasTime = recoveryHit
        ? hasTimeInfo(snippetAround(reply, recoveryHit, 20))
        : false;
      // 明确的「恢复供电时间/恢复时间/于XX时XX分恢复」这类含时间字样也算完整
      const hasExplicitRecoveryTime =
        containsAny(reply, ["恢复供电时间", "恢复时间"]) ||
        /恢复(供电)?[^,。;]{0,6}\d{1,2}[时点:]/.test(reply);

      if (!recoveryHit || (!recoveryHasTime && !hasExplicitRecoveryTime)) {
        issues.push({
          id: ruleId(5),
          weight: "中",
          category: "时间节点不完整",
          evidence: recoveryHit
            ? snippetAround(reply, recoveryHit)
            : "(回单未出现「恢复供电时间/送电/复电」等关键信息)",
          analysis: recoveryHit
            ? "回单提及已恢复供电,但未写明具体恢复供电时间,时间线不完整。"
            : "该类工单未明确恢复供电时间,时间线不完整。",
          requirement:
            "请补充停电发生时间、接报时间、现场核实时间、抢修时间及恢复供电时间,确保时间线完整。",
          source: "rule",
        });
      }
    }
  }

  // ---- 规则 6:口语化表述(低)----
  {
    const hits = matchedKeywords(reply, COLLOQUIAL_WORDS);
    if (hits.length > 0) {
      issues.push({
        id: ruleId(6),
        weight: "低",
        category: "口语化表述",
        evidence: evidenceFor(reply, hits, 2),
        analysis: `回单出现口语化/内部化称呼「${hits.join("、")}」,表述不够正式。`,
        requirement:
          "请使用正式回单表述,例如「工作人员XXX」「已向市民解释说明」等,避免使用内部口语化称呼。",
        source: "rule",
      });
    }
  }

  // ---- 规则 7:「已解决」支撑不足(中/高)----
  {
    const resolved = containsAny(reply, RESOLVED_MARK);
    if (resolved) {
      // 支撑依据:原因 + 措施 + 结果 + 反馈。命中越少越可疑。
      const supportKeys = ["原因", "措施", "抢修", "结果", "反馈", "现场核实"];
      const supportHits = matchedKeywords(reply, supportKeys);
      const hasFeedback = containsAny(reply, ["反馈", "市民表示", "市民认可", "市民满意"]);
      // 支撑点少于 2 个,或明确无联系反馈 → 命中
      if (supportHits.length < 2 || !hasFeedback) {
        // 若同时无法联系市民,已解决更缺乏支撑 → 高风险
        const escalate = containsAny(reply, NOT_CONTACTED_WORDS) || supportHits.length === 0;
        issues.push({
          id: ruleId(7),
          weight: escalate ? "高" : "中",
          category: "「已解决」支撑不足",
          evidence: snippetAround(reply, containsAny(reply, ["【已解决】"]) ? "【已解决】" : "已解决"),
          analysis:
            "回单标注「已解决」,但缺少具体原因、措施、处理结果或市民反馈等事实支撑。",
          requirement:
            "请补充支撑「已解决」结论的事实依据,包括具体处置措施、处理结果、市民反馈情况等。",
          source: "rule",
        });
      }
    }
  }

  // ---- 规则 8~10:不计入考核评价报告的基础完整性 ----
  // 仅在用户确实提供报告时检查；没有报告并不代表工单本身不合格。
  if (report) {
    if (!containsAny(report, ["不计入评价", "不计入考核", "申请不计入", "不予评价"])) {
      issues.push({
        id: ruleId(8),
        weight: "中",
        category: "评价报告申请结论不明确",
        evidence: report.slice(0, 120),
        analysis: "评价报告未明确写出申请不计入考核评价的结论。",
        requirement: "请在报告中明确本案件是否申请不计入考核评价，并写明对应申请事项。",
        source: "rule",
        target: "evaluation_report",
      });
    }

    if (!containsAny(report, ["依据", "规定", "规则", "清单", "法律", "标准", "条例", "第" ])) {
      issues.push({
        id: ruleId(9),
        weight: "中",
        category: "评价报告依据不具体",
        evidence: report.slice(0, 120),
        analysis: "评价报告提出不计入评价申请，但未明确对应的政策、规则、事项清单或具体条款依据。",
        requirement: "请补充不计入评价所依据的事项清单、政策法规或规则条款，并说明其与本案事实的对应关系。",
        source: "rule",
        target: "evaluation_report",
      });
    }

    if (!containsAny(report, ["附件", "照片", "录音", "截图", "证明", "佐证", "处置记录"])) {
      issues.push({
        id: ruleId(10),
        weight: "中",
        category: "评价报告佐证材料不清",
        evidence: report.slice(-120),
        analysis: "评价报告未列明能够支撑调查事实和申请理由的附件或佐证材料。",
        requirement: "请列明现场照片、联系记录、处置记录或其他佐证材料，并说明其支撑的关键事实。",
        source: "rule",
        target: "evaluation_report",
      });
    }
  }

  return issues;
}

/** 便捷别名,与需求文档描述保持一致 */
export const ruleEngine = {
  check: checkRules,
};
