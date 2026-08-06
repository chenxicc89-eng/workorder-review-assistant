import type {
  AiProvider,
  AiReviewContext,
  RawIssue,
  RawReviewOutput,
  DistillContext,
  DistilledCandidate,
  StandardExtractResult,
  ApprovedDistillContext,
  StandardEvaluationContext,
} from "./providers";
import type {
  RiskLevel,
  OcrExtractResult,
  RuleStandard,
  ApprovedDistilledCandidate,
  StandardEvaluation,
} from "../types";
import { containsAny, matchedKeywords } from "../utils/textExtract";
import { ORDER_TYPES, getDefaultStandard } from "../standards/defaultStandards";

// ==========================================================================
// Mock provider(无 API Key / AI_ENABLED=false 时使用)
// --------------------------------------------------------------------------
// 目标:在没有真实大模型时,依然走完整三段式流程,并给出确定性、可复现的
// 语义审核结果。它以本地规则命中为基础,补充规则难以覆盖的语义问题
// (如"未回应核心诉求""办理时间与停电时间混同"),使示例数据能识别出全部预期问题。
// verify 阶段做轻量校正(去重、权重合理化)。
// ==========================================================================

const RISK_RANK: Record<RiskLevel, number> = { 高: 3, 中: 2, 低: 1 };

function highest(issues: RawIssue[]): RiskLevel {
  let top: RiskLevel = "低";
  for (const it of issues) if (RISK_RANK[it.weight] > RISK_RANK[top]) top = it.weight;
  return top;
}

const FREQUENT_APPEAL = [
  "频繁停电",
  "经常停电",
  "一年内多次停电",
  "常年停电",
  "反复停电",
  "总停电",
  "多次停电",
];
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

/** 由规则命中派生语义补充问题(确定性) */
function deriveSemanticIssues(ctx: AiReviewContext): RawIssue[] {
  const appeal = ctx.input.citizenAppeal ?? "";
  const reply = ctx.input.replyContent ?? "";
  const extra: RawIssue[] = [];

  // 语义 1:未回应频繁停电核心诉求(规则 4 已覆盖,这里作为语义强化补充说明)
  if (containsAny(appeal, FREQUENT_APPEAL) && !containsAny(reply, FREQUENT_RESPONSE)) {
    extra.push({
      weight: "高",
      category: "未回应市民核心诉求",
      evidence: "市民反映频繁/常年停电,回单仅说明本次停电原因及恢复情况。",
      analysis:
        "市民核心诉求是解决小区常年/频繁停电问题,回单只回应了本次停电,未回应频繁停电这一深层诉求。",
      requirement:
        "请围绕频繁停电核心诉求,补充近期/一年内停电记录核查、频繁停电原因及后续治理措施。",
    });
  }

  // 语义 2:办理时间与停电时间混同
  // 场景:出现"办理时间",但未单独写明"停电发生时间";
  //       或回单自陈无法核实具体停电时间却仍以办理时间代替。
  const hasHandleTime = reply.includes("办理时间");
  const missingOutageTime = !reply.includes("停电发生时间");
  const cannotVerifyOutageTime = /无法核实[^,。;]*停电时间/.test(reply);
  if (hasHandleTime && (cannotVerifyOutageTime || missingOutageTime)) {
    extra.push({
      weight: "中",
      category: "办理时间与停电时间混同",
      evidence: cannotVerifyOutageTime
        ? "回单出现「办理时间:2026年7月3日22时15分」,却又称「无法核实具体停电时间」。"
        : "回单出现「办理时间」,但未单独写明停电发生时间。",
      analysis:
        "回单以「办理时间」代替停电发生时间,时间口径混同,难以判断停电实际发生时刻与抢修时长。",
      requirement: "请区分并分别写明停电发生时间、接报时间、抢修时间与恢复供电时间。",
    });
  }

  return extra;
}

