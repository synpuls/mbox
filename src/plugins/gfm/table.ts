// Renders a GFM pipe table as an aligned grid, matching the mbox notation's table
// presentation. The header line, the delimiter line (`---|---`), and each body row
// become rendered table lines; inside each line the `| a | b |` pipes and the
// padding whitespace around each cell are hidden, and the trimmed cell text is laid
// out in fixed `ch`-width columns. Any ACTIVE line is rendered "raw" instead —
// pipes and padding revealed — so the user edits the real pipe-table text on that
// line.
//
// The adapter (parser.ts) already recovered the pipe-separated cell geometry that
// mdast itself does not expose (it drops the delimiter row and folds pipes into
// cell bounds); this plugin only projects GfmTable into table-kit's row shape
// (attaching each column's alignment per cell) and shares the rest — line/cell/
// pipe-hide/whitespace-hide mechanics — with the mbox table plugin.
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { GfmDocument, GfmTable } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  createTableWhitespaceHideSpecs,
  type TableKitClassNames,
  type TableKitRow,
} from "../table-kit.js";

export const gfmTableRenderedClassName = "mbox-gfm-table-rendered";
export const gfmTableRawCellClassName = "mbox-gfm-table-raw-cell";

export const gfmTableClassNames = {
  table: "mbox-gfm-table",
  header: "mbox-gfm-table-header",
  delimiter: "mbox-gfm-table-delimiter",
  row: "mbox-gfm-table-row",
  cell: "mbox-gfm-table-cell",
  rendered: gfmTableRenderedClassName,
  rawCell: gfmTableRawCellClassName,
};

const kitClassNames: TableKitClassNames = {
  table: gfmTableClassNames.table,
  renderedLine: gfmTableRenderedClassName,
  cell: gfmTableClassNames.cell,
  rawCell: gfmTableRawCellClassName,
};

function toKitRows(table: GfmTable): TableKitRow[] {
  const withAlign = (row: GfmTable["header"]) => ({
    ...row,
    cells: row.cells.map((cell, columnIndex) => ({ ...cell, align: table.align[columnIndex] ?? null })),
  });

  return [
    { className: gfmTableClassNames.header, line: table.line, ...withAlign(table.header) },
    {
      className: gfmTableClassNames.delimiter,
      includeInColumnWidths: false,
      line: table.line + 1,
      from: table.delimiter.from,
      to: table.delimiter.to,
      cells: table.delimiter.cells.map((cell) => ({ ...cell, className: "mbox-gfm-table-delimiter-cell" })),
    },
    ...table.rows.map((row, index) => ({ className: gfmTableClassNames.row, line: table.line + 2 + index, ...withAlign(row) })),
  ];
}

function createGfmTableSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.tables.flatMap((table) => createSpecsForTable(table, activeLines));
}

function createSpecsForTable(table: GfmTable, activeLines: Set<number>): MboxDecorationSpec[] {
  let rows = toKitRows(table);
  const semantics = rows.some((row) => activeLines.has(row.line)) ? undefined : { tableId: `gfm-table-${table.from}` };
  if (semantics) {
    rows = rows.map((row, index) => (index === 1 ? { ...row, attributes: { "aria-hidden": "true" } } : row));
  }
  return [
    ...createTableLineSpecs(rows, activeLines, kitClassNames, semantics),
    ...createTableHeaderRowSpecs(rows, activeLines, semantics),
    ...createTableCellSpecs(rows, activeLines, kitClassNames, {}, semantics),
    ...createTableWhitespaceHideSpecs(rows, activeLines),
    ...createTablePipeHideSpecs(rows, activeLines),
  ];
}

// Monospace is structural here, not a style preference: the fixed `ch`-width
// column layout above is only visually correct under a monospace (or other
// uniform `ch`-grid) font, so this plugin ships it in its own theme rather than
// leaving it to a host's font choice.
export function gfmTablePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${gfmTableClassNames.table}`]: {
        fontFamily:
          'var(--mbox-table-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
    },
    name: "gfm/table",
    decorations: (context) => createGfmTableSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
