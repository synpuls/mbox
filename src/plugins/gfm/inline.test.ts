import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmInlinePlugin } from "./inline.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmInlinePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("gfmInlinePlugin", () => {
  it("marks emphasis content and hides its `*` markers while inactive", () => {
    expect(specsFor("a *b* c")).toEqual([
      { type: "mark", from:3, to: 4, className: "mbox-gfm-em", tagName: "em", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 2, to: 3 },
      { type: "replace", from: 4, to: 5 },
    ]);
  });

  it("keeps the content mark but reveals the markers on an active line", () => {
    expect(specsFor("a *b* c", [1])).toEqual([{ type: "mark", from:3, to: 4, className: "mbox-gfm-em", tagName: "em", inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("uses two-char markers for strong and strikethrough", () => {
    expect(specsFor("a **b** c")).toEqual([
      { type: "mark", from:4, to: 5, className: "mbox-gfm-strong", tagName: "strong", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 2, to: 4 },
      { type: "replace", from: 5, to: 7 },
    ]);
    expect(specsFor("a ~~b~~ c")).toEqual([
      { type: "mark", from:4, to: 5, className: "mbox-gfm-del", tagName: "del", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 2, to: 4 },
      { type: "replace", from: 5, to: 7 },
    ]);
  });

  // STRESS CASE: an emphasis span crossing a line break. DECISION: a span is
  // "active" (markers revealed) when ANY of the lines it touches is active, so a
  // user editing on either line sees the full `*...*` structure, and the markers
  // are hidden only when the whole span is idle. The italic mark always applies.
  describe("a span crossing a line break", () => {
    it("hides both markers only when NEITHER line is active", () => {
      expect(specsFor("x *a\nb* y")).toEqual([
        { type: "mark", from:3, to: 6, className: "mbox-gfm-em", tagName: "em", inclusiveStart: true, inclusiveEnd: true },
        { type: "replace", from: 2, to: 3 },
        { type: "replace", from: 6, to: 7 },
      ]);
    });

    it("reveals BOTH markers when only the first line is active", () => {
      expect(specsFor("x *a\nb* y", [1])).toEqual([{ type: "mark", from:3, to: 6, className: "mbox-gfm-em", tagName: "em", inclusiveStart: true, inclusiveEnd: true }]);
    });

    it("reveals BOTH markers when only the second line is active", () => {
      expect(specsFor("x *a\nb* y", [2])).toEqual([{ type: "mark", from:3, to: 6, className: "mbox-gfm-em", tagName: "em", inclusiveStart: true, inclusiveEnd: true }]);
    });
  });

  describe("a backslash hard break", () => {
    it("hides the trailing backslash while the line is inactive", () => {
      // `a\` + newline + `b` — the `\` at offset 1 is hidden.
      expect(specsFor("a\\\nb")).toEqual([{ type: "replace", from: 1, to: 2 }]);
    });

    it("reveals the backslash on the active line", () => {
      expect(specsFor("a\\\nb", [1])).toEqual([]);
    });
  });

  it("hides an escape's backslash on inactive lines and reveals it on the active line", () => {
    const idle = specsFor("\\*not emphasis\\*");
    expect(idle).toEqual([
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 14, to: 15 },
    ]);

    expect(specsFor("\\*not emphasis\\*", [1])).toEqual([]);
  });
});
