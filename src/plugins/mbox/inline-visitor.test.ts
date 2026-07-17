import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";

describe("createInactiveInlineNodeSpecs", () => {
  it("visits inline nodes outside active raw syntax lines", () => {
    const document = parseMboxDocument("Use `code`\nFocus `raw`");

    expect(
      createInactiveInlineNodeSpecs(document, new Set([2]), (node) =>
        node.type === "inlineCode" ? [{ ...node.content, className: "mbox-code" }] : [],
      ),
    ).toEqual([{ from: 5, to: 9, className: "mbox-code" }]);
  });

  it("does not visit inline-like text inside code blocks", () => {
    const document = parseMboxDocument("```\n`skip`\n```\n`ok`");

    expect(
      createInactiveInlineNodeSpecs(document, new Set<number>(), (node) =>
        node.type === "inlineCode" ? [{ ...node.content, className: "mbox-code" }] : [],
      ),
    ).toEqual([{ from: 16, to: 18, className: "mbox-code" }]);
  });
});
