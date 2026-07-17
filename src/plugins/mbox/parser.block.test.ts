import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

describe("parseMboxDocument (block)", () => {
  it("documents the currently recognized syntax categories", () => {
    expect(parseMboxDocument("# heading").blocks[0]?.type).toBe("heading");
    expect(parseMboxDocument("- item").blocks[0]?.type).toBe("listItem");
    expect(parseMboxDocument("- [x] task").blocks[0]?.type).toBe("taskListItem");
    expect(parseMboxDocument("> quote").blocks[0]?.type).toBe("quote");
    expect(parseMboxDocument("```\ncode\n```").blocks[0]?.type).toBe("codeBlock");

    expect(parseMboxDocument("[Page]").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "wikiLink" }],
    });
    expect(parseMboxDocument(":smile:").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "emoji" }],
    });
    expect(parseMboxDocument("[Label](url)").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "markdownLink" }],
    });
    expect(parseMboxDocument("![Alt](image.png)").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "markdownImage" }],
    });
    expect(parseMboxDocument("https://example.com").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "autoLink" }],
    });
    expect(parseMboxDocument("`code`").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "inlineCode" }],
    });
    expect(parseMboxDocument("*em* **strong** ~~strike~~").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "emphasis" }, { type: "text" }, { type: "strong" }, { type: "text" }, { type: "strikethrough" }],
    });
  });

  it("keeps non-adopted syntax as plain text", () => {
    expect(parseMboxDocument("#hashtag").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "text", value: "#hashtag" }],
    });
    expect(parseMboxDocument("==highlight==").blocks[0]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "text", value: "==highlight==" }],
    });
  });

  describe("block", () => {
    it("returns an empty MboxDocument for empty input", () => {
      expect(parseMboxDocument("")).toEqual({ blocks: [] });
    });

    it("parses a single plain text line as a paragraph block", () => {
      expect(parseMboxDocument("Hello")).toEqual({
        blocks: [
          {
            type: "paragraph",
            from: 0,
            to: 5,
            line: 1,
            content: { from: 0, to: 5 },
            inline: [{ type: "text", from: 0, to: 5, value: "Hello" }],
          },
        ],
      });
    });

    it("parses a heading block with marker and content ranges", () => {
      expect(parseMboxDocument("# Heading")).toEqual({
        blocks: [
          {
            type: "heading",
            from: 0,
            to: 9,
            line: 1,
            level: 1,
            marker: { from: 0, to: 1 },
            syntax: { from: 0, to: 2 },
            content: { from: 2, to: 9 },
            inline: [{ type: "text", from: 2, to: 9, value: "Heading" }],
          },
        ],
      });
    });

    it("parses a heading block with a syntax range that includes marker and separator", () => {
      expect(parseMboxDocument("# Heading").blocks[0]).toMatchObject({
        type: "heading",
        marker: { from: 0, to: 1 },
        syntax: { from: 0, to: 2 },
        content: { from: 2, to: 9 },
      });
    });

    it("parses a level 2 heading syntax range with both marker characters and separator", () => {
      expect(parseMboxDocument("## Heading").blocks[0]).toMatchObject({
        type: "heading",
        level: 2,
        marker: { from: 0, to: 2 },
        syntax: { from: 0, to: 3 },
        content: { from: 3, to: 10 },
      });
    });

    it("parses empty heading markers as headings with real syntax and empty content ranges", () => {
      expect(parseMboxDocument("# ")).toEqual({
        blocks: [
          {
            type: "heading",
            from: 0,
            to: 2,
            line: 1,
            level: 1,
            marker: { from: 0, to: 1 },
            syntax: { from: 0, to: 2 },
            content: { from: 2, to: 2 },
            inline: [],
          },
        ],
      });
      expect(parseMboxDocument("###   ").blocks[0]).toMatchObject({
        type: "heading",
        level: 3,
        marker: { from: 0, to: 3 },
        syntax: { from: 0, to: 6 },
        content: { from: 6, to: 6 },
        inline: [],
      });
    });

    it("parses heading markers without trailing spaces as paragraphs", () => {
      expect(parseMboxDocument("#").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 1 },
        inline: [{ type: "text", from: 0, to: 1, value: "#" }],
      });
      expect(parseMboxDocument("##").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 2 },
        inline: [{ type: "text", from: 0, to: 2, value: "##" }],
      });
    });

    it("parses more than six heading markers as a paragraph", () => {
      expect(parseMboxDocument("####### Heading").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 15 },
      });
    });

    it("parses heading markers without a separator as a paragraph", () => {
      expect(parseMboxDocument("###Heading").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 10 },
      });
    });

    it("parses a list item block with marker and content ranges", () => {
      expect(parseMboxDocument("- item")).toEqual({
        blocks: [
          {
            type: "listItem",
            from: 0,
            to: 6,
            line: 1,
            depth: 0,
            marker: { from: 0, to: 1 },
            syntax: { from: 0, to: 2 },
            content: { from: 2, to: 6 },
            inline: [{ type: "text", from: 2, to: 6, value: "item" }],
          },
        ],
      });
    });

    it("parses an unchecked task list item block with marker, checkbox, and content ranges", () => {
      expect(parseMboxDocument("- [ ] task")).toEqual({
        blocks: [
          {
            type: "taskListItem",
            from: 0,
            to: 10,
            line: 1,
            depth: 0,
            checked: false,
            marker: { from: 0, to: 1 },
            checkbox: { from: 2, to: 5 },
            syntax: { from: 0, to: 6 },
            content: { from: 6, to: 10 },
            inline: [{ type: "text", from: 6, to: 10, value: "task" }],
          },
        ],
      });
    });

    it("parses checked task list item blocks", () => {
      expect(parseMboxDocument("- [x] done").blocks[0]).toMatchObject({
        type: "taskListItem",
        checked: true,
        checkbox: { from: 2, to: 5 },
        content: { from: 6, to: 10 },
      });
      expect(parseMboxDocument("- [X] done").blocks[0]).toMatchObject({
        type: "taskListItem",
        checked: true,
      });
    });

    it("locates a task list checkbox after multiple marker spaces", () => {
      const text = "-  [ ] task";
      const block = parseMboxDocument(text).blocks[0];

      expect(block).toMatchObject({
        type: "taskListItem",
        checkbox: { from: 3, to: 6 },
      });
      expect(text.slice(3, 6)).toBe("[ ]");
    });

    it("parses empty task list item markers as task list items with real syntax and empty content ranges", () => {
      expect(parseMboxDocument("- [ ]")).toEqual({
        blocks: [
          {
            type: "taskListItem",
            from: 0,
            to: 5,
            line: 1,
            depth: 0,
            checked: false,
            marker: { from: 0, to: 1 },
            checkbox: { from: 2, to: 5 },
            syntax: { from: 0, to: 5 },
            content: { from: 5, to: 5 },
            inline: [],
          },
        ],
      });

      expect(parseMboxDocument("- [x]").blocks[0]).toMatchObject({
        type: "taskListItem",
        checked: true,
        marker: { from: 0, to: 1 },
        checkbox: { from: 2, to: 5 },
        syntax: { from: 0, to: 5 },
        content: { from: 5, to: 5 },
        inline: [],
      });

      expect(parseMboxDocument("- [X]").blocks[0]).toMatchObject({
        type: "taskListItem",
        checked: true,
      });

      expect(parseMboxDocument("- [ ]  ").blocks[0]).toMatchObject({
        type: "taskListItem",
        checked: false,
        marker: { from: 0, to: 1 },
        checkbox: { from: 2, to: 5 },
        syntax: { from: 0, to: 7 },
        content: { from: 7, to: 7 },
        inline: [],
      });
    });

    it("locates an empty task list checkbox after multiple marker spaces", () => {
      const text = "-   [ ]";
      const block = parseMboxDocument(text).blocks[0];

      expect(block).toMatchObject({
        type: "taskListItem",
        checkbox: { from: 4, to: 7 },
      });
      expect(text.slice(4, 7)).toBe("[ ]");
    });

    it("does not parse an empty task checkbox as a list item containing a wiki link", () => {
      expect(parseMboxDocument("- [ ]").blocks[0]).toMatchObject({
        type: "taskListItem",
        inline: [],
      });
    });

    it("determines task list item depth from leading spaces only", () => {
      expect(parseMboxDocument("  - [ ] nested").blocks[0]).toMatchObject({
        type: "taskListItem",
        depth: 2,
        marker: { from: 2, to: 3 },
        checkbox: { from: 4, to: 7 },
        syntax: { from: 2, to: 8 },
        content: { from: 8, to: 14 },
      });
    });

    it("parses a lone list marker as a paragraph", () => {
      expect(parseMboxDocument("-").blocks[0]).toMatchObject({
        type: "paragraph",
        content: { from: 0, to: 1 },
      });
    });

    it("parses a list marker with trailing space as an empty list item", () => {
      expect(parseMboxDocument("- ")).toEqual({
        blocks: [
          {
            type: "listItem",
            from: 0,
            to: 2,
            line: 1,
            depth: 0,
            marker: { from: 0, to: 1 },
            syntax: { from: 0, to: 2 },
            content: { from: 2, to: 2 },
            inline: [],
          },
        ],
      });
    });

    it("parses a nested list marker with trailing space as an empty list item", () => {
      expect(parseMboxDocument(" - ").blocks[0]).toMatchObject({
        type: "listItem",
        depth: 1,
        marker: { from: 1, to: 2 },
        syntax: { from: 1, to: 3 },
        content: { from: 3, to: 3 },
        inline: [],
      });
    });

    it("determines list item depth from leading spaces only", () => {
      expect(parseMboxDocument("  - nested")).toEqual({
        blocks: [
          {
            type: "listItem",
            from: 0,
            to: 10,
            line: 1,
            depth: 2,
            marker: { from: 2, to: 3 },
            syntax: { from: 2, to: 4 },
            content: { from: 4, to: 10 },
            inline: [{ type: "text", from: 4, to: 10, value: "nested" }],
          },
        ],
      });
    });

    it("treats one leading space as list item depth 1", () => {
      expect(parseMboxDocument(" - item").blocks[0]).toMatchObject({
        type: "listItem",
        depth: 1,
        marker: { from: 1, to: 2 },
        syntax: { from: 1, to: 3 },
        content: { from: 3, to: 7 },
      });
    });

    it("excludes leading spaces from a list item syntax range", () => {
      expect(parseMboxDocument("  - item").blocks[0]).toMatchObject({
        type: "listItem",
        marker: { from: 2, to: 3 },
        syntax: { from: 2, to: 4 },
        content: { from: 4, to: 8 },
      });
    });

    it("determines deeper list item depth from leading spaces", () => {
      expect(parseMboxDocument("    - item").blocks[0]).toMatchObject({
        type: "listItem",
        depth: 4,
        marker: { from: 4, to: 5 },
        syntax: { from: 4, to: 6 },
        content: { from: 6, to: 10 },
      });
    });

    it("parses multiple lines as a block array", () => {
      expect(parseMboxDocument("Hello\n# Heading\n  - nested")).toEqual({
        blocks: [
          {
            type: "paragraph",
            from: 0,
            to: 5,
            line: 1,
            content: { from: 0, to: 5 },
            inline: [{ type: "text", from: 0, to: 5, value: "Hello" }],
          },
          {
            type: "heading",
            from: 6,
            to: 15,
            line: 2,
            level: 1,
            marker: { from: 6, to: 7 },
            syntax: { from: 6, to: 8 },
            content: { from: 8, to: 15 },
            inline: [{ type: "text", from: 8, to: 15, value: "Heading" }],
          },
          {
            type: "listItem",
            from: 16,
            to: 26,
            line: 3,
            depth: 2,
            marker: { from: 18, to: 19 },
            syntax: { from: 18, to: 20 },
            content: { from: 20, to: 26 },
            inline: [{ type: "text", from: 20, to: 26, value: "nested" }],
          },
        ],
      });
    });

    it("parses a quote block with marker, syntax, and content ranges", () => {
      expect(parseMboxDocument("> quote").blocks).toEqual([
        {
          type: "quote",
          from: 0,
          to: 7,
          line: 1,
          marker: { from: 0, to: 1 },
          syntax: { from: 0, to: 2 },
          content: { from: 2, to: 7 },
          inline: [{ type: "text", from: 2, to: 7, value: "quote" }],
        },
      ]);
    });

    it("treats a quote marker without content as a paragraph", () => {
      expect(parseMboxDocument("> ").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 2, value: "> " }],
      });
    });

  });
});
