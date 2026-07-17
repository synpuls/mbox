import { describe, expect, it } from "vitest";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  createTableWhitespaceHideSpecs,
  displayWidth,
} from "./table-kit.js";
import type { TableKitClassNames, TableKitRow } from "./table-kit.js";
import type { MboxDecorationSpec } from "../editor/plugin.js";

// mark/line specs carry className/attributes that MboxDecorationSpec's union
// hides from replace specs; every access below is on a known non-replace spec.
function styled(spec: MboxDecorationSpec): { className: string; attributes?: { style: string } } {
  return spec as unknown as { className: string; attributes?: { style: string } };
}

const classNames: TableKitClassNames = {
  table: "test-table",
  renderedLine: "test-rendered",
  cell: "test-cell",
  rawCell: "test-raw-cell",
};

// "| A | Bb |" -> pipes at 0, 4, 11; cells: A at [2,3), Bb at [6,10)
function headerRow(): TableKitRow {
  return {
    className: "test-header",
    line: 1,
    from: 0,
    to: 12,
    cells: [
      { from: 1, to: 4, content: { from: 2, to: 3 }, value: " A " },
      { from: 4, to: 11, content: { from: 6, to: 10 }, value: " Bb " },
    ],
  };
}

function delimiterRow(): TableKitRow {
  return {
    className: "test-delimiter",
    includeInColumnWidths: false,
    line: 2,
    from: 13,
    to: 25,
    cells: [
      { from: 14, to: 17, content: { from: 14, to: 17 }, value: "---", className: "test-delimiter-cell" },
      { from: 17, to: 24, content: { from: 17, to: 24 }, value: "------", className: "test-delimiter-cell" },
    ],
  };
}

function bodyRow(): TableKitRow {
  return {
    className: "test-row",
    line: 3,
    from: 26,
    to: 33,
    cells: [
      { from: 27, to: 29, content: { from: 27, to: 28 }, value: "1" },
      { from: 29, to: 32, content: { from: 29, to: 32 }, value: "ab" },
    ],
  };
}

describe("createTableLineSpecs", () => {
  it("merges table and body-row semantics into existing line attributes", () => {
    const semantics = { tableId: "test-table-0" };
    const specs = createTableLineSpecs([headerRow(), bodyRow()], new Set(), classNames, semantics);
    expect(styled(specs[0]).attributes).toEqual(expect.objectContaining({
      style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%"), role: "table", id: "test-table-0",
      "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "test-table-0-row-1",
    }));
    expect(styled(specs[1]).attributes).toEqual(expect.objectContaining({ role: "row", id: "test-table-0-row-1" }));
    expect(createTableHeaderRowSpecs([headerRow(), bodyRow()], new Set(), semantics)).toEqual([
      expect.objectContaining({ attributes: expect.objectContaining({ role: "row", id: "test-table-0-row-0" }) }),
    ]);
  });
  it("appends each row's own class and the rendered suffix outside active lines", () => {
    const specs = createTableLineSpecs([headerRow(), delimiterRow(), bodyRow()], new Set(), classNames);
    expect(specs).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: "test-table test-header test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
      {
        type: "line",
        from: 13,
        to: 13,
        className: "test-table test-delimiter test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
      {
        type: "line",
        from: 26,
        to: 26,
        className: "test-table test-row test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
    ]);
  });

  it("drops the rendered suffix for a row on an active line", () => {
    const specs = createTableLineSpecs([headerRow()], new Set([1]), classNames);
    expect(styled(specs[0]).className).toBe("test-table test-header");
  });

  it("uses the bare table class when a row has no className", () => {
    const row: TableKitRow = { line: 1, from: 0, to: 5, cells: [] };
    const specs = createTableLineSpecs([row], new Set([1]), classNames);
    expect(styled(specs[0]).className).toBe("test-table");
  });
});

