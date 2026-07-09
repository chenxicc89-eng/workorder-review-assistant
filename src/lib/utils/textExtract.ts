// ==========================================================================
// 文本处理辅助 —— 供规则引擎使用
// ==========================================================================

/** 文本中是否命中任意一个关键词 */
export function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/** 返回文本中命中的所有关键词 */
export function matchedKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((k) => text.includes(k));
}

/** 文本中是否命中全部关键词 */
export function containsAll(text: string, keywords: string[]): boolean {
  return keywords.every((k) => text.includes(k));
}

/**
 * 围绕关键词截取一小段原文作为 evidence。
 * @param text 原文
 * @param keyword 命中关键词
 * @param radius 关键词前后各取多少字
 */
export function snippetAround(text: string, keyword: string, radius = 24): string {
  const idx = text.indexOf(keyword);
  if (idx === -1) return "";
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + keyword.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`.trim();
}

/**
 * 对多个命中关键词各截取片段并合并(去重、限量)。
 */
export function evidenceFor(text: string, keywords: string[], max = 2): string {
  const hits = matchedKeywords(text, keywords);
  const snippets = hits
    .slice(0, max)
    .map((k) => snippetAround(text, k))
    .filter(Boolean);
  return [...new Set(snippets)].join(" / ");
}

/** 判断是否包含时间信息(时/分/日期/几点等)。用于时间节点完整性检查。 */
export function hasTimeInfo(text: string): boolean {
  const timePatterns = [
    /\d{1,2}[时点]/, // 22时 / 3点
    /\d{1,2}:\d{2}/, // 22:15
    /\d{1,2}分/, // 15分
    /\d{4}年/, // 2026年
    /\d{1,2}月\d{1,2}[日号]/, // 7月3日
  ];
  return timePatterns.some((re) => re.test(text));
}
