import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { scrapboxCodeBlockLineNumbers, scrapboxTableBlockLineNumbers, type ScrapboxDocument } from "./parser.js";

/**
 * The 1-based line numbers occupied by a code block or a table block, whose
 * content must stay literal. These are skipped regardless of focus.
 */
export function scrapboxBlockLineNumbers(document: ScrapboxDocument): Set<number> {
  const blocks = scrapboxCodeBlockLineNumbers(document);
  for (const lineNumber of scrapboxTableBlockLineNumbers(document)) {
    blocks.add(lineNumber);
  }
  return blocks;
}

/**
 * The 1-based line numbers a syntax-revealing scrapbox plugin must leave
 * untouched: the active (revealed) lines, plus every code-block and table-block
 * line. Centralises the skip rule shared by the quote, command-line,
 * decoration, link and image plugins.
 *
 * The list plugin deliberately does NOT use this: its bullet dot hides no
 * syntax (the raw indent is always shown), so — like real Scrapbox — the dot
 * stays visible even while the cursor is on the line. See
 * {@link scrapboxBlockLineNumbers}.
 */
export function scrapboxSkippedLineNumbers(
  document: ScrapboxDocument,
  activeLines: MboxActiveLineNumbers,
): Set<number> {
  const skipped = scrapboxBlockLineNumbers(document);
  for (const lineNumber of activeLines) {
    skipped.add(lineNumber);
  }
  return skipped;
}