/** Mock 模式下图片识别返回的示例工单(即翻拍图对应的马道河小区案例) */
const MOCK_OCR_RESULT: OcrExtractResult = {
  orderType: "频繁停电",
  orderNo: "热线-260703-070307",
  citizenAppeal:
    "市民反映朝阳区六里屯街道马道河小区一年内频繁停电,7月3号22点15分停电,停电时长20分钟,整个小区都停电,希望解决常年停电问题,来电反映频繁停电问题。",
  replyContent:
    "【电力公司权属】【已联系】朝阳供电公司中央商务区供电服务中心隋帅于2026年7月3日23时50分与市民联系;但市民电话保密无法联系。【已解决】主责单位:朝阳供电公司中央商务区供电服务中心,办理时间:2026年7月3日22时15分。主要措施:经核实,市民反映的停电原因为7月3日树砸线导致线路停电。市民反映的频繁停电问题,因市民信息保密无法核实具体停电时间。为了排除隐患,防止发生大面积停电,采取临时检修的方式恢复供电。给市民带来了不便,深表歉意。反馈情况:已解决市民诉求,现已恢复正常供电。市民【未知意见】。",
  unit: "朝阳供电公司中央商务区供电服务中心",
  evaluationReport:
    "朝阳供电公司关于热线-260703-070307案件不计入评价的情况说明。经核实，该事件属于不计入评价事项清单中的外力破坏情形，申请本案件不计入考核评价。相关附件：现场照片、处置记录。",
  attachmentNote: "附件1:现场检修照片;附件2:《中华人民共和国电力法》;附件3:《供电营业规则》。",
  rawText:
    "(Mock 模式未真正识别图片,此处为内置示例原文)12345热线转派【多户无电】工单编号:热线-260703-070307…",
  confidence: 0.5,
  notes:
    "Mock 模式未真正识别图片,已填入示例数据供演示。请配置 AI_ENABLED=true 及支持视觉的模型(AI_VISION_MODEL)后重试以真实识别。",
};

export const mockProvider: AiProvider = {
  mode: "mock",
  name: "mock",
  supportsVision: true,

  async extractFromImages(_images: string[]): Promise<OcrExtractResult> {
    return { ...MOCK_OCR_RESULT };
  },

  async extractFromText(_text: string): Promise<OcrExtractResult> {
    return {
      ...MOCK_OCR_RESULT,
      notes:
        "Mock 模式未真正解析文档,已填入示例数据供演示。请配置 AI_ENABLED=true 及文本模型(AI_API_KEY)后重试。",
    };
  },

  async review(ctx: AiReviewContext): Promise<RawReviewOutput> {
    // 以规则命中为基础(转成 AI 视角的问题),再补语义问题
    const fromRules: RawIssue[] = ctx.ruleFindings.map((f) => ({
      weight: f.weight,
      category: f.category,
      evidence: f.evidence,
      analysis: f.analysis,
      requirement: f.requirement,
      target: f.target,
    }));
    const semantic = deriveSemanticIssues(ctx);
    const issues = [...fromRules, ...semantic];

    const riskLevel = issues.length ? highest(issues) : "低";
    const conclusion = issues.some((i) => i.weight === "高")
      ? "建议退回"
      : issues.length
        ? "建议修改"
        : "通过";

    const summary = Array.from(new Set(issues.map((i) => i.category)));

    return {
      conclusion,
      riskLevel,
      summary,
      issues,
      // 意见留给 merger 统一生成(mock 给一个基础版本,merger 会规范化)
      reviewOpinion: buildMockOpinion(issues),
      confidence: issues.length ? 0.82 : 0.9,
    };
  },

  async verify(_ctx: AiReviewContext, prior: RawReviewOutput): Promise<RawReviewOutput> {
    // 轻量复核:按 category 去重(保留更高权重),重算结论与风险
    const byCat = new Map<string, RawIssue>();
    for (const it of prior.issues) {
      const key = it.category.replace(/[\s「」【】]/g, "");
      const existing = byCat.get(key);
      if (!existing || RISK_RANK[it.weight] > RISK_RANK[existing.weight]) {
        byCat.set(key, it);
      }
    }
    const issues = Array.from(byCat.values()).sort(
      (a, b) => RISK_RANK[b.weight] - RISK_RANK[a.weight]
    );
    const riskLevel = issues.length ? highest(issues) : "低";
    const conclusion = issues.some((i) => i.weight === "高")
      ? "建议退回"
      : issues.length
        ? "建议修改"
        : "通过";

    return {
      conclusion,
      riskLevel,
      summary: Array.from(new Set(issues.map((i) => i.category))),
      issues,
      reviewOpinion: buildMockOpinion(issues),
      // 复核后置信度略升
      confidence: Math.min(0.95, (prior.confidence ?? 0.8) + 0.03),
    };
  },

  async distill(ctx: DistillContext): Promise<DistilledCandidate[]> {
    return mockDistill(ctx);
  },

  async distillApproved(ctx: ApprovedDistillContext): Promise<ApprovedDistilledCandidate[]> {
    return mockDistillApproved(ctx);
  },

  async evaluateStandards(ctx: StandardEvaluationContext): Promise<StandardEvaluation> {
    const issueEstimate = (standard: RuleStandard) => ctx.examples.reduce((sum, example) => {
      const reply = `${example.replyContent} ${example.evaluationReport || ""}`;
      const missing = standard.requiredItems.filter((item) => {
        const core = item.replace(/情况|信息|内容|说明|相关|具体|完整|应当|应|需/g, "");
        if (core.length >= 2 && reply.includes(core.slice(0, 6))) return false;
        const semanticChecks: [RegExp, RegExp][] = [
          [/联系|沟通/, /联系|沟通|致电/],
          [/原因|核实/, /原因|核实|调查/],
          [/措施|处理/, /措施|处理|办理|解决/],
          [/结果|解决/, /结果|解决|完成|恢复/],
          [/时间/, /\d{1,4}[年\-/月]\d{1,2}|\d{1,2}[时:：]/],
          [/意见|满意/, /意见|满意|认可|接受/],
          [/材料|佐证/, /材料|附件|图片|报告|佐证/],
        ];
        const matched = semanticChecks.filter(([signal]) => signal.test(item));
        return matched.length > 0 && !matched.every(([, evidence]) => evidence.test(reply));
      }).length;
      return sum + missing;
    }, 0);
    const beforeIssues = issueEstimate(ctx.before);
    const afterIssues = issueEstimate(ctx.after);
    return {
      orderType: ctx.orderType,
      sampleCount: ctx.examples.length,
      previousVersion: ctx.previousVersion,
      currentVersion: ctx.currentVersion,
      before: { passCount: Math.max(0, ctx.examples.length - beforeIssues), issueCount: beforeIssues },
      after: { passCount: Math.max(0, ctx.examples.length - afterIssues), issueCount: afterIssues },
    };
  },

  async extractStandards(text: string): Promise<StandardExtractResult> {
    return mockExtractStandards(text);
  },
};

