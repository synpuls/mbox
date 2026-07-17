import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  scrapboxTableCellClassName,
  scrapboxTableClassName,
  scrapboxTableClassNames,
  scrapboxTableHeaderClassName,
  scrapboxTableKeywordClassName,
  scrapboxTableNameClassName,
  scrapboxTableOpenerClassName,
  scrapboxTablePlugin,
  scrapboxTableRawCellClassName,
  scrapboxTableRenderedClassName,
  scrapboxTableRowClassName,
} from "./table.js";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";

function tableSpecs(doc: string, activeLines: Iterable<number> = []) {
  const context = createTestContext(doc, { activeLines });
  const specs = scrapboxTablePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("createScrapboxTableSpecs", () => {
  it("uses the first body row, not the opener, as the table header", () => {
    const inactive = tableSpecs("table:t\n a\tb\n c\td");
    expect(inactive).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "line", from: 8, attributes: expect.objectContaining({ role: "table", "aria-owns": "scrapbox-table-0-row-1" }) }),
      expect.objectContaining({ from: 9, attributes: expect.objectContaining({ role: "columnheader" }) }),
      expect.objectContaining({ from: 14, attributes: expect.objectContaining({ role: "cell" }) }),
    ]));
    expect(tableSpecs("table:t\n a\tb\n c\td", [2]).some((spec) => "attributes" in spec && spec.attributes && "role" in spec.attributes)).toBe(false);
  });
  it("decorates the opener, its keyword and name", () => {
    // "table:t" (0-7) \n " a\tb" (8-12) \n " c\td" (13-17)
    expect(tableSpecs("table:t\n a\tb\n c\td")).toEqual(
      expect.arrayContaining([
        { type: "line", from: 0, to: 0, className: `${scrapboxTableClassName} ${scrapboxTableOpenerClassName}` },
        { type: "mark", from: 0, to: 6, className: scrapboxTableKeywordClassName },
        { type: "mark", from: 6, to: 7, className: scrapboxTableNameClassName },
      ]),
    );
  });

  it("creates no specs without a table", () => {
    expect(tableSpecs("just text\n more")).toEqual([]);
  });

  it("produces valid specs for a table with an empty cell (regression: table-kit's empty-cell crash)", () => {
    // "a\t\tb" has no content at all between the two tabs -- a genuinely empty cell.
    expect(() => tableSpecs("table:t\n a\t\tb")).not.toThrow();
  });

  describe("on an idle line", () => {
    it("renders a line as an aligned grid, hiding the leading indent and tab separators", () => {
      const specs = tableSpecs("table:t\n a\tb\n c\td");

      expect(specs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "line",
            from: 8,
            className: `${scrapboxTableClassName} ${scrapboxTableRowClassName} ${scrapboxTableHeaderClassName} ${scrapboxTableRenderedClassName}`,
            attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%") }),
          }),
          expect.objectContaining({
            type: "line",
            from: 13,
            className: `${scrapboxTableClassName} ${scrapboxTableRowClassName} ${scrapboxTableRenderedClassName}`,
            attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%") }),
          }),
          expect.objectContaining({
            from: 9,
            to: 10,
            className: scrapboxTableCellClassName,
            attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 1ch") }),
          }),
          expect.objectContaining({
            from: 11,
            to: 12,
            className: scrapboxTableCellClassName,
            attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 1ch") }),
          }),
          // the leading indent (8,9) and the tab separator (10,11) are hidden
          { type: "replace", from: 8, to: 9 },
          { type: "replace", from: 10, to: 11 },
        ]),
      );
    });

    it("marks only the first body row as the header", () => {
      const specs = tableSpecs("table:t\n a\tb\n c\td");
      const headerLines = specs.filter(
        (spec) => "className" in spec && spec.className.includes(scrapboxTableHeaderClassName),
      );

      expect(headerLines).toHaveLength(1);
      expect(headerLines[0]).toMatchObject({ from: 8 });
    });

    it("measures column width with CJK characters counted as two units", () => {
      // displayWidth("見出しA") is 7 (three full-width chars at 2 each, plus
      // one ASCII char), wider than "abc" (3) -- the column width should
      // follow the wider (CJK) cell, not the plain character count.
      const specs = tableSpecs("table:t\n 見出しA\tb\n abc\td");

      expect(specs).toContainEqual(
        expect.objectContaining({ className: scrapboxTableCellClassName, attributes: expect.objectContaining({ style: expect.stringContaining("--mbox-table-kit-column-width: 7ch") }) }),
      );
    });

    it("trims padding around a cell's content, hiding it outside the active line", () => {
      // " a \t b " -- one padding space on each side of both cell values.
      const specs = tableSpecs("table:t\n a \t b ");
      const cellSpecs = specs.filter((spec) => "className" in spec && spec.className === scrapboxTableCellClassName);

      expect(cellSpecs).toEqual([
        expect.objectContaining({ from: 9, to: 10 }), // "a", trimmed
        expect.objectContaining({ from: 13, to: 14 }), // "b", trimmed
      ]);
    });
  });

  describe("on the active line", () => {
    it("shows the raw cell text instead of an aligned grid, hiding nothing", () => {
      const specs = tableSpecs("table:t\n a\tb", [2]);

      expect(specs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "line",
            from: 8,
            className: `${scrapboxTableClassName} ${scrapboxTableRowClassName} ${scrapboxTableHeaderClassName}`,
          }),
          { from: 9, to: 10, className: `${scrapboxTableCellClassName} ${scrapboxTableRawCellClassName}` },
          { from: 11, to: 12, className: `${scrapboxTableCellClassName} ${scrapboxTableRawCellClassName}` },
        ]),
      );
      expect(specs.some((spec) => spec.type === "replace")).toBe(false);
    });
  });
});

describe("scrapboxTablePlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "table:t\n a\tb",
      extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]).length).toBeGreaterThan(0);
  });
});

describe("scrapboxTableClassNames", () => {
  it("groups every public scrapbox table class name, matching scrapboxCodeBlockClassNames's fully-grouped precedent", () => {
    expect(scrapboxTableClassNames).toEqual({
      table: scrapboxTableClassName,
      opener: scrapboxTableOpenerClassName,
      row: scrapboxTableRowClassName,
      header: scrapboxTableHeaderClassName,
      cell: scrapboxTableCellClassName,
      rawCell: scrapboxTableRawCellClassName,
      rendered: scrapboxTableRenderedClassName,
      keyword: scrapboxTableKeywordClassName,
      name: scrapboxTableNameClassName,
    });
  });
});
