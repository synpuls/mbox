import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { ScrapboxDocument, ScrapboxTableBlock } from "./parser.js";
import { getScrapboxDocumentCacheEntryFromState } from "./parser-cache.js";
import { projectScrapboxLinkDisplayValue } from "./link.js";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  createTableWhitespaceHideSpecs,
  displayWidth,
  type TableKitCell,
  type TableKitClassNames,
  type TableKitRow,
} from "../table-kit.js";

export const scrapboxTableClassName = "mbox-scrapbox-table";
export const scrapboxTableOpenerClassName = "mbox-scrapbox-table-opener";
export const scrapboxTableRowClassName = "mbox-scrapbox-table-row";
export const scrapboxTableHeaderClassName = "mbox-scrapbox-table-header";
export const scrapboxTableCellClassName = "mbox-scrapbox-table-cell";
export const scrapboxTableRawCellClassName = "mbox-scrapbox-table-raw-cell";
export const scrapboxTableRenderedClassName = "mbox-scrapbox-table-rendered";
export const scrapboxTableKeywordClassName = "mbox-scrapbox-table-keyword";
export const scrapboxTableNameClassName = "mbox-scrapbox-table-name";

const tableKeywordLength = "table:".length;

export const scrapboxTableClassNames = {
  table: scrapboxTableClassName,
  opener: scrapboxTableOpenerClassName,
  row: scrapboxTableRowClassName,
  header: scrapboxTableHeaderClassName,
  cell: scrapboxTableCellClassName,
  rawCell: scrapboxTableRawCellClassName,
  rendered: scrapboxTableRenderedClassName,
  keyword: scrapboxTableKeywordClassName,
  name: scrapboxTableNameClassName,
};

const kitClassNames: TableKitClassNames = {
  table: scrapboxTableClassName,
  renderedLine: scrapboxTableRenderedClassName,
  cell: scrapboxTableCellClassName,
  rawCell: scrapboxTableRawCellClassName,
};

/** The trimmed content range and text of `input.slice(from, to)`, computed
 * from a single `trim()` call so an all-whitespace (or empty) span yields a
 * zero-length range at a single, well-defined position rather than an
 * inverted `from > to` range (as independently deriving `trimStart`/`trimEnd`
 * boundaries would for that case). */
function trimRange(input: string, from: number, to: number): TableKitCell["content"] & { value: string } {
  const raw = input.slice(from, to);
  const trimmed = raw.trim();
  const contentFrom = from + raw.indexOf(trimmed);
  return { from: contentFrom, to: contentFrom + trimmed.length, value: trimmed };
}

/** One `TableKitRow` per body line: `row.from` is the whole line (indent
 * included), and each cell's raw span starts right after the previous tab (or
 * the line's own indent, for the first cell) -- so table-kit's pipe-hide
 * logic (row start to first cell, between cells, last cell to row end) hides
 * the required indent marker and the tab separators the same way it hides a
 * markdown table's pipes, with no scrapbox-specific hide function needed. The
 * first row is presentation-only styled as a header (scrapbox's own syntax
 * has no header marker). */
function toKitRows(input: string, block: ScrapboxTableBlock): TableKitRow[] {
  return block.bodyLines.map((line, index) => {
    const cells: TableKitCell[] = [];
    let from = line.content.from;

    for (const rawCell of input.slice(line.content.from, line.logicalTo).split("\t")) {
      const to = from + rawCell.length;
      const { value, ...content } = trimRange(input, from, to);
      const displayValue = projectScrapboxLinkDisplayValue(input, line, content.from, content.to);
      cells.push({ from, to, content, value, ...(displayValue === undefined ? {} : { displayValue }) });
      from = to + 1; // skip the tab separator
    }

    return {
      className: index === 0 ? `${scrapboxTableRowClassName} ${scrapboxTableHeaderClassName}` : scrapboxTableRowClassName,
      line: line.line,
      from: line.from,
      to: line.logicalTo,
      cells,
    };
  });
}

function createScrapboxTableSpecs(input: string, document: ScrapboxDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.tableBlocks.flatMap((block) => {
    const opener = block.openerLine;
    const keywordEnd = opener.content.from + tableKeywordLength;

    const specs: MboxDecorationSpec[] = [
      {
        type: "line",
        from: opener.from,
        className: `${scrapboxTableClassName} ${scrapboxTableOpenerClassName}`,
      },
      { type: "mark", from: opener.content.from, to: keywordEnd, className: scrapboxTableKeywordClassName },
    ];

    if (opener.logicalTo > keywordEnd) {
      specs.push({ type: "mark", from: keywordEnd, to: opener.logicalTo, className: scrapboxTableNameClassName });
    }

    const rows = toKitRows(input, block);
    specs.push(
      ...createTableLineSpecs(rows, activeLines, kitClassNames, { tableId: `scrapbox-table-${opener.from}` }),
      ...createTableHeaderRowSpecs(rows, activeLines, { tableId: `scrapbox-table-${opener.from}` }),
      ...createTableCellSpecs(rows, activeLines, kitClassNames, { measureWidth: displayWidth }, { tableId: `scrapbox-table-${opener.from}` }),
      ...createTableWhitespaceHideSpecs(rows, activeLines),
      ...createTablePipeHideSpecs(rows, activeLines),
    );

    return specs;
  });
}

// Monospace here is structural, not a style preference: like mbox/gfm/hatena's
// own table plugins, the fixed ch-width column layout table-kit computes is
// only visually correct under a monospace (or other uniform ch-grid) font.
export function scrapboxTablePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${scrapboxTableClassName}`]: {
        fontFamily:
          'var(--mbox-table-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
      [`.${scrapboxTableCellClassName}`]: {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      // Both classes: a raw cell carries the base cell class too, so a
      // single-class rule would only win by being written second.
      [`.${scrapboxTableCellClassName}.${scrapboxTableRawCellClassName}`]: {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
    },
    name: "scrapbox/table",
    decorations: (context) => {
      const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
      return createScrapboxTableSpecs(input, document, context.activeLineNumbers);
    },
  };
}
