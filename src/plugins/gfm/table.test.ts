import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmTableClassNames, gfmTablePlugin, gfmTableRawCellClassName, gfmTableRenderedClassName } from "./table.js";

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

  it("hides the raw pipes on inactive lines", () => {
    const replaces = specsFor(table).filter((spec) => spec.type === "replace");
    // Leading/middle/trailing pipes across three lines are all replaced away.
    expect(replaces.length).toBeGreaterThan(0);
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
});

describe("gfmTableClassNames", () => {
  it("includes the rendered-line and raw-cell classes alongside the row/cell classes", () => {
    expect(gfmTableClassNames).toMatchObject({
      rendered: gfmTableRenderedClassName,
      rawCell: gfmTableRawCellClassName,
    });
  });
});
