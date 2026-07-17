// Renders a Hatena table as an aligned grid, sharing its line/cell/pipe-hide
// mechanics with the mbox and gfm table plugins via table-kit. Unlike GFM,
// Hatena has no delimiter row and no column alignment; header status is a
// PER-CELL flag (a cell's trimmed text starting with `*`) rather than a row
// concept, so it is carried as table-kit's per-cell `className`, and column
// width uses an injected CJK-aware measure instead of raw character count.
//
// Whitespace-hiding and the header `*` marker hide stay namespace-local: a
// header cell's left trim boundary must stop at the marker (not the content
// start), leaving the marker itself for `createHeaderMarkerHideSpecs` to hide
// separately — a nuance table-kit's plain trimmed-content model doesn't carry.
//
// Grid borders and header shading are left entirely to consumer CSS on the
// stable `.mbox-hatena-table*` classes. Monospace is the one exception: the
// `displayWidth` CJK-aware measure above only produces a visually correct `ch`
// grid under a monospace (or similarly uniform) font, so that one property is
// structural and ships in this plugin's own theme.
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument, HatenaTable, HatenaTableCell, HatenaTableRow } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  displayWidth,
  type TableKitClassNames,
  type TableKitRow,
} from "../table-kit.js";

export const hatenaTableRenderedClassName = "mbox-hatena-table-rendered";
export const hatenaTableRawCellClassName = "mbox-hatena-table-raw-cell";

export const hatenaTableClassNames = {
  table: "mbox-hatena-table",
  row: "mbox-hatena-table-row",
  cell: "mbox-hatena-table-cell",
  headerCell: "mbox-hatena-table-header-cell",
  rendered: hatenaTableRenderedClassName,
  rawCell: hatenaTableRawCellClassName,
};

const kitClassNames: TableKitClassNames = {
  table: hatenaTableClassNames.table,
  renderedLine: hatenaTableRenderedClassName,
  cell: hatenaTableClassNames.cell,
  rawCell: hatenaTableRawCellClassName,
};

function createHatenaTableSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.tables.flatMap((table) => createSpecsForTable(table, activeLines));
}

function toKitRows(table: HatenaTable): TableKitRow[] {
  return table.rows.map((row) => ({
    className: hatenaTableClassNames.row,
    line: row.line,
    from: row.from,
    to: row.to,
    cells: row.cells.map((cell) => ({
      ...cell,
      className: cell.header ? hatenaTableClassNames.headerCell : undefined,
    })),
  }));
}

function createSpecsForTable(table: HatenaTable, activeLines: Set<number>): MboxDecorationSpec[] {
  const rows = toKitRows(table);
  return [
    ...createTableLineSpecs(rows, activeLines, kitClassNames, { tableId: `hatena-table-${table.from}`, isHeaderCell: (row, _rowIndex, columnIndex) => Boolean(row.cells[columnIndex]?.className) }),
    ...createTableHeaderRowSpecs(rows, activeLines, { tableId: `hatena-table-${table.from}` }),
    ...createTableCellSpecs(rows, activeLines, kitClassNames, { measureWidth: displayWidth }, { tableId: `hatena-table-${table.from}`, isHeaderCell: (row, _rowIndex, columnIndex) => Boolean(row.cells[columnIndex]?.className) }),
    ...table.rows.flatMap((row) => createCellWhitespaceHideSpecs(row, activeLines.has(row.line))),
    ...table.rows.flatMap((row) => createHeaderMarkerHideSpecs(row, activeLines.has(row.line))),
    ...createTablePipeHideSpecs(rows, activeLines),
  ];
}

function createCellWhitespaceHideSpecs(row: HatenaTableRow, active: boolean): MboxDecorationSpec[] {
  if (active) {
    return [];
  }
  return row.cells.flatMap((cell) => {
    // The trimmed run begins at the `*` marker for a header cell, else at the
    // content; the padding on both sides of it is hidden.
    const trimFrom = cell.marker ? cell.marker.from : cell.content.from;
    const range = getContentRange(cell);
    if (trimFrom === cell.from && range.to === cell.to) {
      return [];
    }
    return [
      { type: "replace" as const, from: cell.from, to: trimFrom },
      { type: "replace" as const, from: range.to, to: cell.to },
    ].filter((spec) => spec.from < spec.to);
  });
}

function createHeaderMarkerHideSpecs(row: HatenaTableRow, active: boolean): MboxDecorationSpec[] {
  if (active) {
    return [];
  }
  return row.cells.flatMap((cell) =>
    cell.marker ? [{ type: "replace" as const, from: cell.marker.from, to: cell.marker.to }] : [],
  );
}

function getContentRange(cell: HatenaTableCell): { from: number; to: number } {
  return cell.content.from < cell.content.to ? cell.content : { from: cell.from, to: cell.to };
}

export function hatenaTablePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${hatenaTableClassNames.table}`]: {
        fontFamily:
          'var(--mbox-table-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
    },
    name: "hatena/table",
    decorations: hatenaDecorationProvider(createHatenaTableSpecs),
  };
}
