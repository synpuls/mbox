import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

describe("parseMboxDocument (footnote)", () => {
  describe("block", () => {
    it("parses a footnote definition block with marker, content, and plain value", () => {
      expect(parseMboxDocument("[^1]: note text")).toEqual({
        blocks: [
          {
            type: "footnoteDefinition",
            from: 0,
            to: 15,
            line: 1,
            label: "1",
            identifier: "1",
            marker: { from: 0, to: 5 },
            syntax: { from: 0, to: 6 },
            content: { from: 6, to: 15 },
            value: "note text",
          },
        ],
      });
    });

    it("normalizes footnote reference and definition identifiers case-insensitively", () => {
      const doc = parseMboxDocument("[^Label]\n[^label]: note");
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "footnoteRef", value: "Label", identifier: "label" }],
      });
      expect(doc.blocks[1]).toMatchObject({
        type: "footnoteDefinition",
        label: "label",
        identifier: "label",
      });
    });

    it("trims trailing whitespace from a footnote definition's content range and value", () => {
      const text = "[^1]: note text   ";
      expect(parseMboxDocument(text).blocks[0]).toMatchObject({
        type: "footnoteDefinition",
        content: { from: 6, to: 15 },
        value: "note text",
      });
    });

    it("treats footnote definition labels containing an opening bracket as paragraph text", () => {
      expect(parseMboxDocument("[^a[b]: note").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 12 },
      });
    });

  });

  describe("inline", () => {
    it("parses a footnote reference inline node with ranges and identifier", () => {
      expect(parseMboxDocument("[^1]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "footnoteRef",
            from: 0,
            to: 4,
            marker: { from: 0, to: 2 },
            label: { from: 2, to: 3 },
            identifier: "1",
            value: "1",
          },
        ],
      });
    });

    it("parses footnote references before wiki links and icons while preserving source order", () => {
      expect(parseMboxDocument("[Page] [^Label] [name.icon]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "wikiLink", from: 0, to: 6, value: "Page" },
          { type: "text", from: 6, to: 7, value: " " },
          { type: "footnoteRef", from: 7, to: 15, value: "Label", identifier: "label" },
          { type: "text", from: 15, to: 16, value: " " },
          { type: "icon", from: 16, to: 27, value: "name" },
        ],
      });
    });

  });
});
