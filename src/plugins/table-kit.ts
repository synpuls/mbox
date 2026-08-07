import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec } from "../editor/plugin.js";

/**
 * Shared table lowering mechanics. This module does not identify or select a
 * notation: each caller supplies parsed cell geometry, projected display text,
 * and ARIA policy. `displayValue` affects width only; `virtual` supplies an
 * idle-only placeholder; `excludeFromSemantics` suppresses that cell's ARIA
 * attributes for callers that still need it; and `columnCount` describes the caller's logical grid. These
 * policies may coexist across a table without the kit inferring one from
 * another.
 */

/** @internal Constituent of the src-shared TableKitCell; not a package export. */
export interface TableKitRange {
  from: number;
  to: number;
}

/**
 * One cell's raw span (`from`/`to`, padding included) plus its already-trimmed
 * display range (`content`) and its trimmed source text (`value`, used for
 * width measurement when no display projection is supplied). `displayValue` is an
 * optional exact projection of the `content` range that will be displayed, for
 * example after inline markers are hidden. It must not include table padding at
 * either cell boundary. Unlike `value`, which is trimmed before measuring,
 * `displayValue` is deliberately not trimmed: inline code and similar content
 * may intentionally retain leading or trailing spaces. For a cell whose
 * inline syntax is hidden, do not mechanically copy `value` into
 * `displayValue`; a cell without such decoration may correctly use either.
 * `align` and `className` are namespace-specific data a notation attaches per
 * cell — GFM's column alignment, mbox/GFM's delimiter-cell / Hatena's
 * header-cell class — rather than behavior the kit special-cases. `className`
 * is ADDITIVE: appended after the kit's own `classNames.cell`, never replaces it.
 */
export interface TableKitCell {
  from: number;
  to: number;
  content: TableKitRange;
  value: string;
  displayValue?: string;
  align?: "left" | "right" | "center" | null;
  className?: string;
  /**
   * A floor this cell puts under its column, in the SAME UNITS `measureWidth`
   * returns -- grid units, not characters. With the default measurement one
   * unit happens to be one narrow character, but a caller that injects its own
   * `measureWidth` sets the unit, and this number has to be read in that unit
   * or it means nothing.
   *
   * It is a separate channel on purpose. A cell can want a width that no text
   * of its would produce -- an image has no character width at all -- and the
   * alternative, padding `displayValue` out with invented characters, breaks
   * the rule other work relies on: `displayValue` is the text actually shown.
   *
   * It only ever raises. The column still fits its widest content, so a cell
   * with a long string is never squeezed to make room for this.
   */
  minimumColumnWidth?: number;
  /**
   * An idle-layout-only cell anchored at a document position. It never creates
   * source text and disappears completely while its row is active.
   */
  virtual?: boolean;
/** Excludes a visible caller-provided cell from the logical ARIA grid. */
  excludeFromSemantics?: boolean;
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
  /** The notation's logical column count, when it differs from a wide source row. */
  columnCount?: number;
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
   * Column width measurement, given the projected display text. The supplied
   * string may include leading or trailing whitespace; `displayValue` is
   * intentionally not trimmed. Defaults to character count; Hatena injects a
   * CJK-aware measure instead. Whatever
   * it returns is rendered back as a `ch`-unit column width (see
   * `createCellSpec` below), so the default is only visually correct under a
   * monospace (or other uniform `ch`-grid) font -- a caller rendering table
   * text in a variable-width font must supply its own `measureWidth` that
   * matches that font's actual glyph widths.
   */
  measureWidth?: (displayedValue: string) => number;
}

// Internal to the kit, not namespace-configurable: a CSS custom property is
// scoped to the element it's set on, so tables sharing this name cannot
// collide — each table's own cells carry their own computed value.
const columnWidthProperty = "--mbox-table-kit-column-width";
const cellMaxWidthProperty = "--mbox-table-kit-cell-max-width";

