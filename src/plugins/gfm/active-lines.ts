export interface GfmLineSpan {
  startLine: number;
  endLine: number;
}

/**
 * Whether any line a span touches is active. GFM inline constructs (links,
 * emphasis/strong/strike, inline code) can span multiple lines, so revealing
 * one on an active line means checking every line it covers, not just its
 * first.
 */
export function isLineSpanActive(span: GfmLineSpan, activeLines: Set<number>): boolean {
  for (let line = span.startLine; line <= span.endLine; line += 1) {
    if (activeLines.has(line)) {
      return true;
    }
  }
  return false;
}