describe("createTableCellSpecs", () => {
  it("adds cell roles and column indexes only when the entire table is inactive", () => {
    const semantics = { tableId: "test-table-0" };
    const rendered = createTableCellSpecs([headerRow(), bodyRow()], new Set(), classNames, {}, semantics);
    expect(styled(rendered[0]).attributes).toEqual(expect.objectContaining({ role: "columnheader", "aria-colindex": "1" }));
    expect(styled(rendered[2]).attributes).toEqual(expect.objectContaining({ role: "cell", "aria-colindex": "1" }));
    expect(createTableCellSpecs([headerRow(), bodyRow()], new Set([3]), classNames, {}, semantics)).toEqual(
      createTableCellSpecs([headerRow(), bodyRow()], new Set([3]), classNames),
    );
  });
  it("lays out trimmed cell text with a column-width custom property computed from the widest cell", () => {
    const specs = createTableCellSpecs([headerRow(), bodyRow()], new Set(), classNames);
    expect(specs).toEqual([
      { from: 2, to: 3, className: "test-cell", attributes: { style: "--mbox-table-kit-column-width: 1ch" } },
      { from: 6, to: 10, className: "test-cell", attributes: { style: "--mbox-table-kit-column-width: 2ch" } },
      { from: 27, to: 28, className: "test-cell", attributes: { style: "--mbox-table-kit-column-width: 1ch" } },
      { from: 29, to: 32, className: "test-cell", attributes: { style: "--mbox-table-kit-column-width: 2ch" } },
    ]);
  });

  it("excludes a row with includeInColumnWidths: false from column-width measurement", () => {
    const wideDelimiter: TableKitRow = {
      includeInColumnWidths: false,
      line: 2,
      from: 13,
      to: 30,
      cells: [{ from: 14, to: 28, content: { from: 14, to: 28 }, value: "--------------" }],
    };
    const specs = createTableCellSpecs([headerRow(), wideDelimiter], new Set(), classNames);
    // The header's own single-char cell width (1ch), not the delimiter's 14 chars.
    expect(styled(specs[0]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
  });

  it("renders a raw (unstyled) cell on the cell's own active line, with no width attribute", () => {
    const specs = createTableCellSpecs([headerRow()], new Set([1]), classNames);
    expect(specs).toEqual([
      { from: 1, to: 4, className: "test-cell test-raw-cell" },
      { from: 4, to: 11, className: "test-cell test-raw-cell" },
    ]);
  });

  it("appends a per-cell class name in both raw and rendered modes", () => {
    const rendered = createTableCellSpecs([delimiterRow()], new Set(), classNames);
    expect(styled(rendered[0]).className).toBe("test-cell test-delimiter-cell");
    const raw = createTableCellSpecs([delimiterRow()], new Set([2]), classNames);
    expect(styled(raw[0]).className).toBe("test-cell test-delimiter-cell test-raw-cell");
  });

  it("appends a text-align style only when the cell has an alignment and only when rendered", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 10,
      cells: [{ from: 1, to: 5, content: { from: 1, to: 4 }, value: "abc", align: "right" }],
    };
    expect(styled(createTableCellSpecs([row], new Set(), classNames)[0]).attributes).toEqual({
      style: "--mbox-table-kit-column-width: 3ch; text-align: right",
    });
    expect(createTableCellSpecs([row], new Set([1]), classNames)[0]).toEqual({
      from: 1,
      to: 5,
      className: "test-cell test-raw-cell",
    });
  });

  it("uses an injected measureWidth function instead of raw character count", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 10,
      cells: [{ from: 1, to: 5, content: { from: 1, to: 4 }, value: "a" }],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames, { measureWidth: () => 9 });
    expect(styled(specs[0]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 9ch" });
  });

  // A cell between two adjacent pipes (`||`) has no padding at all, so its own
  // span -- not just its trimmed content -- is zero-width. A CodeMirror mark
  // decoration throws "Mark decorations may not be empty" for a from===to
  // range, which crashes the whole EditorView; a widget has no such
  // restriction, so a genuinely empty cell must use one instead.
  it("renders a genuinely empty cell (no padding, zero-width span) as a widget, not an empty mark", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 5,
      cells: [
        { from: 1, to: 1, content: { from: 1, to: 1 }, value: "" },
        { from: 1, to: 4, content: { from: 2, to: 3 }, value: " x " },
      ],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames);
    expect(specs[0]).toMatchObject({ type: "widget", from: 1, to: 1 });
    expect((specs[0] as { type: "widget"; from: number; to: number }).from).toBe(
      (specs[0] as { type: "widget"; from: number; to: number }).to,
    );
  });

  it("renders a genuinely empty cell as a widget on its own active (raw) line too", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 5,
      cells: [{ from: 1, to: 1, content: { from: 1, to: 1 }, value: "" }],
    };
    const specs = createTableCellSpecs([row], new Set([1]), classNames);
    expect(specs[0]).toMatchObject({ type: "widget", from: 1, to: 1 });
  });
});

describe("createTableWhitespaceHideSpecs", () => {
  it("hides the padding on both sides of the trimmed content outside the active line", () => {
    expect(createTableWhitespaceHideSpecs([headerRow()], new Set())).toEqual([
      { type: "replace", from: 1, to: 2 },
      { type: "replace", from: 3, to: 4 },
      { type: "replace", from: 4, to: 6 },
      { type: "replace", from: 10, to: 11 },
    ]);
  });

  it("creates no specs for a cell with no padding around its content", () => {
    expect(createTableWhitespaceHideSpecs([bodyRow()], new Set())).toEqual([
      { type: "replace", from: 28, to: 29 },
    ]);
  });

  it("creates no specs on the row's active line", () => {
    expect(createTableWhitespaceHideSpecs([headerRow()], new Set([1]))).toEqual([]);
  });
});

describe("createTablePipeHideSpecs", () => {
  it("hides the leading, inter-cell, and trailing pipe/padding runs outside the active line", () => {
    // headerRow cells touch at from:4/to:4 (an adjoining pipe with no padding
    // between the two cells), so that degenerate inter-cell range is dropped.
    expect(createTablePipeHideSpecs([headerRow()], new Set())).toEqual([
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 11, to: 12 },
    ]);
  });

  it("creates no specs on the row's active line", () => {
    expect(createTablePipeHideSpecs([headerRow()], new Set([1]))).toEqual([]);
  });

  it("creates no specs for a row with no cells", () => {
    const empty: TableKitRow = { line: 9, from: 0, to: 3, cells: [] };
    expect(createTablePipeHideSpecs([empty], new Set())).toEqual([]);
  });
});

describe("displayWidth", () => {
  it("counts an ASCII string by its character length", () => {
    expect(displayWidth("abc")).toBe(3);
  });

  it("counts each full-width (CJK) character as two units", () => {
    expect(displayWidth("日本語")).toBe(6);
  });

  it("mixes ASCII and full-width counting within one string", () => {
    expect(displayWidth("a日本b")).toBe(6);
  });

  it("returns 0 for an empty string", () => {
    expect(displayWidth("")).toBe(0);
  });
});