// The column width is expressed in `ch` (the width of "0"), but CJK text is
// usually shown twice that width: a full-width kana/kanji is about TWICE a
// "0", so counting raw characters underestimates the width and the cell
// wraps. This is a practical approximation aimed at CJK and emoji table
// content, not a complete implementation of Unicode East Asian Width (UAX
// #11). Keep its boundaries as escapes: literal compatibility ideographs may
// be NFC-normalized by editors.
//
// Consequences kept intentionally explicit: every code point in a listed range
// (including unassigned and assigned N/A ones) counts as two; emoji outside U+1F300–U+1FAFF
// (such as U+231A, U+2600 symbols, U+1F004, and U+1F170 characters) remain
// one; and Tangut, Nüshu, and hentaigana are omitted rather than growing this
// range table. Hangul Jamo Extended-A is included because it is compact and
// CJK-relevant; Hangul Jamo Extended-B is East Asian Width N, so is
// intentionally excluded. Other non-BMP characters (for example Deseret and
// mathematical alphanumerics) and the private-use area (East Asian Width A,
// treated as one here) remain one unit unless a caller supplies a font-specific
// measureWidth implementation.
const fullWidthPattern = new RegExp(
  "[" +
    [
      "\\u1100-\\u115F", // Hangul Jamo
      "\\u2E80-\\u303E", // CJK Radicals Supplement through CJK Symbols and Punctuation
      "\\u3041-\\u33FF", // Hiragana, Katakana, Bopomofo, and CJK Compatibility
      "\\u3400-\\u4DBF", // CJK Unified Ideographs Extension A
      "\\u4E00-\\u9FFF", // CJK Unified Ideographs
      "\\uA000-\\uA4CF", // Yi Syllables and Yi Radicals
      "\\uA960-\\uA97C", // Hangul Jamo Extended-A
      "\\uAC00-\\uD7A3", // Hangul Syllables
      "\\uF900-\\uFAFF", // CJK Compatibility Ideographs
      "\\uFE30-\\uFE4F", // CJK Compatibility Forms
      "\\uFF01-\\uFF60", // Fullwidth ASCII variants and halfwidth punctuation
      "\\uFFE0-\\uFFE6", // Fullwidth symbol variants
      "\\u{20000}-\\u{2FFFD}", // CJK Unified Ideographs Extensions B–F
      "\\u{30000}-\\u{3FFFD}", // CJK Unified Ideographs Extensions G and later
      "\\u{1F300}-\\u{1FAFF}", // emoji pictographs and symbols
    ].join("") +
    "]",
  "u",
);

/**
 * Practical CJK/emoji column-width approximation for
 * {@link TableKitCellOptions.measureWidth}; it counts selected wide/fullwidth
 * ranges as two units and everything else as one, rather than fully
 * implementing East Asian Width.
 *
 * Known limitations: this counts code points, not grapheme clusters, so emoji
 * sequences such as `👍🏽` (4) and `👩‍💻` (5) do not measure as their single
 * two-column glyph. Combining marks also count independently, so decomposed
 * `e + U+0301` measures as 2 although it displays as one column. Correcting
 * either requires grapheme-cluster segmentation and is outside this helper's
 * scope. Callers that need it can inject their own implementation through
 * {@link TableKitCellOptions.measureWidth}.
 */
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
        "aria-colcount": String(semantics!.columnCount ?? Math.max(...semanticRows.map((semanticRow) => semanticRow.cells.length), 1)),
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
      className: rendered ? `${baseClassName} ${classNames.renderedLine}` : baseClassName,
      attributes,
    };
  });
}

