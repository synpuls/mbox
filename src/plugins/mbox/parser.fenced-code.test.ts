import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

describe("parseMboxDocument (fenced-code)", () => {
  describe("fenced-code", () => {
    it("parses a fenced code block with marker and content ranges", () => {
      expect(parseMboxDocument("```ts\nconst value = [Page]\n```")).toEqual({
        blocks: [
          {
            type: "codeBlock",
            from: 0,
            to: 30,
            line: 1,
            openingFence: { from: 0, to: 5 },
            info: { from: 3, to: 5 },
            infoValue: "ts",
            content: { from: 6, to: 27 },
            closingFence: { from: 27, to: 30 },
            value: "const value = [Page]\n",
          },
        ],
      });
    });

    it("does not parse bracket syntax inside fenced code blocks as wiki links", () => {
      const [block] = parseMboxDocument("```\nconst value = [Page]\n```").blocks;

      expect(block).toMatchObject({
        type: "codeBlock",
        value: "const value = [Page]\n",
      });
      expect("inline" in block ? block.inline : []).toEqual([]);
    });

    it("does not parse emoji syntax inside fenced code blocks as emoji", () => {
      const [block] = parseMboxDocument("```\n:smile:\n```").blocks;

      expect(block).toMatchObject({
        type: "codeBlock",
        value: ":smile:\n",
      });
      expect("inline" in block ? block.inline : []).toEqual([]);
    });

    it("does not parse Markdown links or images inside fenced code blocks", () => {
      const [block] = parseMboxDocument("```\n[Label](url)\n![Alt](image.png)\n```").blocks;

      expect(block).toMatchObject({
        type: "codeBlock",
        value: "[Label](url)\n![Alt](image.png)\n",
      });
      expect("inline" in block ? block.inline : []).toEqual([]);
    });

    it("does not parse inline style syntax inside fenced code blocks", () => {
      const [block] = parseMboxDocument("```\n*em*\n**strong**\n~~strike~~\n```").blocks;

      expect(block).toMatchObject({
        type: "codeBlock",
        value: "*em*\n**strong**\n~~strike~~\n",
      });
      expect("inline" in block ? block.inline : []).toEqual([]);
    });

    it("does not parse bare URLs inside fenced code blocks", () => {
      const [block] = parseMboxDocument("```\nhttps://example.com\n```").blocks;

      expect(block).toMatchObject({
        type: "codeBlock",
        value: "https://example.com\n",
      });
      expect("inline" in block ? block.inline : []).toEqual([]);
    });

    it("does not parse heading or list markers inside fenced code blocks as blocks", () => {
      expect(parseMboxDocument("```\n# heading\n- item\n```").blocks).toEqual([
        {
          type: "codeBlock",
          from: 0,
          to: 24,
          line: 1,
          openingFence: { from: 0, to: 3 },
          info: { from: 3, to: 3 },
          infoValue: "",
          content: { from: 4, to: 21 },
          closingFence: { from: 21, to: 24 },
          value: "# heading\n- item\n",
        },
      ]);
    });

    it("does not parse task list markers inside fenced code blocks as blocks", () => {
      expect(parseMboxDocument("```\n- [ ] task\n```\n- [ ] outside").blocks).toMatchObject([
        {
          type: "codeBlock",
          value: "- [ ] task\n",
        },
        {
          type: "taskListItem",
          content: { from: 25, to: 32 },
        },
      ]);
    });

    it("does not parse quote markers inside fenced code blocks as blocks", () => {
      expect(parseMboxDocument("```\n> quote\n```").blocks).toEqual([
        {
          type: "codeBlock",
          from: 0,
          to: 15,
          line: 1,
          openingFence: { from: 0, to: 3 },
          info: { from: 3, to: 3 },
          infoValue: "",
          content: { from: 4, to: 12 },
          closingFence: { from: 12, to: 15 },
          value: "> quote\n",
        },
      ]);
    });

    it("treats an unclosed fenced code block as code through the end of the document", () => {
      expect(parseMboxDocument("```\n[Page]\n:smile:").blocks).toEqual([
        {
          type: "codeBlock",
          from: 0,
          to: 18,
          line: 1,
          openingFence: { from: 0, to: 3 },
          info: { from: 3, to: 3 },
          infoValue: "",
          content: { from: 4, to: 18 },
          closingFence: null,
          value: "[Page]\n:smile:",
        },
      ]);
    });

    it("parses normal blocks before and after a fenced code block", () => {
      expect(parseMboxDocument("# before\n```\n[Page]\n```\n# after").blocks).toEqual([
        expect.objectContaining({
          type: "heading",
          line: 1,
          content: { from: 2, to: 8 },
        }),
        expect.objectContaining({
          type: "codeBlock",
          from: 9,
          to: 23,
          line: 2,
          content: { from: 13, to: 20 },
          value: "[Page]\n",
        }),
        expect.objectContaining({
          type: "heading",
          line: 5,
          content: { from: 26, to: 31 },
        }),
      ]);
    });

    it("preserves empty lines inside fenced code blocks", () => {
      expect(parseMboxDocument("```\nfirst\n\nthird\n```").blocks[0]).toMatchObject({
        type: "codeBlock",
        content: { from: 4, to: 17 },
        value: "first\n\nthird\n",
      });
    });

    it("does not treat indented triple backticks as a fenced code block", () => {
      const blocks = parseMboxDocument(" ```\n[Page]\n```").blocks;

      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        line: 1,
        inline: [{ type: "text", from: 0, to: 4, value: " ```" }],
      });
      expect(blocks[1]).toMatchObject({
        type: "paragraph",
        line: 2,
        inline: [{ type: "wikiLink", from: 5, to: 11, value: "Page" }],
      });
      expect(blocks[2]).toMatchObject({
        type: "codeBlock",
        line: 3,
        closingFence: null,
      });
    });

    it("does not treat tilde fences as fenced code blocks yet", () => {
      const blocks = parseMboxDocument("~~~\n[Page]\n~~~").blocks;

      expect(blocks[0]).toMatchObject({
        type: "paragraph",
        line: 1,
      });
      expect(blocks[1]).toMatchObject({
        type: "paragraph",
        line: 2,
        inline: [{ type: "wikiLink", from: 4, to: 10, value: "Page" }],
      });
      expect(blocks[2]).toMatchObject({
        type: "paragraph",
        line: 3,
      });
    });

    it("does not close a fenced code block with trailing non-space text after the closing marker", () => {
      expect(parseMboxDocument("```\nnot closed\n``` nope\n[Page]\n```").blocks).toEqual([
        {
          type: "codeBlock",
          from: 0,
          to: 34,
          line: 1,
          openingFence: { from: 0, to: 3 },
          info: { from: 3, to: 3 },
          infoValue: "",
          content: { from: 4, to: 31 },
          closingFence: { from: 31, to: 34 },
          value: "not closed\n``` nope\n[Page]\n",
        },
      ]);
    });

  });
});
