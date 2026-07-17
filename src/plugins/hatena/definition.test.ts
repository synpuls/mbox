import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { hatenaDefinitionPlugin } from "./definition.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaDefinitionPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaDefinitionPlugin", () => {
  it("styles a `:term:desc` line, hides both colons and marks the term", () => {
    expect(specsFor(":はてな:説明文")).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-hatena-deflist" },
      { type: "replace", from: 0, to: 1 },
      { type: "mark", from: 1, to: 4, className: "mbox-hatena-deflist-term", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 5 },
    ]);
  });

  it("styles a `::` continuation with the continuation class and hides `::`", () => {
    expect(specsFor("::継続")).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-hatena-deflist mbox-hatena-deflist-cont" },
      { type: "replace", from: 0, to: 2 },
    ]);
  });

  it("keeps the raw colons on an active line, styling the line only", () => {
    expect(specsFor(":はてな:説明文", [1])).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-hatena-deflist" },
    ]);
  });

  it("creates no specs for a plain line", () => {
    expect(specsFor("plain")).toEqual([]);
  });
});
