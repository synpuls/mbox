import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

describe("parseMboxDocument CRLF logical lines", () => {
  it("keeps fenced-code source raw while its syntax ranges address their recorded values", () => {
    const input = "```ts\r\nconst a = 1\r\n```\r\n";
    const [block] = parseMboxDocument(input).blocks;

    expect(block).toMatchObject({ type: "codeBlock", infoValue: "ts", value: "const a = 1\r\n" });
    if (block?.type !== "codeBlock") throw new Error("expected a code block");
    expect(input.slice(block.openingFence.from, block.openingFence.to)).toBe("```ts\r");
    expect(input.slice(block.info.from, block.info.to)).toBe(block.infoValue);
    expect(input.slice(block.content.from, block.content.to)).toBe(block.value);
    expect(block.closingFence && input.slice(block.closingFence.from, block.closingFence.to)).toBe("```\r");
    expect([block, block.openingFence, block.info, block.content, block.closingFence].flat().every((range) =>
      range == null || (range.from >= 0 && range.from <= range.to && range.to <= input.length),
    )).toBe(true);
  });

  it("uses CRLF-free syntax values for tables, headings, lists, quotes, footnotes, and inline text", () => {
    const input = "# heading\r\n- item\r\n> quote\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n[^n]: note\r\n*em* `code` [Page]";
    const blocks = parseMboxDocument(input).blocks;
    const [heading, list, quote, table, footnote, paragraph] = blocks;

    expect(heading).toMatchObject({ type: "heading", inline: [{ type: "text", value: "heading" }] });
    expect(list).toMatchObject({ type: "listItem", inline: [{ type: "text", value: "item" }] });
    expect(quote).toMatchObject({ type: "quote", inline: [{ type: "text", value: "quote" }] });
    expect(table).toMatchObject({ type: "table", header: { cells: [{ value: "A" }, { value: "B" }] }, rows: [{ cells: [{ value: "1" }, { value: "2" }] }] });
    expect(footnote).toMatchObject({ type: "footnoteDefinition", label: "n", value: "note" });
    expect(paragraph).toMatchObject({ type: "paragraph" });
    expect(paragraph && "inline" in paragraph && paragraph.inline.filter((node) => node.type !== "text").map((node) => node.type)).toEqual([
      "emphasis",
      "inlineCode",
      "wikiLink",
    ]);
    expect(JSON.stringify(blocks)).not.toContain("\\r");
    expectEveryRangeIsWithinInput(blocks, input);
  });

  it("does not treat a lone final carriage return as a line terminator", () => {
    const [block] = parseMboxDocument("```ts\r").blocks;

    expect(block).toMatchObject({ type: "codeBlock", infoValue: "ts\r", value: "" });
  });
});

function expectEveryRangeIsWithinInput(value: unknown, input: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => expectEveryRangeIsWithinInput(entry, input));
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.from === "number" && typeof record.to === "number") {
    expect(record.from).toBeGreaterThanOrEqual(0);
    expect(record.to).toBeGreaterThanOrEqual(record.from);
    expect(record.to).toBeLessThanOrEqual(input.length);
  }
  Object.values(record).forEach((entry) => expectEveryRangeIsWithinInput(entry, input));
}
