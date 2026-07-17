import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

describe("parseMboxDocument (table)", () => {
  describe("table", () => {
    it("parses a GFM table block with header, delimiter, and body rows", () => {
      expect(parseMboxDocument("| A | B |\n| --- | --- |\n| 1 | 2 |").blocks[0]).toMatchObject({
        type: "table",
        from: 0,
        to: 33,
        line: 1,
        header: {
          from: 0,
          to: 9,
          cells: [
            { from: 1, to: 4, content: { from: 2, to: 3 }, value: "A" },
            { from: 5, to: 8, content: { from: 6, to: 7 }, value: "B" },
          ],
        },
        delimiter: {
          from: 10,
          to: 23,
        },
        rows: [
          {
            from: 24,
            to: 33,
            cells: [
              { from: 25, to: 28, content: { from: 26, to: 27 }, value: "1" },
              { from: 29, to: 32, content: { from: 30, to: 31 }, value: "2" },
            ],
          },
        ],
      });
    });

    it("does not parse table-like text inside fenced code blocks", () => {
      expect(parseMboxDocument("```\n| A | B |\n| --- | --- |\n```").blocks[0]).toMatchObject({
        type: "codeBlock",
        value: "| A | B |\n| --- | --- |\n",
      });
    });

    it("does not parse a table when the header and delimiter cell counts differ", () => {
      expect(parseMboxDocument("| A | B |\n| --- |").blocks).toEqual([
        expect.objectContaining({ type: "paragraph", from: 0, to: 9 }),
        expect.objectContaining({ type: "paragraph", from: 10, to: 17 }),
      ]);
    });

  });
});
