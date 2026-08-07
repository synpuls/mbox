import { describe, expect, it, vi } from "vitest";
import { adaptGfmDocument, parseGfmDocument, projectGfmInlineCodeDisplay, recoverGfmInlineCodeFences } from "./parser.js";
import type { Root } from "mdast";

const virtualCodeValue = (block: ReturnType<typeof parseGfmDocument>["codeBlocks"][number]): string => block.contentSegments.map(({ text }) => text).join("\n");

// The adapter is the heart of this notation namespace: it turns mdast's nested
// syntax tree into the flat, offset-addressed GfmDocument the per-line/lineRange
// decoration plugins consume. These tests pin the offsets the plugins rely on.
describe("parseGfmDocument (mdast -> GfmDocument adapter)", () => {
  it.each([
    ["a\n   b", "a b"],
    ["a\n    b", "a b"],
    ["a\n\tb", "a b"],
    ["a \n b", "a  b"],
    ["a  \nb", "a   b"],
    ["a\nb\nc", "a b c"],
    ["a\r\nb", "a b"],
    ["a\rb", "a b"],
    ["a\r\n    b", "a b"],
    ["a\r\n\tb", "a b"],
    ["a\n \tb", "a b"],
    [" a \n b ", " a  b "],
    ["a  \r\n\tb", "a   b"],
  ])("projects mdast inline-code values with continuation indentation removed: %j", (value, expected) => {
    expect(projectGfmInlineCodeDisplay(value)).toBe(expected);
  });

  it("recovers one-backtick code-span fences without applying single-line normalization", () => {
    const input = "x `a` y";

    expect(recoverGfmInlineCodeFences({ from: 2, to: 5 }, input)).toEqual({
      open: { from: 2, to: 3 },
      content: { from: 3, to: 4 },
      close: { from: 4, to: 5 },
    });
  });

  it("recovers two-backtick fences around content containing a backtick", () => {
    const input = "x ``a`b`` y";

    expect(recoverGfmInlineCodeFences({ from: 2, to: 9 }, input)).toEqual({
      open: { from: 2, to: 4 },
      content: { from: 4, to: 7 },
      close: { from: 7, to: 9 },
    });
  });

  it("recovers three-backtick fences", () => {
    const input = "x ```code``` y";

    expect(recoverGfmInlineCodeFences({ from: 2, to: 12 }, input)).toEqual({
      open: { from: 2, to: 5 },
      content: { from: 5, to: 9 },
      close: { from: 9, to: 12 },
    });
  });

  it.each([
    ["` a `", { open: { from: 0, to: 2 }, content: { from: 2, to: 3 }, close: { from: 3, to: 5 } }],
    ["`a `", { open: { from: 0, to: 1 }, content: { from: 1, to: 3 }, close: { from: 3, to: 4 } }],
    ["` a`", { open: { from: 0, to: 1 }, content: { from: 1, to: 3 }, close: { from: 3, to: 4 } }],
    ["`   `", { open: { from: 0, to: 1 }, content: { from: 1, to: 4 }, close: { from: 4, to: 5 } }],
    ["`  a  `", { open: { from: 0, to: 2 }, content: { from: 2, to: 5 }, close: { from: 5, to: 7 } }],
    ["`\ta\t`", { open: { from: 0, to: 1 }, content: { from: 1, to: 4 }, close: { from: 4, to: 5 } }],
    ["` \t `", { open: { from: 0, to: 2 }, content: { from: 2, to: 3 }, close: { from: 3, to: 5 } }],
  ])("applies CommonMark single-line ASCII-space padding only when both ends qualify: %j", (input, expected) => {
    expect(recoverGfmInlineCodeFences({ from: 0, to: input.length }, input)).toEqual(expected);
  });

  it.each([
    ["` a\nb `", { open: { from: 0, to: 1 }, content: { from: 1, to: 6 }, close: { from: 6, to: 7 } }],
    ["` a\r\nb `", { open: { from: 0, to: 1 }, content: { from: 1, to: 7 }, close: { from: 7, to: 8 } }],
  ])("does not apply the padding rule to a multi-line code span: %j", (input, expected) => {
    expect(recoverGfmInlineCodeFences({ from: 0, to: input.length }, input)).toEqual(expected);
  });

  it("flattens an ATX heading with its marker range and level", () => {
    const doc = parseGfmDocument("# Head");
    expect(doc.headings).toEqual([{ line: 1, from: 0, level: 1, marker: { from: 0, to: 2 } }]);
  });

  it("measures the marker width per heading level, including extra spaces", () => {
    expect(parseGfmDocument("### Deep").headings[0]).toEqual({
      line: 1,
      from: 0,
      level: 3,
      marker: { from: 0, to: 4 },
    });
  });

  it("records a setext underline's physical line and complete source range", () => {
    expect(parseGfmDocument("Title\n=====").headings).toEqual([
      {
        line: 1,
        from: 0,
        level: 1,
        marker: { from: 0, to: 0 },
        setextUnderline: { line: 2, from: 6, to: 11 },
      },
    ]);
  });

  it("keeps a setext underline physical inside blockquotes and list items", () => {
    const quote = "> Quote\n> ---";
    const list = "- List\n  ---";

    expect(parseGfmDocument(quote).headings[0]?.setextUnderline).toEqual({ line: 2, from: 8, to: 13 });
    expect(parseGfmDocument(list).headings[0]?.setextUnderline).toEqual({ line: 2, from: 7, to: 12 });
  });

  it("recognizes h2 setext headings and leaves a second underline as ordinary text", () => {
    expect(parseGfmDocument("Sub\n---").headings[0]).toMatchObject({ level: 2, setextUnderline: { line: 2, from: 4, to: 7 } });
    expect(parseGfmDocument("Title\n=====\n=====").headings).toHaveLength(1);
  });

  it("flattens nested bullet list items with a 0-based depth", () => {
    const doc = parseGfmDocument("- a\n  - b");
    expect(doc.listItems).toEqual([
      { line: 1, from: 0, depth: 0, ordered: false, bullet: { from: 0, to: 2 }, task: null },
      { line: 2, from: 6, depth: 1, ordered: false, bullet: { from: 6, to: 8 }, task: null },
    ]);
  });

  it("keeps mixed nested list items in document order with their local ordered state", () => {
    const input = "- outer\n  1. ordered\n    - inner\n- sibling";
    const doc = parseGfmDocument(input);

    expect(doc.listItems.map(({ from, depth, ordered, bullet }) => ({ from, depth, ordered, bullet }))).toEqual([
      { from: input.indexOf("- outer"), depth: 0, ordered: false, bullet: { from: 0, to: 2 } },
      { from: input.indexOf("1. ordered"), depth: 1, ordered: true, bullet: { from: 10, to: 13 } },
      { from: input.indexOf("- inner"), depth: 1, ordered: false, bullet: { from: 25, to: 27 } },
      { from: input.lastIndexOf("- sibling"), depth: 0, ordered: false, bullet: { from: 33, to: 35 } },
    ]);
  });

  it("adapts 2,000 nested blockquotes without overflowing and preserves marker offsets", () => {
    const input = `${"> ".repeat(2000)}x`;
    const doc = parseGfmDocument(input);

    expect(doc.blockquotes).toHaveLength(2000);
    expect(doc.blockquotes.map(({ depth }) => depth)).toEqual(Array.from({ length: 2000 }, (_, index) => index + 1));
    expect(doc.quoteMarkers).toHaveLength(2000);
    expect(doc.quoteMarkers[0]).toEqual({ line: 1, from: 0, to: 2, depth: 1 });
    expect(doc.quoteMarkers.at(-1)).toEqual({ line: 1, from: 3998, to: 4000, depth: 2000 });
  });

  it("adapts a deeply nested synthetic mdast list without overflowing", () => {
    const input = "- ";
    const position = {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 3, offset: input.length },
    };
    const contentPosition = {
      start: { line: 1, column: 3, offset: 2 },
      end: { line: 1, column: 3, offset: 2 },
    };
    let child: unknown = { type: "text", value: "", position };
    for (let depth = 0; depth < 2000; depth += 1) {
      child = {
        type: "list",
        ordered: depth % 2 === 1,
        start: null,
        spread: false,
        children: [{ type: "listItem", spread: false, checked: null, position, children: [{ type: "paragraph", position: contentPosition, children: [child] }] }],
        position,
      };
    }

    const doc = adaptGfmDocument({ type: "root", children: [child], position } as unknown as Root, input);

    expect(doc.listItems).toHaveLength(2000);
    expect(doc.listItems.map(({ depth }) => depth)).toEqual(Array.from({ length: 2000 }, (_, index) => index));
    expect(doc.listItems.every(({ bullet }) => bullet.to > bullet.from)).toBe(true);
    expect(doc.listItems.map(({ ordered }) => ordered)).toEqual(Array.from({ length: 2000 }, (_, index) => index % 2 === 0));
  });

  it("gives a bare marker with no trailing whitespace a non-empty bullet range", () => {
    // CommonMark accepts a marker alone as a valid empty list item, but
    // remark/mdast's own recognition is more permissive than the adapter's
    // marker-width regex, which required trailing whitespace. That mismatch
    // used to leave `bullet.from === bullet.to`, which lost the marker's
    // syntax range before decoration lowering normalized the empty replace.
    const doc = parseGfmDocument("-\nplain");
    expect(doc.listItems[0]?.bullet).toEqual({ from: 0, to: 1 });
  });

  it("splits a task-list item into its bullet and checkbox ranges with checked state", () => {
    const doc = parseGfmDocument("- [ ] todo\n- [x] done");
    expect(doc.listItems).toEqual([
      {
        line: 1,
        from: 0,
        depth: 0,
        ordered: false,
        bullet: { from: 0, to: 2 },
        task: { marker: { from: 2, to: 6 }, checked: false },
      },
      {
        line: 2,
        from: 11,
        depth: 0,
        ordered: false,
        bullet: { from: 11, to: 13 },
        task: { marker: { from: 13, to: 17 }, checked: true },
      },
    ]);
  });

  it("captures a fenced code block with its fence, info and interior offsets", () => {
    const doc = parseGfmDocument("```js\ncode\n```");
    expect(doc.codeBlocks).toEqual([
      {
        from: 0,
        to: 14,
        firstLine: 1,
        lastLine: 3,
        fenced: true,
        openingFence: { from: 0, to: 3 },
        info: { from: 3, to: 5 },
        lang: "js",
        meta: null,
        infoValue: "js",
        language: { id: "js", span: { from: 3, to: 5 } },
        content: { from: 6, to: 11 },
        contentSegments: [{ from: 6, to: 10, text: "code" }],
        value: "code",
        closingFence: { from: 11, to: 14 },
      },
    ]);
  });

  it("derives the GFM language id and its absolute raw source span from one info-string decision", () => {
    const block = parseGfmDocument("```&#10;ts\nconst x = 1;\n```").codeBlocks[0]!;

    expect(block.language).toEqual({ id: "ts", span: { from: 8, to: 10 } });
  });

  it("reports a language span as an absolute document range after a preceding paragraph", () => {
    const input = "para\n\n```&#32;ts\nx\n```";
    const block = parseGfmDocument(input).codeBlocks[0]!;

    expect(block.language).toEqual({ id: "ts", span: { from: 14, to: 16 } });
    expect(input.slice(block.language!.span.from, block.language!.span.to)).toBe("ts");
  });

  it.each([
    ["ts", { id: "ts", span: { from: 3, to: 5 } }],
    ["&#116;&#115;", { id: "ts", span: { from: 3, to: 15 } }],
    ["&#32;ts", { id: "ts", span: { from: 8, to: 10 } }],
    ["ts&#32;title", { id: "ts", span: { from: 3, to: 5 } }],
    ["&#9;ts", { id: "ts", span: { from: 7, to: 9 } }],
    ["&#13;ts", { id: "ts", span: { from: 8, to: 10 } }],
    ["&#10;math", { id: "math", span: { from: 8, to: 12 } }],
    ["&#11;ts", { id: "\ufffdts", span: { from: 3, to: 10 } }],
    ["&#12;ts", { id: "\fts", span: { from: 3, to: 10 } }],
    ["&nbsp;ts", { id: "\u00a0ts", span: { from: 3, to: 11 } }],
    ["c&#43;&#43;", { id: "c++", span: { from: 3, to: 14 } }],
    ["&amp;#116;&#115;", { id: "&#116;s", span: { from: 3, to: 19 } }],
    [String.raw`foo\+bar`, { id: "foo+bar", span: { from: 3, to: 11 } }],
  ])("matches GitHub's decoded info-token boundary for %s", (infoValue, language) => {
    const [block] = parseGfmDocument(`\`\`\`${infoValue}\nx\n\`\`\``).codeBlocks;

    expect(block.language).toEqual(language);
  });

  it("falls back to mdast's decoded language with the raw first-token span when the unit decoder disagrees with its whole-string authority", async () => {
    vi.resetModules();
    vi.doMock("micromark-util-decode-string", async (importOriginal) => {
      const actual = await importOriginal<typeof import("micromark-util-decode-string")>();
      return {
        ...actual,
        decodeString(value: string): string {
          return value === "&amp;" ? "broken" : actual.decodeString(value);
        },
      };
    });

    try {
      const { parseGfmDocument: parseWithDivergentUnitDecoder } = await import("./parser.js");
      const [block] = parseWithDivergentUnitDecoder("```&amp;ts\nx\n```").codeBlocks;

      expect(block.lang).toBe("&ts");
      expect(block.language).toEqual({ id: "&ts", span: { from: 3, to: 10 } });
    } finally {
      vi.doUnmock("micromark-util-decode-string");
      vi.resetModules();
    }
  });

  it("returns no fallback language when an inconsistent decoder meets mdast's null lang", async () => {
    vi.resetModules();
    vi.doMock("micromark-util-decode-string", async (importOriginal) => {
      const actual = await importOriginal<typeof import("micromark-util-decode-string")>();
      return {
        ...actual,
        decodeString(value: string): string {
          return value === "" ? "broken" : actual.decodeString(value);
        },
      };
    });

    try {
      const { parseGfmDocument: parseWithDivergentUnitDecoder } = await import("./parser.js");
      const [block] = parseWithDivergentUnitDecoder("```\nx\n```").codeBlocks;

      expect(block.lang).toBeNull();
      expect(block.language).toBeNull();
    } finally {
      vi.doUnmock("micromark-util-decode-string");
      vi.resetModules();
    }
  });

  it("marks an unterminated fenced block with a null closing fence", () => {
    const block = parseGfmDocument("```\nabc").codeBlocks[0];
    expect(block.fenced).toBe(true);
    expect(block.closingFence).toBeNull();
    expect(block.content).toEqual({ from: 4, to: 7 });
  });

  it("supports CRLF input without emitting an out-of-bounds code-block segment", () => {
    const input = "```ts\r\nconst a = 1;\r\n```";
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(block).toMatchObject({
      fenced: true,
      value: "const a = 1;",
      content: { from: 7, to: 21 },
      contentSegments: [{ from: 7, to: 19, text: "const a = 1;" }],
      closingFence: { from: 21, to: 24 },
    });
    expect(block.contentSegments.every(({ from, to }) => from >= 0 && to <= input.length)).toBe(true);
  });

  it.each([
    ["an empty line between content lines", "```ts\nconst a = 1;\n\nconst b = 2;\n```", "const a = 1;\n\nconst b = 2;"],
    ["a leading empty line", "```ts\n\nconst a = 1;\n```", "\nconst a = 1;"],
    ["a trailing empty line", "```ts\nconst a = 1;\n\n```", "const a = 1;\n"],
    ["several consecutive empty lines", "```ts\nlet a=1\n\n\nlet b=2\n```", "let a=1\n\n\nlet b=2"],
    ["an empty block", "```ts\n```", ""],
    ["an unterminated block", "```ts\nconst a = 1;\n\nconst b = 2;", "const a = 1;\n\nconst b = 2;"],
    ["a blockquote block", "> ```ts\n> const a = 1;\n> \n> const b = 2;\n> ```", "const a = 1;\n\nconst b = 2;"],
    ["a list block", "- item\n\n  ```ts\n  const a = 1;\n  \n  const b = 2;\n  ```", "const a = 1;\n\nconst b = 2;"],
    ["mixed tab and space indentation", "- item\n\n  \t```ts\n  \tconst a = 1;\n  \t\n  \tconst b = 2;\n  \t```", "const a = 1;\n\nconst b = 2;"],
    ["non-BMP source", "```ts\nconst emoji = '😀';\n\n```", "const emoji = '😀';\n"],
  ])("makes contentSegments reproduce value for %s", (_description, input, value) => {
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(block.value).toBe(value);
    expect(virtualCodeValue(block)).toBe(block.value);
  });

  it("does not mistake an unterminated code line ending in a fence run for a closing fence", () => {
    const block = parseGfmDocument("```\nabc ```").codeBlocks[0];

    expect(block.closingFence).toBeNull();
    expect(block.value).toBe("abc ```");
  });

  it.each([
    ["a quote-prefixed code line outside a blockquote", "```ts\nconst a=1\n> ```", null, "> ```"],
    ["a blockquoted fence", "> ```ts\n> const a=1\n> ```", 22, "const a=1"],
    ["a nested blockquoted fence", "> > ```ts\n> > const a=1\n> > ```", 28, "const a=1"],
    ["a list-item fence", "- item\n\n  ```ts\n  const a=1\n  ```", 30, "const a=1"],
    ["a closing fence indented by three spaces", "```ts\nconst a=1\n   ```", 19, "const a=1"],
    ["a four-space-indented code line", "```ts\nconst a=1\n    ```", null, "    ```"],
    ["a closing run shorter than the opening fence", "````ts\nconst a=1\n```", null, "```"],
  ])("uses mdast's value-line mapping for %s", (_description, input, closingFenceFrom, lastValueLine) => {
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(block.closingFence?.from ?? null).toBe(closingFenceFrom);
    expect(block.value.split("\n").at(-1)).toBe(lastValueLine);
  });

  it("treats an indented code block as unfenced", () => {
    const block = parseGfmDocument("    indented").codeBlocks[0];
    expect(block.fenced).toBe(false);
    expect(block.closingFence).toBeNull();
  });

  it("recovers a blockquoted fenced block without consuming its quote markers", () => {
    const input = "> ```ts\n> const a = 1;\n> ```";
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(block).toMatchObject({
      fenced: true,
      openingFence: { from: 2, to: 5 },
      infoValue: "ts",
      closingFence: { from: 25, to: 28 },
    });
  });

  it.each([
    ["an indented fence", "  ```ts\n  const a = 1;\n  ```", "  const a = 1;\n  "],
    ["a list-item fence", "- item\n\n  ```ts\n  const a = 1;\n  ```", "  const a = 1;\n  "],
    ["a tab-indented list-item fence", "- item\n\n  \t```ts\n  \tconst a = 1;\n  \t```", "  \tconst a = 1;\n  \t"],
    ["a blockquoted fence", "> ```ts\n> const a = 1;\n> ```", "> const a = 1;\n> "],
  ])("keeps %s content as its raw contiguous source interior", (_description, input, rawInterior) => {
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(input.slice(block.content.from, block.content.to)).toBe(rawInterior);
    expect(block.value).toBe("const a = 1;");
    expect(block.contentSegments).toEqual([
      { from: input.indexOf("const a = 1;"), to: input.indexOf("const a = 1;") + "const a = 1;".length, text: "const a = 1;" },
    ]);
  });

  it.each([
    ["> ~~~ts\n> const a = 1;\n> ~~~", "ts"],
    ["- a\n  - b\n\n    ~~~math\n    x^2\n    ~~~", "math"],
  ])("recognizes a container-prefixed tilde fence", (input, lang) => {
    const [block] = parseGfmDocument(input).codeBlocks;

    expect(block).toMatchObject({ fenced: true, lang, infoValue: lang });
  });

  it("recovers a deeply nested fenced block's language from mdast", () => {
    const [block] = parseGfmDocument("- a\n  - b\n\n    ```math\n    x^2\n    ```").codeBlocks;

    expect(block).toMatchObject({ fenced: true, lang: "math", infoValue: "math" });
  });

  it("emits NO inline styles for content inside a fenced code block (tree literal protection)", () => {
    const doc = parseGfmDocument("```\n*not emphasis*\n```");
    expect(doc.inlineStyles).toEqual([]);
    expect(doc.codeBlocks).toHaveLength(1);
  });

  it("captures a blockquote container and its per-line `>` marker", () => {
    const doc = parseGfmDocument("> hi");
    expect(doc.blockquotes).toEqual([{ from: 0, to: 4, depth: 1 }]);
    expect(doc.quoteMarkers).toEqual([{ line: 1, from: 0, to: 2, depth: 1 }]);
  });

  it("captures nested `>>` as two markers with ascending depth", () => {
    const doc = parseGfmDocument("> a\n>> b");
    expect(doc.blockquotes.map((block) => block.depth)).toEqual([1, 2]);
    expect(doc.quoteMarkers).toEqual([
      { line: 1, from: 0, to: 2, depth: 1 },
      { line: 2, from: 4, to: 5, depth: 1 },
      { line: 2, from: 5, to: 7, depth: 2 },
    ]);
  });

  it("keeps a lazy-continuation line inside the quote container with no marker of its own", () => {
    const doc = parseGfmDocument("> a\nb");
    expect(doc.blockquotes).toEqual([{ from: 0, to: 5, depth: 1 }]);
    // Only the first line carries a `>`; the lazy line `b` has none.
    expect(doc.quoteMarkers).toEqual([{ line: 1, from: 0, to: 2, depth: 1 }]);
  });

  it("flattens emphasis / strong / strikethrough with open, close and content ranges", () => {
    expect(parseGfmDocument("a *b* c").inlineStyles).toEqual([
      { type: "emphasis", startLine: 1, endLine: 1, open: { from: 2, to: 3 }, content: { from: 3, to: 4 }, close: { from: 4, to: 5 } },
    ]);
    expect(parseGfmDocument("a **b** c").inlineStyles).toEqual([
      { type: "strong", startLine: 1, endLine: 1, open: { from: 2, to: 4 }, content: { from: 4, to: 5 }, close: { from: 5, to: 7 } },
    ]);
    expect(parseGfmDocument("a ~~b~~ c").inlineStyles).toEqual([
      { type: "delete", startLine: 1, endLine: 1, open: { from: 2, to: 4 }, content: { from: 4, to: 5 }, close: { from: 5, to: 7 } },
    ]);
  });

  it("records a strong span inside a table cell", () => {
    expect(parseGfmDocument("| **bold** |\n| --- |").inlineStyles).toEqual([
      { type: "strong", startLine: 1, endLine: 1, open: { from: 2, to: 4 }, content: { from: 4, to: 8 }, close: { from: 8, to: 10 } },
    ]);
  });

  it("records an emphasis span that crosses a line break with distinct start and end lines", () => {
    const doc = parseGfmDocument("x *a\nb* y");
    expect(doc.inlineStyles).toEqual([
      { type: "emphasis", startLine: 1, endLine: 2, open: { from: 2, to: 3 }, content: { from: 3, to: 6 }, close: { from: 6, to: 7 } },
    ]);
  });

  it("flattens a bracketed markdown link with its text range and url", () => {
    const doc = parseGfmDocument("[t](u)");
    expect(doc.links).toEqual([
      { from: 0, to: 6, textFrom: 1, textTo: 2, text: "t", label: [{ kind: "text", from: 0, to: 1 }], labelSource: "t", url: "u", autolink: false, startLine: 1, endLine: 1, inTableCell: false },
    ]);
  });

  it("keeps link-label ranges relative to the label source", () => {
    const link = parseGfmDocument("before [*text*](u)").links[0];

    expect(link.labelSource).toBe("*text*");
    expect(link.label).toEqual([
      {
        kind: "emphasis",
        from: 0,
        to: 6,
        children: [{ kind: "text", from: 1, to: 5 }],
      },
    ]);
  });

  it("flattens a GFM www-autolink, marking it autolink with the resolved url", () => {
    const doc = parseGfmDocument("www.example.com");
    expect(doc.links).toHaveLength(1);
    const link = doc.links[0];
    expect(link.autolink).toBe(true);
    expect(link.from).toBe(0);
    expect(link.to).toBe(15);
    expect(link.url.startsWith("http")).toBe(true);
  });

  it("recovers an inline code span's backtick fences from the source (mdast omits the count)", () => {
    // `a` is at offsets 2..5 (`` ` ``, `a`, `` ` ``); the fences are one char each.
    expect(parseGfmDocument("x `a` y").inlineCodes).toEqual([
      { open: { from: 2, to: 3 }, content: { from: 3, to: 4 }, close: { from: 4, to: 5 }, startLine: 1, endLine: 1 },
    ]);
  });

  it("recovers a multi-backtick code span's fences", () => {
    // ``a`b`` — two opening and two closing backticks around `a`b`.
    const code = parseGfmDocument("``a`b``").inlineCodes[0];
    expect(code.open).toEqual({ from: 0, to: 2 });
    expect(code.close).toEqual({ from: 5, to: 7 });
    expect(code.content).toEqual({ from: 2, to: 5 });
  });

  it("flattens an image node with its url, alt and whole-run offsets", () => {
    expect(parseGfmDocument("![alt](u)").images).toEqual([{ from: 0, to: 9, url: "u", alt: "alt", line: 1, inTableCell: false }]);
  });

  it("records table link and image widgets while preserving outside nodes", () => {
    const input = "[outside](https://outside.example) ![outside](https://outside.example/i.png)\n\n| [inside](https://inside.example) | ![inside](https://inside.example/i.png) |\n| --- | --- |";
    const doc = parseGfmDocument(input);

    expect(doc.links).toEqual([
      expect.objectContaining({ url: "https://outside.example", from: 0 }),
      expect.objectContaining({ url: "https://inside.example", inTableCell: true }),
    ]);
    expect(doc.images).toEqual([
      expect.objectContaining({ url: "https://outside.example/i.png", alt: "outside" }),
      expect.objectContaining({ url: "https://inside.example/i.png", alt: "inside", inTableCell: true }),
    ]);
  });

  it("keeps an outer table-cell strong span while recording nested links without their label styles", () => {
    const outerStrong = parseGfmDocument("| **[link](url)** |\n| --- |");
    expect(outerStrong.inlineStyles).toHaveLength(1);
    expect(outerStrong.inlineStyles[0]).toMatchObject({ type: "strong" });
    expect(outerStrong.links).toMatchObject([{ text: "link", inTableCell: true }]);

    const labelStrong = parseGfmDocument("| [**bold** label](url) |\n| --- |");
    expect(labelStrong.links).toMatchObject([{ text: "bold label", inTableCell: true }]);
    expect(labelStrong.inlineStyles).toEqual([]);
  });

  it("flattens a thematic break with its line and offsets", () => {
    expect(parseGfmDocument("a\n\n---\n\nb").thematicBreaks).toEqual([{ line: 3, from: 3, to: 6 }]);
  });

  it("collects backslash escapes as the backslash's own range", () => {
    expect(parseGfmDocument("\\*not emphasis\\*").escapes).toEqual([
      { line: 1, from: 0, to: 1 },
      { line: 1, from: 14, to: 15 },
    ]);
  });

  it("ignores backslashes that escape nothing or sit inside code", () => {
    expect(parseGfmDocument("a \\q b").escapes).toEqual([]);
    expect(parseGfmDocument("`\\*`").escapes).toEqual([]);
    expect(parseGfmDocument("```\n\\*raw\n```").escapes).toEqual([]);
  });

  it("a double backslash is one escape, and lines are tracked across soft breaks", () => {
    expect(parseGfmDocument("\\\\*em*").escapes).toEqual([{ line: 1, from: 0, to: 1 }]);
    expect(parseGfmDocument("plain\nthen \\*here").escapes).toEqual([{ line: 2, from: 11, to: 12 }]);
  });

  it("collects footnote references with their marker run and label", () => {
    expect(parseGfmDocument("text[^1] more\n\n[^1]: note").footnoteReferences).toEqual([
      { line: 1, from: 4, to: 8, identifier: "1", label: "1" },
    ]);
  });

  it("collects footnote definitions with marker range, body text and line span", () => {
    const doc = parseGfmDocument("text[^1]\n\n[^1]: the note\n    continues");
    expect(doc.footnoteDefinitions).toEqual([
      {
        identifier: "1",
        label: "1",
        from: 10,
        to: 38,
        startLine: 3,
        endLine: 4,
        marker: { from: 10, to: 15 },
        text: "the note continues",
      },
    ]);
  });

  it("keeps a definition's whitespace-collapsed tooltip text while traversing paragraph phrasing", () => {
    const doc = parseGfmDocument("[^a]: **first** and `code`\n\n    [second](https://example.com)");

    expect(doc.footnoteDefinitions[0]?.text).toBe("**first** and `code` [second](https://example.com)");
  });

  it("uses the padded code-span content range while traversing a footnote definition paragraph", () => {
    expect(parseGfmDocument("[^a]: ` code `").inlineCodes).toEqual([
      { open: { from: 6, to: 8 }, content: { from: 8, to: 12 }, close: { from: 12, to: 14 }, startLine: 1, endLine: 1 },
    ]);
  });

  it("treats an undefined reference as plain text, but keeps an orphan definition", () => {
    // GFM only parses `[^x]` as a reference when a matching definition exists.
    expect(parseGfmDocument("only[^x]").footnoteReferences).toEqual([]);
    expect(parseGfmDocument("[^y]: orphan").footnoteDefinitions).toHaveLength(1);
  });

  it("records a backslash hard break, flagging the backslash form", () => {
    const doc = parseGfmDocument("a\\\nb");
    expect(doc.hardBreaks).toEqual([{ line: 1, from: 1, backslash: true }]);
  });

  it("splits a pipe table into header, delimiter and body rows with pipe-separated cells", () => {
    const doc = parseGfmDocument("| A | B |\n|:--|--:|\n| 1 | 2 |");
    expect(doc.tables).toHaveLength(1);
    const table = doc.tables[0];
    expect(table.line).toBe(1);
    expect(table.align).toEqual(["left", "right"]);
    expect(table.header.cells).toEqual([
      { from: 1, to: 4, content: { from: 2, to: 3 }, value: "A", displayValue: "A" },
      { from: 5, to: 8, content: { from: 6, to: 7 }, value: "B", displayValue: "B" },
    ]);
    // The delimiter is line 2 (offset 10..19), which mdast itself does not emit.
    expect(table.delimiter.cells.map((cell) => cell.value)).toEqual([":--", "--:"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells.map((cell) => cell.value)).toEqual(["1", "2"]);
  });

  it("ends a table before a lone pipe body line", () => {
    const doc = parseGfmDocument("| a | b |\n| --- | --- |\n| 1 | 2 |\n|");

    expect(doc.tables[0]?.rows).toHaveLength(1);
  });

  it("never exposes a reversed table-cell range after a lone pipe body line", () => {
    const doc = parseGfmDocument("| a | b |\n| --- | --- |\n| 1 | 2 |\n|");

    for (const table of doc.tables) {
      for (const row of [table.header, table.delimiter, ...table.rows]) {
        for (const cell of row.cells) {
          expect(cell.from).toBeLessThanOrEqual(cell.to);
          expect(cell.content.from).toBeLessThanOrEqual(cell.content.to);
        }
      }
    }
  });

  it("keeps a double-pipe body line as one zero-width physical cell", () => {
    const table = parseGfmDocument("| a | b |\n| --- | --- |\n||").tables[0]!;

    expect(table.rows[0]?.cells).toEqual([
      { from: 25, to: 25, content: { from: 25, to: 25 }, value: "", displayValue: "" },
    ]);
  });

  it("keeps an escaped pipe inside a GFM table cell", () => {
    const doc = parseGfmDocument("| a \\| b | c |\n| --- | --- |\n| x | y |");
    const table = doc.tables[0];

    expect(table.header.cells.map((cell) => cell.value)).toEqual(["a \\| b", "c"]);
    expect(table.header.cells).toHaveLength(2);
    // This differentially checks our row scanner against mdast; cell values and lengths are the primary guards.
    expect(table.header.cells.length).toBe(table.align.length);
  });

  it("keeps the escaped-pipe table's header cell count", () => {
    const table = parseGfmDocument("| a \\| b | c | d |\n| --- | --- | --- |\n| x | y | z |").tables[0];

    expect(table.header.cells).toHaveLength(3);
  });

  it("keeps the escaped-pipe table's header columns aligned with mdast", () => {
    const table = parseGfmDocument("| a \\| b | c | d |\n| --- | --- | --- |\n| x | y | z |").tables[0];

    // mdast rejects a table when header and delimiter counts differ; this only catches scanner disagreement.
    expect(table.header.cells.length).toBe(table.align.length);
  });

  it("keeps an escaped pipe inside a code span in one GFM table cell", () => {
    const doc = parseGfmDocument("| `a\\|b` | c |\n| --- | --- |\n| x | y |");
    const table = doc.tables[0];

    expect(table.header.cells.map((cell) => cell.value)).toEqual(["`a\\|b`", "c"]);
    expect(table.header.cells.length).toBe(table.align.length);
  });

  it("uses the preceding backslash run's parity to split GFM table cells", () => {
    const even = parseGfmDocument(String.raw`| a \\| b | c |
| --- | --- | --- |
| x | y | z |`).tables[0];
    const odd = parseGfmDocument(String.raw`| a \\\| b | c |
| --- | --- |
| x | y |`).tables[0];

    expect(even.header.cells.map((cell) => cell.value)).toEqual([String.raw`a \\`, "b", "c"]);
    expect(even.header.cells.length).toBe(even.align.length);
    expect(odd.header.cells.map((cell) => cell.value)).toEqual([String.raw`a \\\| b`, "c"]);
    expect(odd.header.cells.length).toBe(odd.align.length);
  });

  it("does not treat escaped pipes at GFM table row edges as cell boundaries", () => {
    const leading = parseGfmDocument("\\| a | b\n| --- | --- |\n| x | y |").tables[0];
    const trailing = parseGfmDocument("| a | b \\|\n| --- | --- |\n| x | y \\|").tables[0];

    expect(leading.header.cells.map((cell) => cell.value)).toEqual(["\\| a", "b"]);
    expect(leading.header.cells.length).toBe(leading.align.length);
    expect(trailing.header.cells.map((cell) => cell.value)).toEqual(["a", "b \\|"]);
    expect(trailing.rows[0].cells.map((cell) => cell.value)).toEqual(["x", "y \\|"]);
    expect(trailing.header.cells.length).toBe(trailing.align.length);
  });

  it("applies escaped-pipe splitting to GFM table body rows", () => {
    const table = parseGfmDocument("| a | b |\n| --- | --- |\n| x \\| y | z |").tables[0];

    expect(table.rows[0].cells.map((cell) => cell.value)).toEqual(["x \\| y", "z"]);
    expect(table.rows[0].cells.length).toBe(table.align.length);
  });

  it("keeps UTF-16 offsets intact around an astral character and escaped pipe", () => {
    const doc = parseGfmDocument("| 😀a \\| b | c |\n| --- | --- |\n| x | y |");
    const table = doc.tables[0];

    expect(table.header.cells).toEqual([
      { from: 1, to: 11, content: { from: 2, to: 10 }, value: "😀a \\| b", displayValue: "😀a | b" },
      { from: 12, to: 15, content: { from: 13, to: 14 }, value: "c", displayValue: "c" },
    ]);
    expect(table.header.cells.length).toBe(table.align.length);
  });

  it("rejects a table whose delimiter row contains an escaped pipe, matching mdast detection", () => {
    const doc = parseGfmDocument("| a | b |\n| --- \\| --- | --- |\n| x | y |");

    expect(doc.tables).toEqual([]);
  });

  it("keeps astral-character table cell values and UTF-16 offsets intact", () => {
    const doc = parseGfmDocument("| 😀a | b |\n| --- | --- |\n| x | y |");

    expect(doc.tables[0].header.cells).toEqual([
      { from: 1, to: 6, content: { from: 2, to: 5 }, value: "😀a", displayValue: "😀a" },
      { from: 7, to: 10, content: { from: 8, to: 9 }, value: "b", displayValue: "b" },
    ]);
  });

  it("keeps earlier cells intact when an astral character appears in a later cell", () => {
    const doc = parseGfmDocument("| a | 😀b | c |\n| --- | --- | --- |\n| x | y | z |");

    expect(doc.tables[0].header.cells).toEqual([
      { from: 1, to: 4, content: { from: 2, to: 3 }, value: "a", displayValue: "a" },
      { from: 5, to: 10, content: { from: 6, to: 9 }, value: "😀b", displayValue: "😀b" },
      { from: 11, to: 14, content: { from: 12, to: 13 }, value: "c", displayValue: "c" },
    ]);
  });

  it("keeps combining marks and surrogate pairs in their table cells", () => {
    const doc = parseGfmDocument("| e\u0301 | 😀 | 𐐷 |\n| --- | --- | --- |\n| x | y | z |");

    expect(doc.tables[0].header.cells).toEqual([
      { from: 1, to: 5, content: { from: 2, to: 4 }, value: "e\u0301", displayValue: "e\u0301" },
      { from: 6, to: 10, content: { from: 7, to: 9 }, value: "😀", displayValue: "😀" },
      { from: 11, to: 15, content: { from: 12, to: 14 }, value: "𐐷", displayValue: "𐐷" },
    ]);
  });

  it("records text-shaped inline nodes and their display projection inside table cells", () => {
    const doc = parseGfmDocument("| **bold _and_ italic** | ~~gone~~ | `code` |\n| --- | --- | --- |");

    expect(doc.inlineStyles).toEqual([
      { type: "strong", startLine: 1, endLine: 1, open: { from: 2, to: 4 }, content: { from: 4, to: 21 }, close: { from: 21, to: 23 } },
      { type: "emphasis", startLine: 1, endLine: 1, open: { from: 9, to: 10 }, content: { from: 10, to: 13 }, close: { from: 13, to: 14 } },
      { type: "delete", startLine: 1, endLine: 1, open: { from: 26, to: 28 }, content: { from: 28, to: 32 }, close: { from: 32, to: 34 } },
    ]);
    expect(doc.inlineCodes).toEqual([
      { open: { from: 37, to: 38 }, content: { from: 38, to: 42 }, close: { from: 42, to: 43 }, startLine: 1, endLine: 1 },
    ]);
    expect(doc.tables[0].header.cells.map((cell) => cell.displayValue)).toEqual(["bold and italic", "gone", "code"]);
  });

  it("projects stripped code-span padding into a table cell's display value", () => {
    const doc = parseGfmDocument("| ` a ` | b |\n| --- | --- |");

    expect(doc.tables[0].header.cells.map((cell) => cell.displayValue)).toEqual(["a", "b"]);
  });

  it("records a table escape exactly once at the backslash's UTF-16 range", () => {
    const input = "| **😀\\|** |\n| --- |";
    const doc = parseGfmDocument(input);

    expect(doc.escapes).toEqual([{ line: 1, from: 6, to: 7 }]);
    expect(doc.tables[0].header.cells[0]).toMatchObject({
      content: { from: 2, to: 10 },
      value: "**😀\\|**",
      displayValue: "😀|",
    });
  });

  it("projects an in-cell footnote reference to its idle chip label", () => {
    const doc = parseGfmDocument("| ref[^1] | b |\n| --- | --- |\n| x | y |\n\n[^1]: note");

    expect(doc.footnoteReferences).toEqual([{ line: 1, from: 5, to: 9, identifier: "1", label: "1" }]);
    expect(doc.tables[0].header.cells.map((cell) => cell.displayValue)).toEqual(["ref1", "b"]);
  });

  it("records table link/image widgets with their rendered-text projections", () => {
    const doc = parseGfmDocument("| [*label*](u) | ![alt](i.png) |\n| --- | --- |");

    expect(doc.links).toMatchObject([{ text: "label", inTableCell: true }]);
    expect(doc.images).toMatchObject([{ alt: "alt", inTableCell: true }]);
    expect(doc.inlineStyles).toEqual([]);
    expect(doc.tables[0].header.cells.map((cell) => cell.displayValue)).toEqual(["label", "alt"]);
  });

  it("uses empty-link source as the shared widget and table-cell projection", () => {
    const outside = parseGfmDocument("[](https://example.com)");
    expect(outside.links[0].text).toBe("[](https://example.com)");

    const table = parseGfmDocument("| [](javascript:alert(1)) | b |\n| --- | --- |");
    const link = table.links[0];
    const displayValue = table.tables[0].header.cells[0].displayValue;
    expect(link.text).toBe("[](javascript:alert(1))");
    expect(displayValue).toBe(link.text);
  });

  it("projects escaped link labels and an alt-less image URL inside table cells", () => {
    const doc = parseGfmDocument("| [a \\| b](u) | ![](image.png) |\n| --- | --- |");

    expect(doc.links).toMatchObject([{ text: "a | b", inTableCell: true }]);
    expect(doc.images).toMatchObject([{ alt: "", url: "image.png", inTableCell: true }]);
    expect(doc.tables[0].header.cells.map((cell) => cell.displayValue)).toEqual(["a | b", "image.png"]);
  });
});

