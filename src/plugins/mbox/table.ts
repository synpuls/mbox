// Renders a GFM pipe table as an aligned grid. The header line, the delimiter
// line (`---|---`), and each body row become rendered table lines; inside each
// line the `| a | b |` pipes and the padding whitespace around each cell are
// hidden, and the trimmed cell text is laid out in fixed `ch`-width columns. Any
// ACTIVE (selected) line is rendered "raw" instead — pipes and padding revealed —
// so the user edits the real pipe-table text on that line.
//
// The row/cell/width/pipe-hide/whitespace-hide mechanics are shared with gfm's
// table plugin via table-kit; this file only adapts MboxTableBlock into the
// kit's row shape and supplies mbox's own class names.
//
// Styling: this plugin emits stable `mbox-*` classes; most visual styling lives in
// consumer CSS (src/styles.css for the demos). The one exception is monospace: the
// fixed `ch`-width column layout above is only visually correct under a monospace
// (or other uniform `ch`-grid) font, so that one property is structural and ships
// in this plugin's own theme rather than being left to a host's font choice.
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDocument, MboxTableBlock } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  createTableWhitespaceHideSpecs,
  displayWidth,
  type TableKitClassNames,
  type TableKitRow,
} from "../table-kit.js";

export const tableRenderedClassName = "mbox-table-rendered";
export const tableRawCellClassName = "mbox-table-raw-cell";

export const tableClassNames = {
  table: "mbox-table",
  header: "mbox-table-header",
  delimiter: "mbox-table-delimiter",
  row: "mbox-table-row",
  cell: "mbox-table-cell",
  rendered: tableRenderedClassName,
  rawCell: tableRawCellClassName,
};

const kitClassNames: TableKitClassNames = {
  table: tableClassNames.table,
  renderedLine: tableRenderedClassName,
  cell: tableClassNames.cell,
  rawCell: tableRawCellClassName,
};

function toKitRows(block: MboxTableBlock): TableKitRow[] {
  return [
    {
      className: tableClassNames.header,
      line: block.line,
      from: block.header.from,
      to: block.header.to,
      cells: block.header.cells,
    },
    {
      className: tableClassNames.delimiter,
      includeInColumnWidths: false,
      line: block.line + 1,
      from: block.delimiter.from,
      to: block.delimiter.to,
      cells: block.delimiter.cells.map((cell) => ({ ...cell, className: "mbox-table-delimiter-cell" })),
    },
    ...block.rows.map((row, index) => ({
      className: tableClassNames.row,
      line: block.line + 2 + index,
      from: row.from,
      to: row.to,
      cells: row.cells,
    })),
  ];
}

function createTableSpecs(document: MboxDocument, activeLines: MboxActiveLineNumbers = new Set()): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) => (block.type === "table" ? createTableSpecsForBlock(block, activeLines) : []));
}

export function tablePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${tableClassNames.table}`]: {
        fontFamily:
          'var(--mbox-table-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
      [`.${tableClassNames.cell}`]: {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      // Both classes: a raw cell carries the base cell class too, so a
      // single-class rule would only win by being written second.
      [`.${tableClassNames.cell}.${tableRawCellClassName}`]: {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
    },
    name: "mbox/table",
    decorations: (context) => createTableSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers),
  };
}

function createTableSpecsForBlock(block: MboxTableBlock, activeLines: MboxActiveLineNumbers): MboxDecorationSpec[] {
  let rows = toKitRows(block);
  const semantics = rows.some((row) => activeLines.has(row.line)) ? undefined : { tableId: `mbox-table-${block.from}` };
  if (semantics) {
    rows = rows.map((row, index) => (index === 1 ? { ...row, attributes: { "aria-hidden": "true" } } : row));
  }
  return [
    ...createTableLineSpecs(rows, activeLines, kitClassNames, semantics),
    ...createTableHeaderRowSpecs(rows, activeLines, semantics),
    ...createTableCellSpecs(rows, activeLines, kitClassNames, { measureWidth: displayWidth }, semantics),
    ...createTableWhitespaceHideSpecs(rows, activeLines),
    ...createTablePipeHideSpecs(rows, activeLines),
  ];
}