function mockDistillApproved(ctx: ApprovedDistillContext): ApprovedDistilledCandidate[] {
  if (ctx.examples.length < 1) return [];
  const ids = ctx.examples.slice(0, Math.min(5, ctx.examples.length)).map((e) => e.caseId);
  const confidence = ctx.examples.length === 1 ? 0.55 : 0.78;
  const replies = ctx.examples.map((e) => e.replyContent).join("\n");
  const out: ApprovedDistilledCandidate[] = [];
  if (/联系|沟通/.test(replies)) {
    out.push({
      kind: "reinforce",
      candidateType: "required_item",
      text: "合格回单应说明与市民联系沟通的时间、方式及核实情况。",
      rationale: "多条已通过样本均包含联系沟通信息。",
      supportingCaseIds: ids,
      confidence,
    });
  }
  if (/原因|经核实/.test(replies) && /处理|措施|解决/.test(replies)) {
    out.push({
      kind: "reinforce",
      candidateType: "requirement",
      text: "回单应完整说明核实过程、问题原因、处理措施和最终结果。",
      rationale: "多条已通过样本均形成原因—措施—结果的办理闭环。",
      supportingCaseIds: ids,
      confidence: ctx.examples.length === 1 ? 0.58 : 0.8,
    });
  }
  const reportIds = ctx.examples.filter((e) => e.evaluationReport?.trim()).map((e) => e.caseId);
  if (reportIds.length >= 1) {
    out.push({
      kind: "exempt",
      candidateType: "exemption",
      text: "涉及不计入考核情形时，应以评价报告明确的适用条件及佐证材料综合判定，不得仅凭回单表述直接豁免。",
      rationale: "多条已通过样本附有不计入考核评价报告。",
      supportingCaseIds: reportIds,
      confidence: reportIds.length === 1 ? 0.52 : 0.72,
    });
  }
  return out;
}

// --------------------------------------------------------------------------
// Mock 规范抽取:确定性地按"文本里出现了哪些工单类型名"来产出规范骨架,
// 复用内置默认规范作为骨架,保证无 Key 也能演示「从模板导入」全流程。
// --------------------------------------------------------------------------
function mockExtractStandards(text: string): StandardExtractResult {
  const hit = (ORDER_TYPES as readonly string[]).filter(
    (t) => t !== "其他" && text.includes(t)
  );
  // 一个类型都没提到时,兜底给"其他"通用规范,避免空手而归
  const types = hit.length ? hit : ["其他"];
  const standards: RuleStandard[] = types.map((t) => {
    const base = getDefaultStandard(t);
    // id 留空(入库时定),其余用内置默认骨架
    return { ...base, id: "" };
  });
  return {
    standards,
    notes: "Mock 模式未真正解析模板,已按文本中出现的工单类型填入内置规范骨架供演示。请配置 AI_ENABLED=true 及文本模型后重试以真实抽取。",
    confidence: 0.5,
  };
}

