import { describe, expect, it, vi } from "vitest";
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
import { projectScrapboxLinkDisplayValue } from "./link.js";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { parseScrapboxDocument } from "./parser.js";
import * as parserCache from "./parser-cache.js";

function tableSpecs(doc: string, activeLines: Iterable<number> = []) {
  const context = createTestContext(doc, { activeLines });
  const specs = scrapboxTablePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

function tableSpecsForRawParserInput(input: string, activeLines: Iterable<number> = []) {
  const cache = vi.spyOn(parserCache, "getScrapboxDocumentCacheEntryFromState").mockReturnValue({ input, document: parseScrapboxDocument(input) });
  try {
    // EditorState normalizes CRLF before plugins see it. This substitutes only
    // the cache boundary so the consumer receives the public parser's raw-input
    // result; these specs deliberately are not lowered against that normalized state.
    return scrapboxTablePlugin().decorations!(createTestContext("", { activeLines }));
  } finally {
    cache.mockRestore();
  }
}

function projectFirstCell(input: string): string | undefined {
  const document = parseScrapboxDocument(input);
  const line = document.tableBlocks[0].bodyLines[0];
  return projectScrapboxLinkDisplayValue(input, line, line.content.from, line.logicalTo);
}

describe("projectScrapboxLinkDisplayValue", () => {
  it("projects an icon as its final page-name segment", () => {
    expect(projectFirstCell("table:t\n [/team/bob.icon]")).toBe("bob");
  });

  it("projects an icon's final segment once per repeat for table reservation", () => {
    expect(projectFirstCell("table:t\n [team/bob.icon*3]")).toBe("bobbobbob");
  });

  it("projects text alongside multiple icons in one cell", () => {
    expect(projectFirstCell("table:t\n prefix [alice.icon] / [team/bob.icon]")).toBe("prefix alice / bob");
  });

  it("preserves UTF-16 offsets around a non-BMP character", () => {
    expect(projectFirstCell("table:t\n 😀 [Page] 💡")).toBe("😀 Page 💡");
  });

  it("projects every link in one cell", () => {
    expect(projectFirstCell("table:t\n [one] then [two]")).toBe("one then two");
  });

  it("projects links nested in decoration and strong nodes", () => {
    expect(projectFirstCell("table:t\n [* [Page]]")).toBe("[* Page]");
    expect(projectFirstCell("table:t\n [[ [Page] ]]")).toBe("[[ Page ]]");
  });

  it("uses the rendered value for hashtags and bare or titled external links", () => {
    expect(projectFirstCell("table:t\n #tag")).toBe("#tag");
    expect(projectFirstCell("table:t\n https://example.com")).toBe("https://example.com");
    expect(projectFirstCell("table:t\n [https://example.com title]")).toBe("title");
  });

  it("leaves a link-free cell unprojected so its raw value is measured", () => {
    expect(projectFirstCell("table:t\n plain cell")).toBeUndefined();
  });
});

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
        { type: "line", from: 0, className: `${scrapboxTableClassName} ${scrapboxTableOpenerClassName}` },
        { type: "mark", from: 0, to: 6, className: scrapboxTableKeywordClassName },
        { type: "mark", from: 6, to: 7, className: scrapboxTableNameClassName },
      ]),
    );
  });

  it("creates no specs without a table", () => {
    expect(tableSpecs("just text\n more")).toEqual([]);
  });

  it("uses the parser's logical line end for the final CRLF cell", () => {
    const specs = tableSpecsForRawParserInput("table:t\r\n a\tb\r\n", [2]);

    expect(specs).toContainEqual(expect.objectContaining({ from: 12, to: 13, className: `${scrapboxTableCellClassName} ${scrapboxTableRawCellClassName}` }));
    expect(specs).not.toContainEqual(expect.objectContaining({ from: 12, to: 14, className: `${scrapboxTableCellClassName} ${scrapboxTableRawCellClassName}` }));
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

  it("applies computed widths to rendered cells and releases them on active raw cells", () => {
    expect(scrapboxTablePlugin().theme).toMatchObject({
      [`.${scrapboxTableCellClassName}`]: {
        width: "var(--mbox-table-cell-width, var(--mbox-table-kit-column-width))",
        maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
        minWidth: 0,
        overflowWrap: "anywhere",
      },
      [`.${scrapboxTableCellClassName}.${scrapboxTableRawCellClassName}`]: {
        width: "auto",
        maxWidth: "none",
        minWidth: "auto",
      },
    });
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
