// ==========================================================================
// OCR 抽取 Prompt —— 多模态大模型识别工单图片并抽取结构化字段
// --------------------------------------------------------------------------
// 系统把用户上传的一张或多张工单图片(诉求主表、承办单位回单、附件说明等)
// 发给视觉大模型,要求其 OCR 识别文字并按栏目归类到工单字段,输出 JSON。
// ==========================================================================

export const OCR_SYSTEM_PROMPT = `你是国家电网12345工单信息抽取助手。用户会上传一张或多张工单相关图片(可能是屏幕翻拍,存在摩尔纹、偏色、印章遮挡)。
你的任务:
1. 对所有图片进行 OCR 文字识别;
2. 按栏目把内容归类到工单字段,严格照抄原文,不要改写、润色或补充事实;
3. 多张图片按给定顺序理解为同一条工单的不同部分(如:诉求主表、承办单位回单、不计入考核评价报告),合并抽取。

字段归类规则:
- citizenAppeal(市民诉求):取"市民反映/来电内容/存在的具体问题/诉求"等栏目的原文。若诉求栏含编号(如"1、问题点位… 2、供电性质… 3、存在的问题…"),完整保留。
- replyContent(回单内容):取工单表中的"承办单位反馈/电力公司权属/【已联系】【已解决】/主要措施/反馈情况"等答复原文。不要把独立的不计入评价报告混入此字段。
- evaluationReport(不计入考核评价报告):取标题含"不计入考核评价报告"、"案件不计入评价的情况说明"、"申请不计入评价"等独立报告的完整正文，包括市民诉求、调查处置情况、申请原因、政策依据和附件清单；无则留空。
- orderNo(工单编号):如"热线-260703-070307"这类编号,无则留空。
- unit(承办单位):如"朝阳供电公司中央商务区供电服务中心",无则留空。
- attachmentNote(附件说明):图片中提到的附件/佐证材料线索(如"附件1:现场检修照片""相关附件…"),无则留空。
- orderType(工单类型):必须从下方给定的枚举中选择最接近的一个;若图片中的类型词(如"多户无电")不在枚举中,则映射到语义最接近的枚举值,实在无法判断则留空字符串。

识别质量:
- rawText:输出你识别到的完整原文(所有图片合并),供人工核对。
- 对无法看清或不确定的地方,在 notes 中说明,不要编造。
- confidence:综合识别清晰度与拆分把握度,给 0~1 的数值。

只输出 JSON 对象,不要输出 Markdown 或解释。JSON 字段:
- orderType: string(枚举内或"")
- orderNo: string
- citizenAppeal: string
- replyContent: string
- evaluationReport: string
- unit: string
- attachmentNote: string
- rawText: string
- confidence: number
- notes: string`;

/** 构造 user 侧文字提示(图片由 provider 以 image_url 追加在其后) */
export function buildOcrUserPrompt(orderTypes: readonly string[]): string {
  return `请识别下面上传的工单图片并抽取字段,输出 JSON。

【工单类型枚举(orderType 只能取其一或留空)】
${orderTypes.join(" / ")}

【要求】
- 严格照抄原文,不改写、不补充、不编造。
- 诉求、回单、不计入考核评价报告分别归入 citizenAppeal、replyContent、evaluationReport，三者不得混填。
- 多张图片按上传顺序合并为同一条工单。
- 只返回 JSON 对象,字段见系统提示。`;
}

/**
 * 构造纯文本抽取的 user 提示(用于 Word/Excel 解析出的文本)。
 * 与图片版规则一致,只是内容来自已解析的文档文本而非图片。
 * rawText 直接取入参文本,无需模型再"识别"。
 */
export function buildTextExtractUserPrompt(
  orderTypes: readonly string[],
  text: string
): string {
  return `下面是从 Word/Excel 文档中提取出的工单文本。请按栏目把内容抽取到工单字段,输出 JSON。

【工单类型枚举(orderType 只能取其一或留空)】
${orderTypes.join(" / ")}

【要求】
- 严格照抄原文,不改写、不补充、不编造。
- 诉求与回单分别归入 citizenAppeal 与 replyContent(诉求取"市民反映/来电内容/存在的问题",回单取工单表中的"承办单位/电力公司权属/【已联系】【已解决】/反馈情况")。
- 标题含"不计入考核评价报告"、"案件不计入评价的情况说明"、"申请不计入评价"的独立报告完整归入 evaluationReport，不要拼入 replyContent。
- orderNo/unit/attachmentNote/evaluationReport 有则填,无则留空。
- orderType 从枚举中选最接近的一个,无法判断则留空。
- rawText 字段直接返回下方原始文本(可原样照抄)。
- confidence 反映拆分把握度。
- 只返回 JSON 对象,字段见系统提示。

【文档文本】
${text}`;
}
