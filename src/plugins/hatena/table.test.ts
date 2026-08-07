import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { hatenaTableClassNames, hatenaTablePlugin, hatenaTableRawCellClassName, hatenaTableRenderedClassName } from "./table.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = hatenaTablePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

const table = "|*名前|*色|\n|りんご|赤|";

describe("hatenaTablePlugin", () => {
  it("maps Hatena header cells to column headers and suppresses semantics while editing", () => {
    const inactive = specsFor(table);
    expect(inactive).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "line", from: 0, attributes: expect.objectContaining({ role: "table" }) }),
      expect.objectContaining({ from: 2, attributes: expect.objectContaining({ role: "columnheader" }) }),
      expect.objectContaining({ from: 10, attributes: expect.objectContaining({ role: "cell" }) }),
    ]));
    expect(specsFor(table, [2]).some((spec) => "attributes" in spec && spec.attributes && "role" in spec.attributes)).toBe(false);
  });
  it("emits a rendered line class for each row", () => {
    const lineSpecs = specsFor(table).filter((spec) => spec.type === "line");
    expect(lineSpecs).toHaveLength(2);
    expect(lineSpecs[0].className).toContain("mbox-hatena-table-row");
    expect(lineSpecs[0].className).toContain("mbox-hatena-table-rendered");
    expect(lineSpecs[1].className).toContain("mbox-hatena-table-rendered");
  });

  it("lays each cell out in a fixed ch-width column and styles header cells", () => {
    const cellSpecs = specsFor(table).filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-hatena-table-cell"),
    ) as Array<{ className: string; attributes?: { style: string } }>;
    // Two header cells (row 1) + two body cells (row 2).
    expect(cellSpecs).toHaveLength(4);
    expect(cellSpecs[0].className).toContain("mbox-hatena-table-header-cell");
    expect(cellSpecs[0].attributes?.style).toContain("--mbox-table-kit-column-width:");
    // Body cells are not header cells.
    expect(cellSpecs[2].className).not.toContain("mbox-hatena-table-header-cell");
  });

  it("counts full-width (CJK) characters as two column units so cells do not wrap", () => {
    // `ch` is the width of "0"; a full-width kana/kanji is about two of those.
    // Column 0 holds `名前` (2 wide = 4 units) and `りんご` (3 wide = 6 units),
    // so its width must be 6ch, not the naive 3 (character count).
    const cellSpecs = specsFor(table).filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-hatena-table-cell"),
    ) as Array<{ attributes?: { style: string } }>;
    expect(cellSpecs[0].attributes?.style).toContain("--mbox-table-kit-column-width: 6ch");
  });

  it("hides the raw pipes and the header `*` markers on inactive lines", () => {
    const replaces = specsFor(table).filter((spec) => spec.type === "replace");
    // Leading/middle/trailing pipes plus the two `*` header markers are replaced.
    expect(replaces.length).toBeGreaterThan(0);
    // The two `*` markers sit at offsets 1 and 5 (`|*名前|*色|`): each is hidden.
    expect(replaces.some((spec) => spec.from === 1 && spec.to === 2)).toBe(true);
  });

  it("renders a line raw (raw-cell class, no pipe hiding) when it is active", () => {
    const specs = specsFor(table, [1]);
    const headerLine = specs.find(
      (spec) => spec.type === "line" && spec.className.includes("mbox-hatena-table-row"),
    )! as { className: string };
    expect(headerLine.className).not.toContain("mbox-hatena-table-rendered");
    const rawCells = specs.filter((spec) => spec.type === undefined && spec.className.includes("mbox-hatena-table-raw-cell"));
    expect(rawCells.length).toBeGreaterThan(0);
    // No replace specs touch the active line 1 (offsets 0..7); its raw text
    // (pipes and `*` markers) stays revealed for editing.
    const activeReplaces = specs.filter((spec) => spec.type === "replace" && spec.from < 8);
    expect(activeReplaces).toHaveLength(0);
  });

  it("carries a structural monospace theme, since the CJK-aware ch-width columns need a monospace grid to align", () => {
    expect(hatenaTablePlugin().theme).toMatchObject({
      ".mbox-hatena-table": { fontFamily: expect.stringContaining("monospace") },
    });
  });

  it("lets a host override the monospace font through the same shared CSS variable as every other table", () => {
    expect(hatenaTablePlugin().theme).toMatchObject({
      ".mbox-hatena-table": { fontFamily: expect.stringMatching(/^var\(--mbox-table-font-family, .*monospace\)$/) },
    });
  });

  it("applies computed widths to rendered cells and releases them on active raw cells", () => {
    expect(hatenaTablePlugin().theme).toMatchObject({
      ".mbox-hatena-table-cell": {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      ".mbox-hatena-table-cell.mbox-hatena-table-raw-cell": {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
    });
  });
});

describe("hatenaTableClassNames", () => {
  it("includes the rendered-line and raw-cell classes alongside the row/cell classes", () => {
    expect(hatenaTableClassNames).toMatchObject({
      rendered: hatenaTableRenderedClassName,
      rawCell: hatenaTableRawCellClassName,
    });
  });
});
