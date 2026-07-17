import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec } from "../editor/plugin.js";

/** @internal Constituent of the src-shared TableKitCell; not a package export. */
export interface TableKitRange {
  from: number;
  to: number;
}

/**
 * One cell's raw span (`from`/`to`, padding included) plus its already-trimmed
 * display range (`content`) and text (`value`, used for width measurement).
 * `align` and `className` are namespace-specific data a notation attaches per
 * cell — GFM's column alignment, and mbox/GFM's delimiter-cell / Hatena's
 * header-cell class — rather than behavior the kit special-cases. `className`
 * is ADDITIVE: appended after the kit's own `classNames.cell`, never replaces it.
 */
export interface TableKitCell {
  from: number;
  to: number;
  content: TableKitRange;
  value: string;
  align?: "left" | "right" | "center" | null;
  className?: string;
}

/**
 * One table row. `line` is the 1-based line used to look up `activeLines` —
 * mbox/GFM compute it from the table's start line plus a row offset since
 * their row types carry no line number of their own; Hatena's rows already
 * have one.
 *
 * `className` is ADDITIVE (same convention as the cell's), appended after the
 * kit's own `classNames.table` — mbox/GFM use it for their header/delimiter/row
 * classes; a namespace with no such distinction can leave it unset.
 *
 * `includeInColumnWidths` (default true) excludes a row's cells from the
 * column-width measurement — mbox/GFM's delimiter row (`---|---`) sets this to
 * false since its text isn't real column content.
 */
export interface TableKitRow {
  line: number;
  from: number;
  to: number;
  cells: TableKitCell[];
  className?: string;
  includeInColumnWidths?: boolean;
  attributes?: Record<string, string>;
}

export interface TableKitSemantics {
  tableId: string;
  headerRowIndex?: number;
  isHeaderCell?: (row: TableKitRow, rowIndex: number, columnIndex: number) => boolean;
}

export interface TableKitClassNames {
  table: string;
  renderedLine: string;
  cell: string;
  rawCell: string;
}

export interface TableKitCellOptions {
  /**
   * Column width measurement, given the already-trimmed cell text. Defaults
   * to character count; Hatena injects a CJK-aware measure instead. Whatever
   * it returns is rendered back as a `ch`-unit column width (see
   * `createCellSpec` below), so the default is only visually correct under a
   * monospace (or other uniform `ch`-grid) font -- a caller rendering table
   * text in a variable-width font must supply its own `measureWidth` that
   * matches that font's actual glyph widths.
   */
  measureWidth?: (trimmedValue: string) => number;
}

// Internal to the kit, not namespace-configurable: a CSS custom property is
// scoped to the element it's set on, so mbox/gfm/hatena tables sharing this
// name cannot collide — each table's own cells carry their own computed value.
const columnWidthProperty = "--mbox-table-kit-column-width";
const cellMaxWidthProperty = "--mbox-table-kit-cell-max-width";

// The column width is expressed in `ch` (the width of "0"), but CJK text is
// usually shown twice that width: a full-width kana/kanji is about TWICE a
// "0", so counting raw characters underestimates the width and the cell
// wraps. Count East-Asian wide (and fullwidth) code points as two units so
// the `ch` width matches.
const fullWidthPattern =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

/** CJK-aware column-width measure for {@link TableKitCellOptions.measureWidth}:
 * counts each East-Asian wide/fullwidth character as two units, everything
 * else as one. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += fullWidthPattern.test(char) ? 2 : 1;
  }
  return width;
}

function getTrimmedCellRange(cell: TableKitCell): TableKitRange {
  return cell.content.from < cell.content.to ? cell.content : cell;
}

/** One `line` decoration per row: the row's own class (if any) plus the
 * rendered-line suffix outside the active line, and a column-count CSS
 * variable for the row's overall cell-width budget. */
