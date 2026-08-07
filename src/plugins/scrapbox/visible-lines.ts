import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { scrapboxCodeBlockLineNumbers, scrapboxTableBlockLineNumbers, type ScrapboxDocument } from "./parser.js";

/**
 * The 1-based line numbers occupied by a code block or a table block. Code
 * blocks stay literal for every inline provider; table cells are selectively
 * rendered: mbox keeps links live in table cells but leaves images and
 * formulas raw, because a figure or a formula widget breaks the cell grid.
 */
export function scrapboxBlockLineNumbers(document: ScrapboxDocument): Set<number> {
  const blocks = scrapboxCodeBlockLineNumbers(document);
  for (const lineNumber of scrapboxTableBlockLineNumbers(document)) {
    blocks.add(lineNumber);
  }
  return blocks;
}

/**
 * The 1-based lines the link plugin must leave raw. Links are the only inline
 * provider with this set because mbox renders links in table body cells,
 * yet a `table:` name is download metadata rather than page-link syntax.
 * Other providers leave the complete table block literal through
 * {@link scrapboxBlockLineNumbers}.
 */
export function scrapboxLinkSkippedLineNumbers(document: ScrapboxDocument): Set<number> {
  const skipped = scrapboxCodeBlockLineNumbers(document);
  for (const block of document.tableBlocks) {
    skipped.add(block.openerLine.line);
  }
  return skipped;
}

/**
 * The 1-based line numbers a syntax-revealing scrapbox plugin must leave
 * untouched: the active (revealed) lines, plus every code-block and table-block
 * line. The formula plugin uses this because it decides per line. Quote,
 * decoration, and image plugins instead start with
 * {@link scrapboxBlockLineNumbers} and consult active state per node.
 * Command-line also starts with that block-only set, deliberately applies on
 * active lines too, and therefore does not inspect `activeLines`. The link
 * plugin is the sole exception to the block part: it permits table body cells,
 * but not table opener names.
 *
 * The list plugin deliberately does NOT use this: its bullet dot hides no
 * syntax (the raw indent is always shown), so there is nothing to reveal and
 * the dot stays visible even while the cursor is on the line. See
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