// --------------------------------------------------------------------------
// Mock 蒸馏:确定性关键词聚类,保证无 Key 开发也能演示/测试「学习中心」。
// 规则:
//   - exempt(豁免)← 误判记录里含"过度报错信号词"(保密/无法核实/已说明…),
//     同一信号词 ≥2 条误判才提炼(反复出现),避免一次性纠错成规则。
//   - reinforce(加强)← 人工改意见里含"补要素信号词"(应补充/未写明/需说明…),
//     同一信号词 ≥2 条才提炼。
//   - 若信号已在现有规范/已有准则里出现,则去重跳过。
// --------------------------------------------------------------------------

/** 误判里常见的"AI 过度报错"信号 → 对应一条豁免准则模板 */
const EXEMPT_SIGNALS: { kw: string[]; text: string }[] = [
  {
    kw: ["保密", "无法核实", "无法联系"],
    text: "市民电话保密或信息受限导致无法核实时,不应据此判为「联系情况矛盾」或「未回应」的高风险问题,应结合报备情况综合判断。",
  },
  {
    kw: ["已说明", "已作出结论", "已回应"],
    text: "回单已就某要素作出结论或说明时,不应报为「未回应/未提及」,如缺依据应表述为「已说明但缺少核实过程/事实支撑」。",
  },
];

/** 人工改意见里常见的"需补要素"信号 → 对应一条加强准则模板 */
const REINFORCE_SIGNALS: { kw: string[]; text: string; riskLevel: RiskLevel }[] = [
  {
    kw: ["停电发生时间", "恢复供电时间", "抢修时间"],
    text: "必须分别写明停电发生时间、抢修时间与恢复供电时间,不得以「办理时间」混同代替。",
    riskLevel: "中",
  },
  {
    kw: ["频繁", "常年", "多次", "后续治理", "隐患排查"],
    text: "对频繁/常年停电诉求,必须回应频繁停电原因与后续治理措施,仅说明本次停电视为未回应核心诉求。",
    riskLevel: "高",
  },
];

function mockDistill(ctx: DistillContext): DistilledCandidate[] {
  const { feedback, existingStandard } = ctx;
  const existingText = [
    ...(existingStandard?.learnedRules ?? []),
    ...(existingStandard?.learnedExemptions ?? []),
  ].join("\n");

  const out: DistilledCandidate[] = [];

  // exempt:扫误判记录
  for (const sig of EXEMPT_SIGNALS) {
    if (existingText.includes(sig.text)) continue; // 去重
    const supporting = feedback.filter(
      (f) => f.isFalsePositive && containsAny(f.falsePositiveNote ?? "", sig.kw)
    );
    if (supporting.length >= 1) {
      out.push({
        kind: "exempt",
        text: sig.text,
        rationale: supporting.length === 1
          ? `单样本候选：该误判记录出现「${sig.kw[0]}」类情形，需人工确认是否具有通用性。`
          : `共 ${supporting.length} 条误判记录反复出现「${sig.kw[0]}」类情形,AI 过度报错。`,
        supportingCaseIds: supporting.map((f) => f.caseId).filter((id): id is string => !!id),
        confidence: supporting.length === 1 ? 0.55 : 0.8,
      });
    }
  }

  // reinforce:扫人工改意见
  for (const sig of REINFORCE_SIGNALS) {
    if (existingText.includes(sig.text)) continue; // 去重
    const supporting = feedback.filter(
      (f) => !!f.finalOpinion && containsAny(f.finalOpinion, sig.kw)
    );
    if (supporting.length >= 1) {
      out.push({
        kind: "reinforce",
        text: sig.text,
        rationale: supporting.length === 1
          ? `单样本候选：该人工意见补充了「${sig.kw[0]}」相关要素，需人工确认是否固化。`
          : `共 ${supporting.length} 条人工意见反复补上「${sig.kw[0]}」相关要素,应固化为必审项。`,
        supportingCaseIds: supporting.map((f) => f.caseId).filter((id): id is string => !!id),
        riskLevel: sig.riskLevel,
        confidence: supporting.length === 1 ? 0.55 : 0.78,
      });
    }
  }

  return out;
}

const ORDINALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

function buildMockOpinion(issues: RawIssue[]): string {
  if (!issues.length) {
    return "经审核,该回单事实清楚、要素完整、表述规范,未发现明显问题,建议通过。";
  }
  const sorted = [...issues].sort((a, b) => RISK_RANK[b.weight] - RISK_RANK[a.weight]);
  const clauses = sorted
    .slice(0, ORDINALS.length)
    .map((it, i) => `${ORDINALS[i]}是${(it.analysis || it.category).replace(/。$/, "")}`);
  return `经审核,该回单存在以下问题:${clauses.join(";")}。请承办单位补充完善相关情况后重新反馈。`;
}

/** 便捷判断:是否使用了某些关键词(供测试/扩展) */
export function mockDebugMatched(reply: string, keywords: string[]): string[] {
  return matchedKeywords(reply, keywords);
}