export function createTableLineSpecs(
  rows: readonly TableKitRow[],
  activeLines: Set<number>,
  classNames: TableKitClassNames,
  semantics?: TableKitSemantics,
): MboxDecorationSpec[] {
  const semanticRows = semantics && !rows.some((row) => activeLines.has(row.line))
    ? rows.filter((row) => row.includeInColumnWidths !== false)
    : [];
  const header = semantics ? semanticRows[semantics.headerRowIndex ?? 0] : undefined;
  const rowIds = new Map(semanticRows.map((row, index) => [row, `${semantics!.tableId}-row-${index}`]));
  const bodyIds = semanticRows.filter((row) => row !== header).map((row) => rowIds.get(row)!);
  return rows.map((row) => {
    const columnCount = Math.max(row.cells.length, 1);
    const rendered = !activeLines.has(row.line);
    const baseClassName = row.className ? `${classNames.table} ${row.className}` : classNames.table;
    const attributes: Record<string, string> = { style: `${cellMaxWidthProperty}: ${100 / columnCount}%`, ...row.attributes };
    if (row === header) {
      Object.assign(attributes, {
        id: semantics!.tableId,
        role: "table",
        "aria-rowcount": String(semanticRows.length),
        "aria-colcount": String(Math.max(...semanticRows.map((semanticRow) => semanticRow.cells.length), 1)),
        ...(bodyIds.length > 0 ? { "aria-owns": bodyIds.join(" ") } : {}),
      });
    } else if (rowIds.has(row)) {
      Object.assign(attributes, { id: rowIds.get(row)!, role: "row" });
    }
    // Chromium applies table display types to ARIA table/row roles. Keep the
    // existing line-as-flex presentation stable without asking host styles to
    // override those UA rules.
    if (row === header || rowIds.has(row)) {
      attributes.style += "; display: flex !important";
    }
    return {
      type: "line",
      from: row.from,
      to: row.from,
      className: rendered ? `${baseClassName} ${classNames.renderedLine}` : baseClassName,
      attributes,
    };
  });
}

function getColumnWidths(rows: readonly TableKitRow[], measureWidth: (value: string) => number): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    if (row.includeInColumnWidths === false) {
      continue;
    }
    row.cells.forEach((cell, columnIndex) => {
      widths[columnIndex] = Math.max(widths[columnIndex] ?? 0, measureWidth(cell.value.trim()));
    });
  }
  return widths;
}

// A cell between two adjacent pipes (`||`) has no padding at all, so its own
// span is zero-width, not just its trimmed content. CodeMirror's mark
// decoration throws "Mark decorations may not be empty" for a from===to
// range -- fatal to the whole EditorView, not just that cell -- so a
// genuinely empty cell renders as this point widget instead, which carries
// the same class/style a mark would have.
class TableKitEmptyCellWidget extends WidgetType {
  constructor(
    private readonly className: string,
    private readonly style?: string,
    private readonly attributes?: Record<string, string>,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableKitEmptyCellWidget && this.className === other.className && this.style === other.style
      && JSON.stringify(this.attributes) === JSON.stringify(other.attributes)
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    if (this.style !== undefined) {
      span.setAttribute("style", this.style);
    }
    for (const [name, value] of Object.entries(this.attributes ?? {})) {
      span.setAttribute(name, value);
    }
    return span;
  }
}

function createCellSpec(
  cell: TableKitCell,
  columnWidth: number,
  classNames: TableKitClassNames,
  raw: boolean,
  semanticAttributes?: Record<string, string>,
): MboxDecorationSpec {
  const baseClassName = cell.className ? `${classNames.cell} ${cell.className}` : classNames.cell;

  if (raw) {
    const className = `${baseClassName} ${classNames.rawCell}`;
    if (cell.from === cell.to) {
      return { type: "widget", from: cell.from, to: cell.from, widget: new TableKitEmptyCellWidget(className) };
    }
    return { from: cell.from, to: cell.to, className };
  }

  const range = getTrimmedCellRange(cell);
  const alignStyle = cell.align ? `; text-align: ${cell.align}` : "";
  const style = `${columnWidthProperty}: ${columnWidth}ch${alignStyle}`;
  const renderedStyle = semanticAttributes ? `${style}; display: inline-block !important` : style;
  if (range.from === range.to) {
    return { type: "widget", from: range.from, to: range.from, widget: new TableKitEmptyCellWidget(baseClassName, renderedStyle, semanticAttributes) };
  }
  return {
    from: range.from,
    to: range.to,
    className: baseClassName,
    attributes: {
      style: renderedStyle,
      ...semanticAttributes,
    },
  };
}

