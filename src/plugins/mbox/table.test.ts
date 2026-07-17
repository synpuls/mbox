import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  tableClassNames,
  tablePlugin,
  tableRawCellClassName,
  tableRenderedClassName,
} from "./table.js";

import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";

function tableSpecs(doc: string, activeLines: Iterable<number> = []) {
  const context = createTestContext(doc, { activeLines });
  const specs = tablePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("createTableSpecs", () => {
  it("adds a complete table tree only while every table line is inactive", () => {
    const inactive = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(inactive).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "line", from: 0, attributes: expect.objectContaining({ role: "table", "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "mbox-table-0-row-1" }) }),
      expect.objectContaining({ type: "line", from: 10, attributes: expect.objectContaining({ "aria-hidden": "true" }) }),
      expect.objectContaining({ type: "line", from: 24, attributes: expect.objectContaining({ role: "row", id: "mbox-table-0-row-1" }) }),
      expect.objectContaining({ from: 2, attributes: expect.objectContaining({ role: "columnheader", "aria-colindex": "1" }) }),
      expect.objectContaining({ from: 26, attributes: expect.objectContaining({ role: "cell", "aria-colindex": "1" }) }),
    ]));
    const active = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", [3]);
    expect(active.some((spec) => "attributes" in spec && spec.attributes && "role" in spec.attributes)).toBe(false);
    expect(active.find((spec) => spec.type === "line" && spec.from === 10)).toMatchObject({
      attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
    });
  });
  it("produces valid specs for a table with an empty cell (regression: used to crash a real EditorView)", () => {
    // "A||B" has no padding at all between the two pipes -- a genuinely
    // empty cell. validateDecorationSpecs would have caught the original
    // bug (an empty mark decoration) here, at the integration level, not
    // just table-kit's own unit tests.
    expect(() => tableSpecs("A||B\n---|---|---")).not.toThrow();
  });

  it("creates line and cell specs for table blocks", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |");

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "line",
          from: 0,
          className: `${tableClassNames.table} ${tableClassNames.header} mbox-table-rendered`,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%") }),
        }),
        expect.objectContaining({
          type: "line",
          from: 10,
          className: `${tableClassNames.table} ${tableClassNames.delimiter} mbox-table-rendered`,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%") }),
        }),
        expect.objectContaining({
          type: "line",
          from: 24,
          className: `${tableClassNames.table} ${tableClassNames.row} mbox-table-rendered`,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%") }),
        }),
        expect.objectContaining({ from: 2, to: 3, className: tableClassNames.cell }),
        expect.objectContaining({ from: 6, to: 7, className: tableClassNames.cell }),
        expect.objectContaining({ from: 26, to: 27, className: tableClassNames.cell }),
        expect.objectContaining({ from: 30, to: 31, className: tableClassNames.cell }),
      ]),
    );
  });

  it("adds column width attributes based on the longest cell in each column", () => {
    const specs = tableSpecs("| A | Longer |\n| --- | --- |\n| Wide | B |");

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 2,
          to: 3,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 4ch") }),
        }),
        expect.objectContaining({
          from: 6,
          to: 12,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 6ch") }),
        }),
        expect.objectContaining({
          from: 31,
          to: 35,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 4ch") }),
        }),
        expect.objectContaining({
          from: 38,
          to: 39,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 6ch") }),
        }),
      ]),
    );
  });

  it("adds column width attributes by row column index when body rows have extra cells", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | long long long | tail |");

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 26,
          to: 27,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 1ch") }),
        }),
        expect.objectContaining({
          from: 30,
          to: 44,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 14ch") }),
        }),
        expect.objectContaining({
          from: 47,
          to: 51,
          className: tableClassNames.cell,
          attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 4ch") }),
        }),
      ]),
    );
  });

  it("adds delimiter cell marks with the same column width attributes", () => {
    const specs = tableSpecs("| A | Longer |\n| --- | --- |\n| Wide | B |");

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 17,
          to: 20,
          className: `${tableClassNames.cell} mbox-table-delimiter-cell`,
          attributes: { style: "--mbox-table-kit-column-width: 4ch" },
        }),
        expect.objectContaining({
          from: 23,
          to: 26,
          className: `${tableClassNames.cell} mbox-table-delimiter-cell`,
          attributes: { style: "--mbox-table-kit-column-width: 6ch" },
        }),
      ]),
    );
  });

  it("hides pipe markers outside active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", []);

    expect(specs).toEqual(
      expect.arrayContaining([
        { type: "replace", from: 0, to: 1 },
        { type: "replace", from: 4, to: 5 },
        { type: "replace", from: 8, to: 9 },
        { type: "replace", from: 24, to: 25 },
        { type: "replace", from: 28, to: 29 },
        { type: "replace", from: 32, to: 33 },
      ]),
    );
  });

  it("hides cell edge spaces outside active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", []);

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 2, to: 3, className: tableClassNames.cell }),
        expect.objectContaining({ from: 6, to: 7, className: tableClassNames.cell }),
        expect.objectContaining({ from: 26, to: 27, className: tableClassNames.cell }),
        expect.objectContaining({ from: 30, to: 31, className: tableClassNames.cell }),
        { type: "replace", from: 1, to: 2 },
        { type: "replace", from: 3, to: 4 },
        { type: "replace", from: 5, to: 6 },
        { type: "replace", from: 7, to: 8 },
        { type: "replace", from: 25, to: 26 },
        { type: "replace", from: 27, to: 28 },
        { type: "replace", from: 29, to: 30 },
        { type: "replace", from: 31, to: 32 },
      ]),
    );
  });

  it("keeps pipe markers raw on active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", [1]);

    expect(specs).not.toEqual(
      expect.arrayContaining([
        { type: "replace", from: 0, to: 1 },
        { type: "replace", from: 4, to: 5 },
        { type: "replace", from: 8, to: 9 },
      ]),
    );
    expect(specs).toEqual(
      expect.arrayContaining([
        { type: "replace", from: 24, to: 25 },
        { type: "replace", from: 28, to: 29 },
        { type: "replace", from: 32, to: 33 },
      ]),
    );
  });

  it("does not mark active raw syntax lines as rendered table lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", [1]);

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "line",
          from: 0,
          className: `${tableClassNames.table} ${tableClassNames.header}`,
        }),
        expect.objectContaining({
          from: 1,
          to: 4,
          className: `${tableClassNames.cell} mbox-table-raw-cell`,
        }),
        expect.objectContaining({
          type: "line",
          from: 10,
          className: `${tableClassNames.table} ${tableClassNames.delimiter} mbox-table-rendered`,
        }),
      ]),
    );
  });

  it("hides delimiter row pipe markers outside active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", []);

    expect(specs).toEqual(
      expect.arrayContaining([
        { type: "replace", from: 10, to: 11 },
        { type: "replace", from: 16, to: 17 },
        { type: "replace", from: 22, to: 23 },
      ]),
    );
  });

  it("keeps delimiter row pipe markers raw on active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", [2]);

    expect(specs).not.toEqual(
      expect.arrayContaining([
        { type: "replace", from: 10, to: 11 },
        { type: "replace", from: 16, to: 17 },
        { type: "replace", from: 22, to: 23 },
      ]),
    );
  });

  it("keeps all table syntax raw on selected active raw syntax lines", () => {
    const specs = tableSpecs("| A | B |\n| --- | --- |\n| 1 | 2 |", [1, 2, 3]);

    expect(specs.filter((spec) => spec.type === "replace")).toEqual([]);
  });

  it("does not create specs for table-like text inside fenced code blocks", () => {
    const specs = tableSpecs("```\n| A | B |\n| --- | --- |\n```");

    expect(specs).toEqual([]);
  });
});

