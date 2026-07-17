import { describe, expect, it } from "vitest";
import { adaptGfmDocument, parseGfmDocument } from "./parser.js";
import type { Root } from "mdast";

// The adapter is the heart of this notation namespace: it turns mdast's nested
// syntax tree into the flat, offset-addressed GfmDocument the per-line/lineRange
// decoration plugins consume. These tests pin the offsets the plugins rely on.
describe("parseGfmDocument (mdast -> GfmDocument adapter)", () => {
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
        infoValue: "js",
        content: { from: 6, to: 10 },
        value: "code",
        closingFence: { from: 11, to: 14 },
      },
    ]);
  });

  it("marks an unterminated fenced block with a null closing fence", () => {
    const block = parseGfmDocument("```\nabc").codeBlocks[0];
    expect(block.fenced).toBe(true);
    expect(block.closingFence).toBeNull();
    expect(block.content).toEqual({ from: 4, to: 7 });
  });

  it("treats an indented code block as unfenced", () => {
    const block = parseGfmDocument("    indented").codeBlocks[0];
    expect(block.fenced).toBe(false);
    expect(block.closingFence).toBeNull();
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

  it("records an emphasis span that crosses a line break with distinct start and end lines", () => {
    const doc = parseGfmDocument("x *a\nb* y");
    expect(doc.inlineStyles).toEqual([
      { type: "emphasis", startLine: 1, endLine: 2, open: { from: 2, to: 3 }, content: { from: 3, to: 6 }, close: { from: 6, to: 7 } },
    ]);
  });

  it("flattens a bracketed markdown link with its text range and url", () => {
    const doc = parseGfmDocument("[t](u)");
    expect(doc.links).toEqual([
      { from: 0, to: 6, textFrom: 1, textTo: 2, url: "u", autolink: false, startLine: 1, endLine: 1 },
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
    expect(parseGfmDocument("![alt](u)").images).toEqual([{ from: 0, to: 9, url: "u", alt: "alt", line: 1 }]);
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
      { from: 1, to: 4, content: { from: 2, to: 3 }, value: "A" },
      { from: 5, to: 8, content: { from: 6, to: 7 }, value: "B" },
    ]);
    // The delimiter is line 2 (offset 10..19), which mdast itself does not emit.
    expect(table.delimiter.cells.map((cell) => cell.value)).toEqual([":--", "--:"]);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].cells.map((cell) => cell.value)).toEqual(["1", "2"]);
  });

  it("does NOT emit inline styles for content inside table cells (raw-text projection)", () => {
    const doc = parseGfmDocument("| *a* |\n|---|\n| b |");
    expect(doc.tables).toHaveLength(1);
    expect(doc.inlineStyles).toEqual([]);
  });
});
