// ==========================================================================
// 词法相似度(Tier2:跨类型召回,纯进程内,无 LLM / 无 embedding)
// --------------------------------------------------------------------------
// 中文没有天然词边界,故用「字符 2-gram(bigram)shingle + Jaccard」度量文本相似度
// —— 这是对 CJK 稳健且极廉价的近似,足以在跨工单类型间召回"语义相近"的历史反馈
// (共享领域词如 停电时间 / 保密 / 未联系 / 频繁 / 权属 会产生大量重合 bigram)。
// 类目重叠再做一次加权。全部同步计算,不引入任何网络调用,审核仍保持 2 次 LLM 调用。
// ==========================================================================

/** 归一化:去标点/空白,仅保留有意义的字词字符 */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, ""); // 去所有标点、符号、空白
}

/** 生成字符 2-gram 集合(长度<2 时退化为单字集合) */
function bigrams(s: string): Set<string> {
  const t = normalize(s);
  const set = new Set<string>();
  if (t.length < 2) {
    if (t) set.add(t);
    return set;
  }
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

/** 两个集合的 Jaccard 相似度(交/并),范围 0~1 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** 文本 bigram-Jaccard 相似度 */
export function textSimilarity(a: string, b: string): number {
  return jaccard(bigrams(a), bigrams(b));
}

/** 类目集合重叠度(Jaccard);无类目时返回 0 */
export function categoryOverlap(a: string[], b: string[]): number {
  const sa = new Set(a.map((s) => normalize(s)).filter(Boolean));
  const sb = new Set(b.map((s) => normalize(s)).filter(Boolean));
  return jaccard(sa, sb);
}

/**
 * 综合相似度:文本 bigram 相似度为主(权重 0.75)+ 类目重叠为辅(0.25)。
 * 类目为空时仅用文本相似度。范围 0~1。
 */
export function combinedSimilarity(
  textA: string,
  textB: string,
  categoriesA: string[] = [],
  categoriesB: string[] = []
): number {
  const text = textSimilarity(textA, textB);
  const hasCats = categoriesA.length > 0 && categoriesB.length > 0;
  if (!hasCats) return text;
  const cat = categoryOverlap(categoriesA, categoriesB);
  return 0.75 * text + 0.25 * cat;
}