function getColumnWidths(rows: readonly TableKitRow[], measureWidth: (displayedValue: string) => number): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    if (row.includeInColumnWidths === false) {
      continue;
    }
    row.cells.forEach((cell, columnIndex) => {
      // Notation parsers provide a trimmed source value. Keep this fallback
      // trim for legacy/custom rows, but a displayValue is the exact projected
      // display text and must retain intentional projected whitespace.
      const displayed = cell.displayValue ?? cell.value.trim();
      // The minimum joins the same max as one more candidate, so it raises a
      // narrow column and is ignored by a wider one. A row excluded from the
      // measurement contributes neither, minimum included: the exclusion is
      // about the row not being real column content, which its cells' demands
      // are part of.
      widths[columnIndex] = Math.max(widths[columnIndex] ?? 0, measureWidth(displayed), cell.minimumColumnWidth ?? 0);
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
  semanticRow: boolean,
  virtualSide: number,
  semanticAttributes?: Record<string, string>,
): MboxDecorationSpec {
  const baseClassName = cell.className ? `${classNames.cell} ${cell.className}` : classNames.cell;
  const style = createRenderedCellStyle(cell, columnWidth, !raw && semanticRow);

  // A virtual cell is presentation only: an active row must reveal exactly
  // its source, with no synthetic empty-cell marker left behind. Its distinct
  // side fixes the DOM order of same-position virtual cells to column order.
  if (cell.virtual) {
    return { type: "widget", from: cell.from, side: virtualSide, widget: new TableKitEmptyCellWidget(baseClassName, style, semanticAttributes) };
  }

  if (raw) {
    const className = `${baseClassName} ${classNames.rawCell}`;
    if (cell.from === cell.to) {
      return { type: "widget", from: cell.from, widget: new TableKitEmptyCellWidget(className) };
    }
    return { from: cell.from, to: cell.to, className };
  }

  const range = getTrimmedCellRange(cell);
  if (range.from === range.to) {
    return { type: "widget", from: range.from, widget: new TableKitEmptyCellWidget(baseClassName, style, semanticAttributes) };
  }
  return {
    from: range.from,
    to: range.to,
    className: baseClassName,
    // A whole-run inline widget (such as a GFM link or image) can occupy this
    // exact range. Claim both shared boundaries so CodeMirror nests that
    // widget in the cell mark instead of rendering it as the mark's sibling
    // and dropping the cell element altogether. This is the same lowering
    // contract as createContentMarkSpec: table-kit remains agnostic about
    // which notation supplied the widget.
    inclusiveStart: true,
    inclusiveEnd: true,
    attributes: {
      style,
      ...semanticAttributes,
    },
  };
}

/**
 * A caller may exclude a source cell from ARIA, but a semantic row still needs
 * its cell layout while its row uses `display: contents`. Delimiter rows are
 * not semantic rows, so do not force host CSS to give their cells display boxes.
 */
function createRenderedCellStyle(cell: TableKitCell, columnWidth: number, semanticCell: boolean): string {
  const alignStyle = cell.align ? `; text-align: ${cell.align}` : "";
  return `${columnWidthProperty}: ${columnWidth}ch${alignStyle}${semanticCell ? "; display: inline-block !important;" : ""}`;
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
    // A semantic row is distinct from a row that contributes to width
    // measurement. In particular, semantics are deliberately disabled for the
    // whole table while any row is active.
    const isSemanticRow = semanticSet.has(row);
    return row.cells.flatMap((cell, columnIndex) => {
      if (raw && cell.virtual) return [];
      return [createCellSpec(
        cell,
        columnWidths[columnIndex] ?? 0,
        classNames,
        raw,
        isSemanticRow,
        columnIndex + 1,
        isSemanticRow && !cell.excludeFromSemantics
          ? {
              role: (semantics!.isHeaderCell?.(row, rowIndex, columnIndex) ?? row === header) ? "columnheader" : "cell",
              "aria-colindex": String(columnIndex + 1),
            }
          : undefined,
      )];
    });
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
  if (!header) return [];
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
    return row.cells.filter((cell) => !cell.virtual).flatMap((cell) => {
      const range = getTrimmedCellRange(cell);
      return [
        { type: "replace" as const, from: cell.from, to: range.from },
        { type: "replace" as const, from: range.to, to: cell.to },
      ];
    });
  });
}

/** Hides the leading, inter-cell, and trailing pipe (and any padding
 * touching it) outside the active line. */
export function createTablePipeHideSpecs(rows: readonly TableKitRow[], activeLines: Set<number>): MboxDecorationSpec[] {
  return rows.flatMap((row) => {
    const physicalCells = row.cells.filter((cell) => !cell.virtual);
    if (activeLines.has(row.line) || physicalCells.length === 0) {
      return [];
    }
    const ranges = [
      { from: row.from, to: physicalCells[0].from },
      ...physicalCells.slice(1).map((cell, index) => ({ from: physicalCells[index].to, to: cell.from })),
      { from: physicalCells[physicalCells.length - 1].to, to: row.to },
    ];
    return ranges.map((range) => ({ ...range, type: "replace" as const }));
  });
}
