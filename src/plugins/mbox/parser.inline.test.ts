import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

// Section 10 TDD test list:
// - autolink schemes, boundaries, terminators, punctuation, and parentheses
// - rejected candidates at every accepted boundary preserve source text
// - differential fuzzing against the pre-linearization matcher
// - whitespace, punctuation, parenthesis, and UTF-16 edge cases
// - separate scheme-guard and dot-check performance cases

function legacyParseAutoLinkEnd(text: string, index: number): number | null {
  if (!text.startsWith("https://", index) && !text.startsWith("http://", index)) return null;
  if (index > 0 && !/\s|[([{"']/.test(text[index - 1]!)) return null;

  let end = index;
  while (end < text.length && !/\s/.test(text[end]!)) end += 1;

  while (end > index && /[.,:;!?]/.test(text[end - 1]!)) end -= 1;

  let openParens = 0;
  let closeParens = 0;
  for (let cursor = index; cursor < end; cursor += 1) {
    if (text[cursor] === "(") openParens += 1;
    if (text[cursor] === ")") closeParens += 1;
  }
  while (end > index && text[end - 1] === ")" && closeParens > openParens) {
    end -= 1;
    closeParens -= 1;
  }

  return end > index && text.slice(index, end).includes(".") ? end : null;
}

// This is deliberately a test-only copy of the old matcher. The fuzz corpus
// excludes other inline syntax, so this constructs the complete public AST
// for its single paragraph and compares it directly with parseMboxDocument.
function legacyParseAutolinkOnlyDocument(text: string) {
  const inline: Array<Record<string, unknown>> = [];
  let cursor = 0;
  let index = 0;
  while (index < text.length) {
    const end = text[index] === "h" ? legacyParseAutoLinkEnd(text, index) : null;
    if (end === null) {
      index += 1;
      continue;
    }
    if (cursor < index) inline.push({ type: "text", from: cursor, to: index, value: text.slice(cursor, index) });
    inline.push({
      type: "autoLink",
      from: index,
      to: end,
      url: { from: index, to: end },
      urlValue: text.slice(index, end),
    });
    cursor = end;
    index = end;
  }
  if (cursor < text.length) inline.push({ type: "text", from: cursor, to: text.length, value: text.slice(cursor) });

  return {
    blocks: [
      {
        type: "paragraph",
        from: 0,
        to: text.length,
        line: 1,
        content: { from: 0, to: text.length },
        inline,
      },
    ],
  };
}

function inlineSource(input: string): string {
  const [block] = parseMboxDocument(input).blocks;
  if (!block || block.type !== "paragraph") throw new Error("Expected paragraph");
  return block.inline.map((node) => input.slice(node.from, node.to)).join("");
}

describe("parseMboxDocument (inline)", () => {
  describe("inline", () => {
    it("parses plain text paragraph content as an inline text node", () => {
      expect(parseMboxDocument("Hello").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "text",
            from: 0,
            to: 5,
            value: "Hello",
          },
        ],
      });
    });

    it("parses a wiki link inline node with ranges and target value", () => {
      expect(parseMboxDocument("[Page]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "wikiLink",
            from: 0,
            to: 6,
            marker: { from: 0, to: 1 },
            target: { from: 1, to: 5 },
            value: "Page",
          },
        ],
      });
    });

    it("parses multiple wiki links in the same document", () => {
      expect(parseMboxDocument("[Page] and [Other]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "wikiLink",
            from: 0,
            to: 6,
            target: { from: 1, to: 5 },
            value: "Page",
          },
          {
            type: "text",
            from: 6,
            to: 11,
            value: " and ",
          },
          {
            type: "wikiLink",
            from: 11,
            to: 18,
            target: { from: 12, to: 17 },
            value: "Other",
          },
        ],
      });
    });

    it("parses an icon inline node with ranges and name value", () => {
      expect(parseMboxDocument("[name.icon]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "icon",
            from: 0,
            to: 11,
            marker: { from: 0, to: 1 },
            name: { from: 1, to: 5 },
            value: "name",
          },
        ],
      });
    });

    it("parses icon suffixes case-insensitively", () => {
      expect(parseMboxDocument("[name.ICON]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "icon",
            from: 0,
            to: 11,
            name: { from: 1, to: 5 },
            value: "name",
          },
        ],
      });
    });

    it("parses slash-separated icon names", () => {
      expect(parseMboxDocument("[team/alice.icon]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "icon",
            from: 0,
            to: 17,
            name: { from: 1, to: 11 },
            value: "team/alice",
          },
        ],
      });
    });

    it("keeps bracket syntax without an icon suffix as a wiki link", () => {
      expect(parseMboxDocument("[Page]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "wikiLink",
            from: 0,
            to: 6,
            target: { from: 1, to: 5 },
            value: "Page",
          },
        ],
      });
    });

    it("parses Markdown links with icon-like labels as markdownLink nodes instead of icon nodes", () => {
      expect(parseMboxDocument("[name.icon](url)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownLink",
            from: 0,
            to: 16,
            label: { from: 1, to: 10 },
            url: { from: 12, to: 15 },
            labelValue: "name.icon",
            urlValue: "url",
          },
        ],
      });
    });

    it("parses Markdown images with icon-like alt text as markdownImage nodes instead of icon nodes", () => {
      expect(parseMboxDocument("![name.icon](url)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 17,
            alt: { from: 2, to: 11 },
            url: { from: 13, to: 16 },
            altValue: "name.icon",
            urlValue: "url",
          },
        ],
      });
    });

    it("keeps wiki links and icon inline nodes in source order", () => {
      expect(parseMboxDocument("[Page] [name.icon] [Other]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "wikiLink", from: 0, to: 6, value: "Page" },
          { type: "text", from: 6, to: 7, value: " " },
          { type: "icon", from: 7, to: 18, value: "name" },
          { type: "text", from: 18, to: 19, value: " " },
          { type: "wikiLink", from: 19, to: 26, value: "Other" },
        ],
      });
    });

    it("parses Markdown links with footnote-like labels as markdownLink nodes instead of footnote refs", () => {
      expect(parseMboxDocument("[^note](url)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownLink",
            from: 0,
            to: 12,
            label: { from: 1, to: 6 },
            url: { from: 8, to: 11 },
            labelValue: "^note",
            urlValue: "url",
          },
        ],
      });
    });

    it("parses Markdown images with footnote-like alt text as markdownImage nodes instead of footnote refs", () => {
      expect(parseMboxDocument("![^note](url)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 13,
            alt: { from: 2, to: 7 },
            url: { from: 9, to: 12 },
            altValue: "^note",
            urlValue: "url",
          },
        ],
      });
    });

    it("parses an emoji inline node with marker and name ranges", () => {
      expect(parseMboxDocument(":smile:").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "emoji",
            from: 0,
            to: 7,
            marker: { from: 0, to: 7 },
            name: { from: 1, to: 6 },
            value: "smile",
          },
        ],
      });
    });

    it("does not parse incomplete emoji syntax as emoji", () => {
      expect(parseMboxDocument(":").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 1, value: ":" }],
      });
      expect(parseMboxDocument(":smile").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 6, value: ":smile" }],
      });
    });

    it("fixes compact colon emoji boundaries", () => {
      expect(parseMboxDocument("::").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 2, value: "::" }],
      });
      expect(parseMboxDocument(":smile::").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "emoji",
            from: 0,
            to: 7,
            value: "smile",
          },
          { type: "text", from: 7, to: 8, value: ":" },
        ],
      });
    });

    it("keeps wiki links and emoji inline nodes in source order", () => {
      expect(parseMboxDocument("[Page] :smile: [Other]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "wikiLink", from: 0, to: 6, value: "Page" },
          { type: "text", from: 6, to: 7, value: " " },
          { type: "emoji", from: 7, to: 14, value: "smile" },
          { type: "text", from: 14, to: 15, value: " " },
          { type: "wikiLink", from: 15, to: 22, value: "Other" },
        ],
      });
    });

    it("does not parse an empty bracket pair as a wiki link", () => {
      expect(parseMboxDocument("[]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 2, value: "[]" }],
      });
    });

    it("does not parse an unclosed wiki link", () => {
      expect(parseMboxDocument("[Page").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 5, value: "[Page" }],
      });
    });

    it("does not parse an unopened wiki link", () => {
      expect(parseMboxDocument("Page]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 5, value: "Page]" }],
      });
    });

    it("parses the inner wiki link and keeps outer brackets as text", () => {
      expect(parseMboxDocument("[[Page]]").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 1, value: "[" },
          {
            type: "wikiLink",
            from: 1,
            to: 7,
            marker: { from: 1, to: 2 },
            target: { from: 2, to: 6 },
            value: "Page",
          },
          { type: "text", from: 7, to: 8, value: "]" },
        ],
      });
    });

    it("parses Markdown links as markdownLink nodes instead of wikiLink nodes", () => {
      expect(parseMboxDocument("[Label](https://example.com)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownLink",
            from: 0,
            to: 28,
            label: { from: 1, to: 6 },
            url: { from: 8, to: 27 },
            markers: {
              labelOpen: { from: 0, to: 1 },
              labelClose: { from: 6, to: 7 },
              urlOpen: { from: 7, to: 8 },
              urlClose: { from: 27, to: 28 },
            },
            labelValue: "Label",
            urlValue: "https://example.com",
          },
        ],
      });
    });

    it("parses Markdown images as markdownImage nodes instead of wikiLink nodes", () => {
      expect(parseMboxDocument("![Alt](image.png)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 17,
            alt: { from: 2, to: 5 },
            url: { from: 7, to: 16 },
            markers: {
              image: { from: 0, to: 1 },
              labelOpen: { from: 1, to: 2 },
              labelClose: { from: 5, to: 6 },
              urlOpen: { from: 6, to: 7 },
              urlClose: { from: 16, to: 17 },
            },
            altValue: "Alt",
            urlValue: "image.png",
          },
        ],
      });
    });

    it("accepts Markdown image titles but ignores them in the parsed image node", () => {
      expect(parseMboxDocument('![Alt](image.png "Title")').blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 25,
            alt: { from: 2, to: 5 },
            url: { from: 7, to: 16 },
            markers: {
              image: { from: 0, to: 1 },
              labelOpen: { from: 1, to: 2 },
              labelClose: { from: 5, to: 6 },
              urlOpen: { from: 6, to: 7 },
              urlClose: { from: 24, to: 25 },
            },
            altValue: "Alt",
            urlValue: "image.png",
          },
        ],
      });

      const [block] = parseMboxDocument('![Alt](image.png "Title")').blocks;
      expect(block.type).toBe("paragraph");
      if (block.type !== "paragraph") {
        throw new Error("Expected paragraph block");
      }
      const [image] = block.inline;
      expect(image).not.toHaveProperty("titleValue");
    });

    it("accepts escaped closing brackets in Markdown image alt text", () => {
      expect(parseMboxDocument(String.raw`![A \] B](image.png)`).blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 20,
            altValue: "A ] B",
            urlValue: "image.png",
          },
        ],
      });
    });

    it("accepts escaped closing parens in Markdown image URLs", () => {
      expect(parseMboxDocument(String.raw`![Alt](image\).png)`).blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 19,
            altValue: "Alt",
            urlValue: "image).png",
          },
        ],
      });
    });

    it("accepts empty Markdown image alt text", () => {
      expect(parseMboxDocument("![](image.png)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "markdownImage",
            from: 0,
            to: 14,
            alt: { from: 2, to: 2 },
            url: { from: 4, to: 13 },
            altValue: "",
            urlValue: "image.png",
          },
        ],
      });
    });

    it("keeps page links, Markdown links, and Markdown images distinct in source order", () => {
      expect(parseMboxDocument("[Page] [Label](url) ![Alt](image.png)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "wikiLink", from: 0, to: 6, value: "Page" },
          { type: "text", from: 6, to: 7, value: " " },
          { type: "markdownLink", from: 7, to: 19, labelValue: "Label", urlValue: "url" },
          { type: "text", from: 19, to: 20, value: " " },
          { type: "markdownImage", from: 20, to: 37, altValue: "Alt", urlValue: "image.png" },
        ],
      });
    });

    it("parses https bare URLs as autoLink nodes", () => {
      expect(parseMboxDocument("Visit https://example.com now").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 6, value: "Visit " },
          {
            type: "autoLink",
            from: 6,
            to: 25,
            url: { from: 6, to: 25 },
            urlValue: "https://example.com",
          },
          { type: "text", from: 25, to: 29, value: " now" },
        ],
      });
    });

    it("parses http bare URLs as autoLink nodes", () => {
      expect(parseMboxDocument("http://example.com").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "autoLink",
            from: 0,
            to: 18,
            url: { from: 0, to: 18 },
            urlValue: "http://example.com",
          },
        ],
      });
    });

    it("parses inline code with marker and content ranges", () => {
      expect(parseMboxDocument("Use `code` here").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 4, value: "Use " },
          {
            type: "inlineCode",
            from: 4,
            to: 10,
            openingMarker: { from: 4, to: 5 },
            closingMarker: { from: 9, to: 10 },
            content: { from: 5, to: 9 },
            value: "code",
          },
          { type: "text", from: 10, to: 15, value: " here" },
        ],
      });
    });

    it("does not parse unclosed backticks as inline code", () => {
      expect(parseMboxDocument("Use `code").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 9, value: "Use `code" }],
      });
    });

    it("keeps inline syntax inside inline code out of other inline nodes", () => {
      expect(parseMboxDocument("`[Page] :smile: https://example.com`").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          {
            type: "inlineCode",
            from: 0,
            to: 36,
            value: "[Page] :smile: https://example.com",
          },
        ],
      });
    });

    it("parses star emphasis with marker and content ranges", () => {
      expect(parseMboxDocument("Use *em* here").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 4, value: "Use " },
          {
            type: "emphasis",
            from: 4,
            to: 8,
            openingMarker: { from: 4, to: 5 },
            closingMarker: { from: 7, to: 8 },
            content: { from: 5, to: 7 },
            value: "em",
          },
          { type: "text", from: 8, to: 13, value: " here" },
        ],
      });
    });

    it("parses star strong with marker and content ranges", () => {
      expect(parseMboxDocument("Use **strong** here").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 4, value: "Use " },
          {
            type: "strong",
            from: 4,
            to: 14,
            openingMarker: { from: 4, to: 6 },
            closingMarker: { from: 12, to: 14 },
            content: { from: 6, to: 12 },
            value: "strong",
          },
          { type: "text", from: 14, to: 19, value: " here" },
        ],
      });
    });

    it("parses strikethrough with marker and content ranges", () => {
      expect(parseMboxDocument("Use ~~strike~~ here").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 4, value: "Use " },
          {
            type: "strikethrough",
            from: 4,
            to: 14,
            openingMarker: { from: 4, to: 6 },
            closingMarker: { from: 12, to: 14 },
            content: { from: 6, to: 12 },
            value: "strike",
          },
          { type: "text", from: 14, to: 19, value: " here" },
        ],
      });
    });

    it("does not parse unclosed strikethrough as an inline style", () => {
      expect(parseMboxDocument("Use ~~strike").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 12, value: "Use ~~strike" }],
      });
    });

    it("does not parse underscore emphasis yet", () => {
      expect(parseMboxDocument("_em_").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 4, value: "_em_" }],
      });
    });

    it("does not parse emphasis inside inline code", () => {
      expect(parseMboxDocument("`*em* ~~strike~~`").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "inlineCode", from: 0, to: 17, value: "*em* ~~strike~~" }],
      });
    });

    it("excludes sentence punctuation from bare URL autoLink nodes", () => {
      expect(parseMboxDocument("See https://example.com.").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [
          { type: "text", from: 0, to: 4, value: "See " },
          { type: "autoLink", from: 4, to: 23, urlValue: "https://example.com" },
          { type: "text", from: 23, to: 24, value: "." },
        ],
      });
    });

    it("does not parse the URL inside Markdown links as a separate autoLink node", () => {
      expect(parseMboxDocument("[Label](https://example.com)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "markdownLink", from: 0, to: 28, urlValue: "https://example.com" }],
      });
    });

    it("does not parse javascript scheme text as autoLink nodes", () => {
      expect(parseMboxDocument("javascript:alert(1)").blocks[0]).toMatchObject({
        type: "paragraph",
        inline: [{ type: "text", from: 0, to: 19, value: "javascript:alert(1)" }],
      });
    });

    describe("autolink reject-path linearization", () => {
      it("preserves the established autolink schemes, boundaries, terminators, and suffix rules", () => {
        for (const input of [
          "http://example.com",
          "https://example.com",
          " http://example.com",
          "(http://example.com",
          "[http://example.com",
          "{http://example.com",
          '\"http://example.com',
          "'http://example.com",
        ]) {
          const [block] = parseMboxDocument(input).blocks;
          expect(block && "inline" in block ? block.inline : []).toContainEqual(
            expect.objectContaining({
              type: "autoLink",
              urlValue: input.includes("https://") ? "https://example.com" : "http://example.com",
            }),
          );
        }

        for (const input of ["xhttp://example.com", "http://example.com rest", "http://example.com\trest", "http://example.com\nrest"]) {
          const document = parseMboxDocument(input);
          const urls = document.blocks.flatMap((block) =>
            "inline" in block ? block.inline.filter((node) => node.type === "autoLink").map((node) => node.urlValue) : [],
          );
          expect(urls).toEqual(input.startsWith("x") ? [] : ["http://example.com"]);
        }

        expect(parseMboxDocument("http://example.com.,:;!?").blocks[0]).toMatchObject({
          inline: [
            { type: "autoLink", urlValue: "http://example.com" },
            { type: "text", value: ".,:;!?" },
          ],
        });
        expect(parseMboxDocument("http://example.com/a(b))").blocks[0]).toMatchObject({
          inline: [
            { type: "autoLink", urlValue: "http://example.com/a(b)" },
            { type: "text", value: ")" },
          ],
        });
      });

      it("rejects boundary-clearing dotless candidates without losing their text", () => {
        for (const prefix of ["(", "{", "[", '\"', "'"]) {
          const input = `${prefix}http://x`.repeat(200);
          const [block] = parseMboxDocument(input).blocks;
          expect(block).toMatchObject({ inline: [{ type: "text", value: input }] });
          expect(inlineSource(input)).toBe(input);
          expect(block && "inline" in block ? block.inline.filter((node) => node.type === "autoLink") : []).toHaveLength(0);
        }
      });

      it("matches the legacy matcher for complete public ASTs across fuzzed autolink inputs", () => {
        const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260720;
        const numRuns = process.env.FC_NUM_RUNS ? Number(process.env.FC_NUM_RUNS) : 500;
        const atom = fc.constantFrom(
          "x",
          "h",
          "http://",
          "https://",
          ".",
          "(",
          ")",
          "{",
          "\"",
          "'",
          "😀",
          " ",
          "\t",
          "\r",
          "\u2028",
          "\u2029",
        );
        const input = fc
          .array(atom, { minLength: 1, maxLength: 80 })
          .map((parts) => `x${parts.join("")}`);

        fc.assert(
          fc.property(input, (value) => {
            expect(parseMboxDocument(value)).toEqual(legacyParseAutolinkOnlyDocument(value));
          }),
          { seed, numRuns },
        );
      });

      it("keeps whitespace, punctuation, parentheses, and UTF-16 edge cases unchanged", () => {
        for (const separator of ["\r", "\r\n", "\u2028", "\u2029"]) {
          const input = `http://example.com${separator}rest`;
          const [block] = parseMboxDocument(input).blocks;
          expect(block && "inline" in block ? block.inline : []).toContainEqual(
            expect.objectContaining({ type: "autoLink", urlValue: "http://example.com" }),
          );
          if (separator !== "\r\n") expect(inlineSource(input)).toBe(input);
        }

        for (const input of ["http://", "http://.", "http://x.", "http://example.com))"]) {
          expect(inlineSource(input)).toBe(input);
        }
        expect(parseMboxDocument("http://x.").blocks[0]).toMatchObject({
          inline: [{ type: "text", value: "http://x." }],
        });
        expect(parseMboxDocument("http://example.com))").blocks[0]).toMatchObject({
          inline: [
            { type: "autoLink", urlValue: "http://example.com" },
            { type: "text", value: "))" },
          ],
        });
        expect(parseMboxDocument("😀 http://example.com 😀").blocks[0]).toMatchObject({
          inline: [
            { type: "text", from: 0, to: 3, value: "😀 " },
            { type: "autoLink", from: 3, to: 21, urlValue: "http://example.com" },
            { type: "text", from: 21, to: 24, value: " 😀" },
          ],
        });
      });

      it("processes scheme-guard failures in linear time", () => {
        const input = "hxxxxxxx".repeat(18_000);
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(1_500);
        expect(document.blocks[0]).toMatchObject({ inline: [{ type: "text", value: input }] });
      });

      it("processes boundary-clearing dot-check failures in linear time", () => {
        const input = "(http://x".repeat(16_000);
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(1_500);
        expect(document.blocks[0]).toMatchObject({ inline: [{ type: "text", value: input }] });
      });

      it("caches punctuation trimming per run in linear time", () => {
        // The per-whitespace-run cache prevents every candidate from rescanning
        // this trailing punctuation; without it, the reject path is quadratic.
        const input = "(http://x".repeat(24_000) + "!".repeat(24_000);
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(1_000);
        expect(document.blocks[0]).toMatchObject({ inline: [{ type: "text", value: input }] });
      });
    });

    describe("large malformed inline prefixes", () => {
      // Test list: retain balanced autolink parentheses, trim only overclosed
      // suffixes, preserve image escape parity, and keep malformed prefixes
      // from hiding a later valid autolink.
      it("keeps balanced autolink parentheses and trims overclosed suffixes", () => {
        const balanced = parseMboxDocument("https://example.com/path(foo)").blocks[0];
        const overclosed = parseMboxDocument("https://example.com/path(foo)))").blocks[0];

        expect(balanced).toMatchObject({
          inline: [{ type: "autoLink", urlValue: "https://example.com/path(foo)" }],
        });
        expect(overclosed).toMatchObject({
          inline: [
            { type: "autoLink", urlValue: "https://example.com/path(foo)" },
            { type: "text", value: "))" },
          ],
        });
      });

      it("parses a long overclosed autolink suffix without repeated rescans", () => {
        const input = `https://example.com${")".repeat(20_000)}`;
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(500);
        expect(document.blocks[0]).toMatchObject({
          inline: [
            { type: "autoLink", urlValue: "https://example.com" },
            { type: "text", value: ")".repeat(20_000) },
          ],
        });
      });

      it("keeps long unclosed image openers as text without repeated scans", () => {
        const input = "![".repeat(20_000);
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(500);
        expect(document.blocks[0]).toMatchObject({
          inline: [{ type: "text", value: input }],
        });
      });

      it("preserves odd and even image closer escape parity", () => {
        expect(parseMboxDocument(String.raw`![odd \] label](image.png)`).blocks[0]).toMatchObject({
          inline: [{ type: "markdownImage", altValue: "odd ] label", urlValue: "image.png" }],
        });
        expect(parseMboxDocument(String.raw`![even \\](image.png)`).blocks[0]).toMatchObject({
          inline: [{ type: "markdownImage", altValue: `even ${String.fromCharCode(92)}`, urlValue: "image.png" }],
        });
        expect(parseMboxDocument(String.raw`![odd](image\).png)`).blocks[0]).toMatchObject({
          inline: [{ type: "markdownImage", altValue: "odd", urlValue: "image).png" }],
        });
        expect(parseMboxDocument(String.raw`![even](image\\)`).blocks[0]).toMatchObject({
          inline: [{ type: "markdownImage", altValue: "even", urlValue: `image${String.fromCharCode(92)}` }],
        });
      });

      it("keeps long unclosed brackets and footnote prefixes as text before a later autolink", () => {
        const input = `${"[".repeat(20_000)} ${"[^".repeat(20_000)} https://example.com`;
        const start = performance.now();
        const document = parseMboxDocument(input);

        expect(performance.now() - start).toBeLessThan(500);
        expect(document.blocks[0]).toMatchObject({
          inline: [
            { type: "text", value: `${"[".repeat(20_000)} ${"[^".repeat(20_000)} ` },
            { type: "autoLink", urlValue: "https://example.com" },
          ],
        });
      });

      it("keeps malformed image prefixes as text before later Markdown nodes", () => {
        const input = "![not-an-image] [label](url) ![alt](image.png)";

        expect(parseMboxDocument(input).blocks[0]).toMatchObject({
          inline: [
            { type: "text", value: "![not-an-image] " },
            { type: "markdownLink", labelValue: "label", urlValue: "url" },
            { type: "text", value: " " },
            { type: "markdownImage", altValue: "alt", urlValue: "image.png" },
          ],
        });
      });
    });

  });
});