describe("GfmTableCell.hasImage", () => {
  function cells(doc: string) {
    return parseGfmDocument(doc).tables[0]!.rows[0]!.cells;
  }

  const table = (body: string) => `| a | b |\n| --- | --- |\n${body}`;

  it("marks a cell holding nothing but an image", () => {
    expect(cells(table("| ![alt](/i.png) | b |"))[0]).toMatchObject({ hasImage: true });
  });

  it("marks a cell mixing an image with text", () => {
    expect(cells(table("| before ![alt](/i.png) after | b |"))[0]).toMatchObject({ hasImage: true });
  });

  it("marks a cell once however many images it holds", () => {
    // The flag is a fact, not a count: a consumer reserving room reserves it
    // once, so two images in a cell must not read differently from one.
    expect(cells(table("| ![a](/1.png)![b](/2.png) | b |"))[0]).toMatchObject({ hasImage: true });
  });

  it("marks a cell whose image sits inside emphasis", () => {
    // Emphasis does not replace the run, so the image is still decorated on
    // its own.
    expect(cells(table("| **![alt](/i.png)** | b |"))[0]).toMatchObject({ hasImage: true });
  });

  it("marks a cell whose image sits inside a link label", () => {
    // The image is drawn inside the link's anchor, so it takes up the cell
    // exactly as a bare one does and the column needs the same room. This was
    // the other way round while such an image was flattened to its alt text.
    expect(cells(table("| [![alt](/i.png)](/page) | b |"))[0]).toMatchObject({ hasImage: true });
  });

  it("leaves a text-only cell unmarked", () => {
    expect(cells(table("| plain | b |"))[0]!.hasImage).toBeUndefined();
  });

  it("says nothing about how the image will be rendered", () => {
    // The parser is cached per state and never sees plugin options; the flag
    // has to mean the same thing whichever render mode is configured.
    const withImage = cells(table("| ![alt](/i.png) | b |"))[0]!;

    expect(Object.keys(withImage)).not.toContain("renderMode");
    expect(withImage.hasImage).toBe(true);
  });
});

