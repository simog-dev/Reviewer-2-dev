/**
 * Plans citation fragments against immutable PDF text-span offsets.
 * Keeping this calculation separate from DOM mutation makes adjacent and
 * cross-span citations deterministic and independently testable.
 *
 * @param {Array<{span: Object, text: string, startOffset: number, endOffset: number}>} spanMap
 * @param {Array<{index: number, match: string, targets: Array}>} citations
 * @returns {Map<Object, Array<{start: number, end: number, targets: Array, partIndex: number, partCount: number}>>}
 */
export function planCitationFragments(spanMap, citations) {
  const fragmentsBySpan = new Map();

  for (const citation of citations) {
    const citationStart = citation.index;
    const citationEnd = citation.index + citation.match.length;
    const affectedSpans = spanMap.filter(spanInfo =>
      spanInfo.endOffset > citationStart && spanInfo.startOffset < citationEnd
    );

    affectedSpans.forEach((spanInfo, partIndex) => {
      if (!fragmentsBySpan.has(spanInfo.span)) fragmentsBySpan.set(spanInfo.span, []);
      fragmentsBySpan.get(spanInfo.span).push({
        start: Math.max(0, citationStart - spanInfo.startOffset),
        end: Math.min(spanInfo.text.length, citationEnd - spanInfo.startOffset),
        targets: citation.targets,
        partIndex,
        partCount: affectedSpans.length
      });
    });
  }

  for (const fragments of fragmentsBySpan.values()) {
    fragments.sort((a, b) => a.start - b.start);
  }

  return fragmentsBySpan;
}

export default { planCitationFragments };
