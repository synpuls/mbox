import { describe, expect, it } from "vitest";
import { parseScrapboxDocument, scrapboxCodeBlockLineNumbers } from "./parser.js";

describe("parseScrapboxDocument", () => {
  it("handles repeated unclosed bracket URLs without bracket links or images", () => {
    // No spaces and no closing "]": the pre-fix bracket regex (which swallowed
    // "[") rescanned to the end from every "[" inside a single exec, making it
    // quadratic (seconds at this size). The fixed regex stops at the first "["
    // and finishes instantly. A space would instead be consumed by the bare-URL
    // matcher and exercise the inline re-scan (section C), not this regex.
    const document = parseScrapboxDocument("[https://x".repeat(20_000));
    const inline = document.lines.flatMap((line) => line.inline);

    expect(inline.some((node) => node.type === "image" || (node.type === "externalLink" && node.bracketed))).toBe(false);
  }, 5_000);

  it("treats a non-indented line as a plain line", () => {
    const { lines } = parseScrapboxDocument("plain");

    expect(lines).toEqual([
      {
        line: 1,
        from: 0,
        to: 5,
        indent: 0,
        listType: "none",
        marker: { from: 0, to: 0 },
        content: { from: 0, to: 5 },
        number: null,
        numberMarker: null,
        inline: [{ type: "text", from: 0, to: 5, value: "plain" }],
      },
    ]);
  });

  it("treats a single-byte space indent as a bullet at depth 1", () => {
    const [line] = parseScrapboxDocument(" item").lines;

    expect(line).toMatchObject({
      indent: 1,
      listType: "bullet",
      marker: { from: 0, to: 1 },
      content: { from: 1, to: 5 },
    });
  });

  it("counts a double-byte space and a tab as one indent level each", () => {
    const [fullWidth] = parseScrapboxDocument("　full").lines;
    const [tab] = parseScrapboxDocument("\titem").lines;

    expect(fullWidth).toMatchObject({ indent: 1, listType: "bullet", content: { from: 1, to: 5 } });
    expect(tab).toMatchObject({ indent: 1, listType: "bullet", content: { from: 1, to: 5 } });
  });

  it("builds an indent hierarchy with correct offsets across lines", () => {
    const { lines } = parseScrapboxDocument("a\n b\n  c");

    expect(lines).toMatchObject([
      { line: 1, from: 0, to: 1, indent: 0, listType: "none" },
      { line: 2, from: 2, to: 4, indent: 1, listType: "bullet", marker: { from: 2, to: 3 }, content: { from: 3, to: 4 } },
      { line: 3, from: 5, to: 8, indent: 2, listType: "bullet", marker: { from: 5, to: 7 }, content: { from: 7, to: 8 } },
    ]);
  });

  it("parses a number list item at indent 0", () => {
    const [line] = parseScrapboxDocument("1. first").lines;

    expect(line).toMatchObject({
      indent: 0,
      listType: "number",
      number: 1,
      numberMarker: { from: 0, to: 3 },
      content: { from: 0, to: 8 },
    });
  });

  it("parses an indented number list item and keeps its depth", () => {
    const [line] = parseScrapboxDocument("  2. second").lines;

    expect(line).toMatchObject({
      indent: 2,
      listType: "number",
      number: 2,
      numberMarker: { from: 2, to: 5 },
    });
  });

  it("does not treat a period without a trailing space as a number list", () => {
    const [line] = parseScrapboxDocument(" 1.item").lines;

    expect(line).toMatchObject({ listType: "bullet", number: null, numberMarker: null });
  });

  it("treats any indented line as a bullet, even with no content after the space", () => {
    // Scrapbox (and the markdown list plugin) count a leading space itself as a
    // list item, without requiring a character after it.
    const [blankIndented] = parseScrapboxDocument("  ").lines;

    expect(blankIndented).toMatchObject({ indent: 2, listType: "bullet", content: { from: 2, to: 2 } });
  });

  it("does not emit a bullet for a blank line with no indentation", () => {
    const empty = parseScrapboxDocument("").lines;

    expect(empty).toMatchObject([{ line: 1, from: 0, to: 0, indent: 0, listType: "none" }]);
  });
});

describe("parseScrapboxDocument code blocks", () => {
  it("groups a code: line with its more-indented body", () => {
    const { codeBlocks } = parseScrapboxDocument("code:hello.js\n console.log(1)\n end\nafter");

    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0]).toMatchObject({
      type: "codeBlock",
      indent: 0,
      fileName: "hello.js",
      openerLine: { line: 1 },
    });
    expect(codeBlocks[0].bodyLines.map((line) => line.line)).toEqual([2, 3]);
  });

  it("ends the code block when indentation returns to the opener level", () => {
    const { codeBlocks } = parseScrapboxDocument("code:a\n body\nplain");

    expect(codeBlocks[0].bodyLines.map((line) => line.line)).toEqual([2]);
  });

  it("supports an indented (nested) code block", () => {
    const { codeBlocks } = parseScrapboxDocument(" code:a\n  body\n other");

    expect(codeBlocks[0]).toMatchObject({ indent: 1, fileName: "a" });
    expect(codeBlocks[0].bodyLines.map((line) => line.line)).toEqual([2]);
  });

  it("does not treat plain text as a code block", () => {
    expect(parseScrapboxDocument("not code:here\n indented").codeBlocks).toEqual([]);
  });

  it("collects every line number covered by code blocks", () => {
    const document = parseScrapboxDocument("code:a\n one\n two\nafter\ncode:b\n three");

    expect([...scrapboxCodeBlockLineNumbers(document)].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6]);
  });

  it("groups a table: block and does not treat it as a code block", () => {
    const { codeBlocks, tableBlocks } = parseScrapboxDocument("table:t\n a\tb\n c\td\nafter");

    expect(codeBlocks).toEqual([]);
    expect(tableBlocks).toHaveLength(1);
    expect(tableBlocks[0]).toMatchObject({ type: "table", name: "t", openerLine: { line: 1 } });
    expect(tableBlocks[0].bodyLines.map((line) => line.line)).toEqual([2, 3]);
  });
});
