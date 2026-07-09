import type { RuleStandard } from "../types";

// ==========================================================================
// 内置默认规范库(需求文档第八节)
// --------------------------------------------------------------------------
// 作为 seed.ts 写入 SQLite 的种子来源,同时在数据库查不到规范时作为兜底。
// id 使用稳定字符串,便于幂等 seed(upsert)。
// 预置 10 种工单类型;"突发故障停电""频繁停电"采用需求文档给定的完整规范,
// 其余给出合理精简默认,后续可在 /standards 页面维护。
// ==========================================================================

/** 所有支持的工单类型(下拉选项来源) */
export const ORDER_TYPES = [
  "突发故障停电",
  "频繁停电",
  "电压质量",
  "电费电量",
  "业扩报装",
  "充电桩",
  "服务态度",
  "抄表收费",
  "停电通知",
  "其他",
] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

/** 通用低风险问题 —— 各类型共用 */
const COMMON_LOW_RISK = ["语言表述不正式", "格式不统一", "语句不够通顺", "使用口语化称呼"];

export const DEFAULT_STANDARDS: RuleStandard[] = [
  {
    id: "std-outage-sudden",
    orderType: "突发故障停电",
    name: "突发故障停电回单规范",
    requiredItems: [
      "是否联系市民",
      "具体联系时间",
      "未联系原因,如电话保密、未接通等",
      "主责单位",
      "停电发生时间",
      "停电原因",
      "现场核实情况",
      "抢修处置措施",
      "恢复供电时间",
      "市民反馈意见",
      "如未联系到市民,应说明原因及报备情况",
    ],
    highRiskIssues: [
      "已联系与无法联系表述矛盾",
      "未说明停电原因",
      "未说明恢复供电时间",
      "未回应市民核心诉求",
      "只说明本次停电,未回应频繁停电诉求",
      "已解决结论缺少事实支撑",
    ],
    mediumRiskIssues: [
      "处理措施表述笼统",
      "办理时间与停电时间混同",
      "现场核实情况不清",
      "市民意见表述不规范",
      "佐证材料说明不足",
    ],
    lowRiskIssues: ["使用口语化称呼", "格式不统一", "语句不够正式"],
    standardRequirements: [
      "应写明停电发生、接报、抢修、恢复供电等关键时间节点",
      "应写明停电具体原因,不宜只写已恢复",
      "应写明抢修处置过程和处理结果",
      "应根据实际联系情况规范使用已联系或未联系",
      "如市民反映频繁停电,应补充历史停电记录核查和后续治理措施",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善停电原因、抢修处置过程、关键时间节点及市民联系反馈情况后重新反馈。",
    ],
    examples: {
      bad: [
        "【已联系】…但市民电话保密无法联系;因树砸线导致停电,临时检修恢复。市民【未知意见】。",
      ],
    },
  },
  {
    id: "std-outage-frequent",
    orderType: "频繁停电",
    name: "频繁停电回单规范",
    requiredItems: [
      "是否联系市民",
      "具体联系时间",
      "主责单位",
      "市民反映的频繁停电范围",
      "近期或一年内停电记录核查情况",
      "频繁停电原因",
      "已采取措施",
      "后续治理措施",
      "市民反馈意见",
    ],
    highRiskIssues: [
      "未核查历史停电记录",
      "只解释单次停电原因",
      "未回应频繁停电核心诉求",
      "未提出后续治理措施",
      "已解决结论缺少事实支撑",
    ],
    mediumRiskIssues: [
      "停电记录核查范围不清",
      "原因说明笼统",
      "治理措施不具体",
      "市民反馈情况不规范",
    ],
    lowRiskIssues: ["语言表述不正式", "格式不统一"],
    standardRequirements: [
      "应围绕频繁停电核心诉求进行核查",
      "应说明近期或一年内停电记录",
      "应说明频繁停电原因",
      "应提出后续治理或隐患排查措施",
      "不能只说明本次停电已恢复",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善停电记录核查、频繁停电原因及后续治理措施后重新反馈。",
    ],
  },
  {
    id: "std-voltage",
    orderType: "电压质量",
    name: "电压质量回单规范",
    requiredItems: [
      "是否联系市民",
      "主责单位",
      "现场电压检测情况",
      "电压异常原因",
      "处理措施",
      "处理结果",
      "市民反馈意见",
    ],
    highRiskIssues: ["未开展现场电压检测", "未回应电压质量核心诉求", "已解决结论缺少事实支撑"],
    mediumRiskIssues: ["检测数据缺失", "原因说明笼统", "处理结果不清"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明现场电压检测数据及是否符合标准",
      "应说明电压异常原因及处理措施",
      "应说明处理后电压是否恢复正常",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善现场电压检测数据、原因及处理结果后重新反馈。",
    ],
  },
  {
    id: "std-fee",
    orderType: "电费电量",
    name: "电费电量回单规范",
    requiredItems: [
      "是否联系市民",
      "争议电费电量所属周期",
      "核查过程",
      "核查结论",
      "退补或解释情况",
      "市民反馈意见",
    ],
    highRiskIssues: ["未核查争议电量", "未回应电费争议核心诉求", "结论缺少核查依据"],
    mediumRiskIssues: ["核查周期不清", "计算过程未说明", "退补情况不明"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明争议电费电量的核查过程与结论",
      "应说明是否存在计费差错及处理方式",
      "应向市民解释清楚计费依据",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善电量核查过程、结论及向市民的解释情况后重新反馈。",
    ],
  },
  {
    id: "std-newconn",
    orderType: "业扩报装",
    name: "业扩报装回单规范",
    requiredItems: [
      "是否联系市民",
      "报装受理情况",
      "当前办理进度",
      "受阻原因(如有)",
      "预计完成时间",
      "市民反馈意见",
    ],
    highRiskIssues: ["未回应报装进度诉求", "长期停滞未说明原因", "承诺时间缺失"],
    mediumRiskIssues: ["进度描述笼统", "受阻原因不清"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明当前报装办理进度",
      "如办理受阻应说明原因及解决方案",
      "应给出预计完成或下一步时间节点",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善报装进度、受阻原因及预计完成时间后重新反馈。",
    ],
  },
  {
    id: "std-charger",
    orderType: "充电桩",
    name: "充电桩回单规范",
    requiredItems: [
      "是否联系市民",
      "充电桩相关诉求核实情况",
      "供电或报装办理情况",
      "处理措施",
      "处理结果",
      "市民反馈意见",
    ],
    highRiskIssues: ["未回应充电桩核心诉求", "办理受阻未说明", "结论缺少支撑"],
    mediumRiskIssues: ["核实情况不清", "处理结果不明"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明充电桩报装或供电相关办理情况",
      "应说明处理措施与结果",
      "如涉及跨部门应说明协调情况",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善充电桩办理情况及处理结果后重新反馈。",
    ],
  },
  {
    id: "std-service",
    orderType: "服务态度",
    name: "服务态度回单规范",
    requiredItems: [
      "是否联系市民",
      "投诉事项核实情况",
      "责任认定",
      "处理及整改措施",
      "对市民的回应或致歉情况",
      "市民反馈意见",
    ],
    highRiskIssues: ["未核实投诉事项", "回避责任认定", "未回应市民核心诉求"],
    mediumRiskIssues: ["核实过程不清", "整改措施笼统", "市民反馈不规范"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明投诉事项核实过程与结论",
      "应说明责任认定与整改措施",
      "应说明对市民的回应或致歉情况",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善投诉核实、责任认定及整改措施后重新反馈。",
    ],
  },
  {
    id: "std-meter",
    orderType: "抄表收费",
    name: "抄表收费回单规范",
    requiredItems: [
      "是否联系市民",
      "抄表或收费核查情况",
      "差错核实结论",
      "更正或退补处理",
      "市民反馈意见",
    ],
    highRiskIssues: ["未核查抄表收费差错", "结论缺少核查依据", "未回应核心诉求"],
    mediumRiskIssues: ["核查过程不清", "更正处理不明"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明抄表或收费的核查过程与结论",
      "如存在差错应说明更正或退补处理",
      "应向市民解释清楚",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善抄表收费核查过程及处理结果后重新反馈。",
    ],
  },
  {
    id: "std-notice",
    orderType: "停电通知",
    name: "停电通知回单规范",
    requiredItems: [
      "是否联系市民",
      "停电计划核实情况",
      "通知发布渠道与时间",
      "未收到通知原因(如有)",
      "改进措施",
      "市民反馈意见",
    ],
    highRiskIssues: ["未核实通知发布情况", "未回应未收到通知诉求", "无改进措施"],
    mediumRiskIssues: ["通知渠道不清", "时间节点缺失"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应说明停电计划及通知发布的渠道与时间",
      "如市民未收到通知应说明原因",
      "应说明后续通知改进措施",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善通知发布情况及改进措施后重新反馈。",
    ],
  },
  {
    id: "std-other",
    orderType: "其他",
    name: "通用回单规范",
    requiredItems: [
      "是否联系市民",
      "诉求核实情况",
      "处理措施",
      "处理结果",
      "关键时间节点",
      "市民反馈意见",
    ],
    highRiskIssues: ["未回应市民核心诉求", "回单前后矛盾", "结论缺少事实支撑"],
    mediumRiskIssues: ["处理措施笼统", "时间节点不完整", "现场核实情况不清", "市民意见表述不规范"],
    lowRiskIssues: COMMON_LOW_RISK,
    standardRequirements: [
      "应完整回应市民诉求",
      "应说明核实过程、处理措施与结果",
      "应写清关键时间节点",
      "应规范表述市民反馈意见",
    ],
    standardOpinionTemplates: [
      "经审核,该回单存在以下问题:{issues}。请承办单位补充完善核实过程、处理措施及关键时间节点后重新反馈。",
    ],
  },
];

/** 按工单类型取默认规范;找不到时回退到"其他" */
export function getDefaultStandard(orderType: string): RuleStandard {
  return (
    DEFAULT_STANDARDS.find((s) => s.orderType === orderType) ??
    DEFAULT_STANDARDS.find((s) => s.orderType === "其他")!
  );
}
