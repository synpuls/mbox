import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmInlineCodePlugin } from "./inline-code.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmInlineCodePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("gfmInlineCodePlugin", () => {
  it("marks the code content and hides its backticks while inactive", () => {
    expect(specsFor("x `a` y")).toEqual([
      { type: "mark", from:3, to: 4, className: "mbox-gfm-code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 2, to: 3 },
      { type: "replace", from: 4, to: 5 },
    ]);
  });

  it("keeps the mark but reveals the backticks on an active line", () => {
    expect(specsFor("x `a` y", [1])).toEqual([{ type: "mark", from:3, to: 4, className: "mbox-gfm-code", inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("hides multi-backtick fences of their true width", () => {
    expect(specsFor("``a`b``")).toEqual([
      { type: "mark", from:2, to: 5, className: "mbox-gfm-code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 2 },
      { type: "replace", from: 5, to: 7 },
    ]);
  });
});