describe("tablePlugin", () => {
  it("provides table specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "| A | B |\n| --- | --- |",
      extensions: [
        createMboxExtension({
          plugins: [tablePlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("| A | B |\n| --- | --- |", { selection: 0 }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "line", from: 0 }),
        expect.objectContaining({ from: 1, to: 4, className: `${tableClassNames.cell} mbox-table-raw-cell` }),
      ]),
    );
  });

  it("carries a structural monospace theme, since the fixed ch-width columns need a monospace grid to align", () => {
    expect(tablePlugin().theme).toMatchObject({
      [`.${tableClassNames.table}`]: { fontFamily: expect.stringContaining("monospace") },
    });
  });

  it("lets a host override the monospace font through a shared CSS variable, since the grid still needs SOME monospace font", () => {
    expect(tablePlugin().theme).toMatchObject({
      [`.${tableClassNames.table}`]: {
        fontFamily: expect.stringMatching(/^var\(--mbox-table-font-family, .*monospace\)$/),
      },
    });
  });
});

describe("tableClassNames", () => {
  it("includes the rendered-line and raw-cell classes alongside the row/cell classes", () => {
    expect(tableClassNames).toMatchObject({
      rendered: tableRenderedClassName,
      rawCell: tableRawCellClassName,
    });
  });
});
