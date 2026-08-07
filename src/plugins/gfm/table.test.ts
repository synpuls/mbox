import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmTableClassNames, gfmTablePlugin, gfmTableRawCellClassName, gfmTableRenderedClassName } from "./table.js";
import { parseGfmDocument } from "./parser.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmTablePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

const table = "| A | B |\n|:--|--:|\n| 1 | 2 |";

describe("gfmTablePlugin", () => {
  it("adds semantics outside editing and suppresses the whole tree for an active table line", () => {
    const inactive = specsFor(table);
    expect(inactive).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "line", from: 0, attributes: expect.objectContaining({ role: "table", "aria-owns": "gfm-table-0-row-1" }) }),
      expect.objectContaining({ type: "line", from: 10, attributes: expect.objectContaining({ "aria-hidden": "true" }) }),
      expect.objectContaining({ from: 2, attributes: expect.objectContaining({ role: "columnheader" }) }),
      expect.objectContaining({ from: 22, attributes: expect.objectContaining({ role: "cell" }) }),
    ]));
    const active = specsFor(table, [1]);
    expect(active.some((spec) => "attributes" in spec && spec.attributes && "role" in spec.attributes)).toBe(false);
    expect(active.find((spec) => spec.type === "line" && spec.from === 10)).toMatchObject({
      attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
    });
  });
  it("emits a rendered line class for each of the header, delimiter and body lines", () => {
    const lineSpecs = specsFor(table).filter((spec) => spec.type === "line");
    expect(lineSpecs).toHaveLength(3);
    expect(lineSpecs[0].className).toContain("mbox-gfm-table-header");
    expect(lineSpecs[0].className).toContain("mbox-gfm-table-rendered");
    expect(lineSpecs[1].className).toContain("mbox-gfm-table-delimiter");
    expect(lineSpecs[2].className).toContain("mbox-gfm-table-row");
  });

  it("lays each cell out in a fixed ch-width column and applies the column alignment", () => {
    // Cell specs follow the mbox convention of omitting `type` (defaulting to mark).
    const cellSpecs = specsFor(table).filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ attributes?: { style: string } }>;
    // Header A (left-aligned) and B (right-aligned) plus the body row's two cells.
    expect(cellSpecs[0].attributes?.style).toContain("text-align: left");
    expect(cellSpecs[1].attributes?.style).toContain("text-align: right");
    expect(cellSpecs[0].attributes?.style).toContain("--mbox-table-kit-column-width: 1ch");
  });

  it("reserves two ch units for each full-width Japanese character", () => {
    const cellSpecs = specsFor("| 日本 | B |\n| --- | --- |\n| A | C |").filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ from: number; attributes?: { style: string } }>;
    expect(cellSpecs.find((spec) => spec.from === 2)?.attributes?.style).toContain("--mbox-table-kit-column-width: 4ch");
  });

  it("measures decorated and escaped cell text after its inline syntax is hidden", () => {
    const specs = specsFor("| **bold** | bold |\n| --- | --- |");
    const cells = specs.filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ from: number; attributes?: { style: string } }>;

    expect(cells[0].attributes?.style).toContain("--mbox-table-kit-column-width: 4ch");
    expect(cells[1].attributes?.style).toContain("--mbox-table-kit-column-width: 4ch");

    const escapedCell = specsFor("| \\| |\n| --- |").find(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as { attributes?: { style: string } };
    expect(escapedCell.attributes?.style).toContain("--mbox-table-kit-column-width: 1ch");
  });

  it("projects multi-backtick inline code from the shared content range", () => {
    const specs = specsFor("| ``a`b`` | b |\n| --- | --- |");
    const cells = specs.filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ from: number; attributes?: { style: string } }>;

    expect(cells.find((spec) => spec.from === 2)?.attributes?.style).toContain("--mbox-table-kit-column-width: 3ch");
  });

  it("measures stripped code-span padding from the projected display value", () => {
    const cells = specsFor("| ` a ` | a |\n| --- | --- |").filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ from: number; attributes?: { style: string } }>;

    expect(cells.find((spec) => spec.from === 2)?.attributes?.style).toContain("--mbox-table-kit-column-width: 1ch");
  });

  it("measures an in-cell footnote by its idle chip label, not its raw bracket syntax", () => {
    const footnoteCell = specsFor("| ref[^1] | b |\n| --- | --- |\n| x | y |\n\n[^1]: note").find(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as { attributes?: { style: string } };

    expect(footnoteCell.attributes?.style).toContain("--mbox-table-kit-column-width: 4ch");
  });

  it("hides the raw pipes on inactive lines", () => {
    const replaces = specsFor(table).filter((spec) => spec.type === "replace");
    // Leading/middle/trailing pipes across three lines are all replaced away.
    expect(replaces.length).toBeGreaterThan(0);
  });

  it.each([
    ["an omitted closing pipe", "| a | b |\n| --- | --- |\n| 1 | 2 | 3", "| 3"],
    ["an escaped pipe inside the first physical cell", "| a | b |\n| --- | --- |\n| 1\\|x | 2 | 3 |", "| 3"],
    ["a code-span pipe that is a physical separator", "| a | b |\n| --- | --- |\n| `a|b` | 2 | 3 |", "| 2"],
  ])("hides one excess tail after the second participating cell with %s", (_name, input, tailToken) => {
    const tailFrom = input.lastIndexOf(tailToken);
    const specs = specsFor(input);
    const bodyCells = specs.filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && spec.from >= input.lastIndexOf("\n") + 1,
    );

    expect(bodyCells).toHaveLength(2);
    expect(specs).toContainEqual({ type: "replace", from: tailFrom, to: input.length });
    expect(bodyCells.some((spec) => spec.from >= tailFrom)).toBe(false);
  });

  it("keeps alignment and widths on participating cells only", () => {
    const input = "| a | b |\n| :---: | --- |\n| 1 | 22 | a-very-wide-excess |";
    const cells = specsFor(input).filter(
      (spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-cell") && !spec.className.includes("delimiter"),
    ) as Array<{ from: number; attributes?: { style: string } }>;
    const bodyStart = input.lastIndexOf("\n") + 1;
    const bodyCells = cells.filter((cell) => cell.from >= bodyStart);

    expect(bodyCells).toHaveLength(2);
    expect(bodyCells[0].attributes?.style).toContain("text-align: center");
    expect(bodyCells[0].attributes?.style).toContain("--mbox-table-kit-column-width: 1ch");
    expect(bodyCells[1].attributes?.style).toContain("--mbox-table-kit-column-width: 2ch");
  });

  it("does not apply truncation when the delimiter and header column counts differ", () => {
    expect(parseGfmDocument("| a | b |\n| --- |\n| 1 | 2 | 3 |").tables).toEqual([]);
    expect(parseGfmDocument("| a |\n| --- | --- |\n| 1 | 2 | 3 |").tables).toEqual([]);
  });

  it("lowers a table followed by a lone pipe body line without table-cell decorations on that line", () => {
    const input = "| a | b |\n| --- | --- |\n| 1 | 2 |\n|";
    const lonePipeOffset = input.lastIndexOf("|");
    const specs = specsFor(input);

    expect(specs.some((spec) => spec.from >= lonePipeOffset)).toBe(false);
  });

  it("keeps a double-pipe body line as one physical empty cell plus one virtual cell", () => {
    const specs = specsFor("| a | b |\n| --- | --- |\n||");
    const bodyCellWidgets = specs.filter((spec) => spec.type === "widget" && (spec.from === 25 || spec.from === 26));

    expect(bodyCellWidgets).toHaveLength(2);
  });

  it("renders the header raw (with a raw-cell class, no pipe hiding) when its line is active", () => {
    const specs = specsFor(table, [1]);
    const headerLine = specs.find((spec) => spec.type === "line" && spec.className.includes("mbox-gfm-table-header"))! as { className: string };
    expect(headerLine.className).not.toContain("mbox-gfm-table-rendered");
    const rawCells = specs.filter((spec) => spec.type === undefined && spec.className.includes("mbox-gfm-table-raw-cell"));
    expect(rawCells.length).toBeGreaterThan(0);
  });

  it("carries a structural monospace theme, since the fixed ch-width columns need a monospace grid to align", () => {
    expect(gfmTablePlugin().theme).toMatchObject({
      ".mbox-gfm-table": { fontFamily: expect.stringContaining("monospace") },
    });
  });

  it("lets a host override the monospace font through the same shared CSS variable as every other table", () => {
    expect(gfmTablePlugin().theme).toMatchObject({
      ".mbox-gfm-table": { fontFamily: expect.stringMatching(/^var\(--mbox-table-font-family, .*monospace\)$/) },
    });
  });

  it("applies computed widths to rendered cells and releases them on active raw cells", () => {
    expect(gfmTablePlugin().theme).toMatchObject({
      ".mbox-gfm-table-cell": {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      ".mbox-gfm-table-cell.mbox-gfm-table-raw-cell": {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
    });
  });
});

describe("gfmTableClassNames", () => {
  it("includes the rendered-line and raw-cell classes alongside the row/cell classes", () => {
    expect(gfmTableClassNames).toMatchObject({
      rendered: gfmTableRenderedClassName,
      rawCell: gfmTableRawCellClassName,
    });
  });
});