/** One cell spec per cell: trimmed content laid out in a fixed `ch`-width
 * column, or the cell's raw span on its own active line. */
export function createTableCellSpecs(
  rows: readonly TableKitRow[],
  activeLines: Set<number>,
  classNames: TableKitClassNames,
  options: TableKitCellOptions = {},
  semantics?: TableKitSemantics,
): MboxDecorationSpec[] {
  const measureWidth = options.measureWidth ?? ((value: string) => value.length);
  const columnWidths = getColumnWidths(rows, measureWidth);

  const semanticRows = semantics && !rows.some((row) => activeLines.has(row.line))
    ? rows.filter((row) => row.includeInColumnWidths !== false)
    : [];
  const header = semantics ? semanticRows[semantics.headerRowIndex ?? 0] : undefined;
  const semanticSet = new Set(semanticRows);

  return rows.flatMap((row, rowIndex) => {
    const raw = activeLines.has(row.line);
    return row.cells.map((cell, columnIndex) => createCellSpec(
      cell,
      columnWidths[columnIndex] ?? 0,
      classNames,
      raw,
      semanticSet.has(row)
        ? {
            role: (semantics!.isHeaderCell?.(row, rowIndex, columnIndex) ?? row === header) ? "columnheader" : "cell",
            "aria-colindex": String(columnIndex + 1),
          }
        : undefined,
    ));
  });
}

export function createTableHeaderRowSpecs(
  rows: readonly TableKitRow[],
  activeLines: Set<number>,
  semantics?: TableKitSemantics,
): MboxDecorationSpec[] {
  if (!semantics || rows.some((row) => activeLines.has(row.line))) return [];
  const semanticRows = rows.filter((row) => row.includeInColumnWidths !== false);
  const headerIndex = semantics.headerRowIndex ?? 0;
  const header = semanticRows[headerIndex];
  if (!header || header.from === header.to) return [];
  return [{
    from: header.from,
    to: header.to,
    className: "",
    attributes: { id: `${semantics.tableId}-row-${headerIndex}`, role: "row", style: "display: contents !important" },
  }];
}

/** Hides the padding around each cell's trimmed content outside the active
 * line — the pipes themselves are `createTablePipeHideSpecs`'s job. */
export function createTableWhitespaceHideSpecs(rows: readonly TableKitRow[], activeLines: Set<number>): MboxDecorationSpec[] {
  return rows.flatMap((row) => {
    if (activeLines.has(row.line)) {
      return [];
    }
    return row.cells.flatMap((cell) => {
      const range = getTrimmedCellRange(cell);
      if (range.from === cell.from && range.to === cell.to) {
        return [];
      }
      return [
        { type: "replace" as const, from: cell.from, to: range.from },
        { type: "replace" as const, from: range.to, to: cell.to },
      ].filter((spec) => spec.from < spec.to);
    });
  });
}

/** Hides the leading, inter-cell, and trailing pipe (and any padding
 * touching it) outside the active line. */
export function createTablePipeHideSpecs(rows: readonly TableKitRow[], activeLines: Set<number>): MboxDecorationSpec[] {
  return rows.flatMap((row) => {
    if (activeLines.has(row.line) || row.cells.length === 0) {
      return [];
    }
    const ranges = [
      { from: row.from, to: row.cells[0].from },
      ...row.cells.slice(1).map((cell, index) => ({ from: row.cells[index].to, to: cell.from })),
      { from: row.cells[row.cells.length - 1].to, to: row.to },
    ];
    return ranges.filter((range) => range.from < range.to).map((range) => ({ ...range, type: "replace" as const }));
  });
}
