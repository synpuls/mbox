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
import type { EditorState } from "@codemirror/state";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import { gfmImageClassNames, gfmImageInternalClassNames, gfmImagePreviewEnabled } from "./image.js";
import type { GfmDocument, GfmTable } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
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

export interface GfmTablePluginOptions {
  /**
   * How wide a column holding an image should be, in GRID UNITS -- the same
   * units the fixed `ch` grid is measured in, not characters and not pixels.
   * Defaults to 32. `0` reserves nothing, which restores the previous
   * behaviour of an image cell being as narrow as its alt text.
   *
   * Fractions are kept as given: a unit is a grid step, so half a step is a
   * meaningful request. Anything that is not a finite number at or above zero
   * -- negative, infinite, NaN, not a number at all -- falls back to the
   * default WITHOUT throwing. A constructor that throws takes the whole editor
   * down over a stylistic option, and this repository normalises quietly
   * instead (see `normalizeAdditionalProtocols` in link.ts).
   *
   * The reservation is a floor on the COLUMN, not a size for the picture. How
   * large the image itself ends up is the host's CSS to decide; the library
   * only guarantees the column is wide enough for one to be worth looking at,
   * and that it stays inside the cell.
   */
  imageMinimumColumnWidth?: number;
}

const defaultImageMinimumColumnWidth = 32;

function normalizeImageMinimumColumnWidth(value: number | undefined): number {
  if (value === undefined) return defaultImageMinimumColumnWidth;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : defaultImageMinimumColumnWidth;
}

function toKitRows(table: GfmTable, activeLines: Set<number>, imageMinimumColumnWidth: number): TableKitRow[] {
  const logicalColumnCount = table.header.cells.length;
  const withAlign = (row: GfmTable["header"], bodyRow = false, active = false) => {
    // GFM's excess-cell rule is an idle rendering policy. Keep the physical
    // row intact while editing, but hand table-kit only header-participating
    // cells while idle so it owns neither an excess DOM cell nor its width.
    const participatingCells = bodyRow && !active ? row.cells.slice(0, logicalColumnCount) : row.cells;
    return {
    ...row,
    cells: [
      ...participatingCells.map((cell, columnIndex) => ({
        ...cell,
        align: table.align[columnIndex] ?? null,
        // A cell holding an image asks its column for room. The ask is dropped
        // when it is zero so the property never appears without meaning.
        ...(cell.hasImage && imageMinimumColumnWidth > 0
          ? { minimumColumnWidth: imageMinimumColumnWidth }
          : {}),
      })),
      ...(!bodyRow || row.cells.length >= logicalColumnCount || active
        ? []
        : Array.from({ length: logicalColumnCount - participatingCells.length }, (_, columnIndex) => ({
            from: row.to,
            to: row.to,
            content: { from: row.to, to: row.to },
            value: "",
            align: table.align[participatingCells.length + columnIndex] ?? null,
            virtual: true,
          }))),
    ],
    };
  };

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
    ...table.rows.map((row, index) => {
      const line = table.line + 2 + index;
      return { className: gfmTableClassNames.row, line, ...withAlign(row, true, activeLines.has(line)) };
    }),
  ];
}

function createGfmTableSpecs(document: GfmDocument, activeLines: Set<number>, imageMinimumColumnWidth: number): MboxDecorationSpec[] {
  return document.tables.flatMap((table) => createSpecsForTable(table, activeLines, imageMinimumColumnWidth));
}

/**
 * The reservation applies only when an image in a cell will actually be drawn
 * as a picture. Preview is the default, so it normally does; under an explicit
 * `renderMode: "token"` the cell shows alt text, which measures like any other
 * text, and a 32-unit column would be 32 units of nothing.
 */
function imageColumnWidthFor(state: EditorState, options: GfmTablePluginOptions): number {
  return state.facet(gfmImagePreviewEnabled) ? normalizeImageMinimumColumnWidth(options.imageMinimumColumnWidth) : 0;
}

function createGfmTableDiscardedTailRanges(document: GfmDocument, activeLines: Set<number>) {
  return document.tables.flatMap((table) => {
    const columnCount = table.header.cells.length;
    return table.rows.flatMap((row, index) => {
      const line = table.line + 2 + index;
      if (activeLines.has(line) || row.cells.length <= columnCount) return [];
      // Start at the end of the final participating cell: its following pipe
      // and every physical excess cell are one discarded source tail.
      return [{ from: row.cells[columnCount - 1].to, to: row.to }];
    });
  });
}

function createSpecsForTable(table: GfmTable, activeLines: Set<number>, imageMinimumColumnWidth: number): MboxDecorationSpec[] {
  let rows = toKitRows(table, activeLines, imageMinimumColumnWidth);
  const semantics = rows.some((row) => activeLines.has(row.line))
    ? undefined
    // Keep ARIA tied to the header's logical columns. Excess source text no
    // longer reaches here at all -- an idle row only carries its participating
    // cells -- so this count and the cells always agree.
    : { tableId: `gfm-table-${table.from}`, columnCount: table.header.cells.length };
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

// Monospace is structural here, not a style preference: the fixed `ch`-width
// column layout above is only visually correct under a monospace (or other
// uniform `ch`-grid) font, so this plugin ships it in its own theme rather than
// leaving it to a host's font choice.
export function gfmTablePlugin(options: GfmTablePluginOptions = {}): MboxPlugin {
  return {
    theme: {
      [`.${gfmTableClassNames.table}`]: {
        fontFamily:
          'var(--mbox-table-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
      [`.${gfmTableClassNames.cell}`]: {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      // Both classes: a raw cell carries the base cell class too, so a
      // single-class rule would only win by being written second.
      [`.${gfmTableClassNames.cell}.${gfmTableClassNames.rawCell}`]: {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
      // The one place this library sizes an image.
      //
      // Ordinary GFM images get no width cap from mbox at all -- that is a
      // standing decision, and a host that writes no CSS gets a 900px image at
      // 900px. Inside a fixed-grid table cell the library cannot keep that
      // promise and the promise that the table stays on screen at the same
      // time, so here, and only here, it caps the picture. Both limits are
      // written down in docs/guide.md.
      //
      // Descendant selectors, not child: the image can sit inside emphasis or
      // any other mark, so the figure is not necessarily the cell's own child.
      [`.${gfmTableClassNames.cell} .${gfmImageClassNames.preview}`]: {
        maxWidth: "100%",
      },
      // An ACTIVE row shows raw source, so its cell carries no column width and
      // the hidden measure figure would size itself to the whole row -- making
      // the row TALLER while it is being edited than it was at rest, which is
      // the opposite of what a measure figure is for. Constrain it to the width
      // the row already gives a cell. The row line carries that property
      // whether or not it is active.
      [`.${gfmTableClassNames.cell} .${gfmImageInternalClassNames.measure}`]: {
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
      },
      [`.${gfmTableClassNames.cell} .${gfmImageClassNames.element}`]: {
        maxWidth: "100%",
        // Caps height without cropping: with width and height both auto the
        // browser scales the whole picture down and the aspect ratio holds.
        // `object-fit: contain` would need a box with fixed dimensions to
        // contain within, and `figure > img` has none.
        maxHeight: "var(--mbox-gfm-table-image-max-height, 256px)",
        width: "auto",
        height: "auto",
      },
    },
    name: "gfm/table",
    decorations: (context) =>
      createGfmTableSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers, imageColumnWidthFor(context.state, options)),
    decorationFirewallRanges: (context) =>
      createGfmTableDiscardedTailRanges(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