// A table inside a blockquote. The cell scanner is handed whole physical lines,
// so the `> ` prefix used to become the first cell and push every real column
// one place right.
describe("a table inside a blockquote", () => {
  function table(doc: string) {
    return parseGfmDocument(doc).tables[0]!;
  }

  it("does not turn the quote marker into a cell", () => {
    const quoted = table("> | a | b |\n> | --- | --- |\n> | 1 | 2 |");

    expect(quoted.header.cells.map((cell) => cell.value)).toEqual(["a", "b"]);
    expect(quoted.delimiter.cells.map((cell) => cell.value)).toEqual(["---", "---"]);
    expect(quoted.rows[0]!.cells.map((cell) => cell.value)).toEqual(["1", "2"]);
  });

  it("keeps the cells' offsets pointing past the marker", () => {
    // Offsets are absolute document positions; a cell that still started at the
    // line start would decorate the `>` itself.
    const quoted = table("> | a | b |\n> | --- | --- |");
    const first = quoted.header.cells[0]!;

    expect(first.from).toBeGreaterThanOrEqual(2);
    expect("> | a | b |".slice(first.content.from, first.content.to)).toBe("a");
  });

  it("handles a nested blockquote the same way", () => {
    const nested = table(">> | a | b |\n>> | --- | --- |\n>> | 1 | 2 |");

    expect(nested.header.cells.map((cell) => cell.value)).toEqual(["a", "b"]);
    expect(nested.rows[0]!.cells.map((cell) => cell.value)).toEqual(["1", "2"]);
  });

  it("handles a marker with no space after it", () => {
    const tight = table(">| a | b |\n>| --- | --- |");

    expect(tight.header.cells.map((cell) => cell.value)).toEqual(["a", "b"]);
  });

  it("leaves an unquoted table's offsets where they were", () => {
    const source = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    const plain = table(source);
    const first = plain.header.cells[0]!;

    expect(plain.header.cells.map((cell) => cell.value)).toEqual(["a", "b"]);
    // A cell's span starts after the opening pipe, as it always did.
    expect(first.from).toBe(1);
    expect(source.slice(first.content.from, first.content.to)).toBe("a");
  });

  it("keeps a leading `>` that is not a quote marker as content", () => {
    // Here the `>` is inside a cell, not a blockquote prefix, so it stays.
    const arrow = table("| > a | b |\n| --- | --- |");

    expect(arrow.header.cells.map((cell) => cell.value)).toEqual(["> a", "b"]);
  });
});
