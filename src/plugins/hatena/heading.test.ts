import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { hatenaHeadingPlugin } from "./heading.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaHeadingPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaHeadingPlugin", () => {
  it("styles an h3 line and hides its `*` marker", () => {
    expect(specsFor("*Title")).toEqual([
      { type: "line", from: 0, className: "mbox-hatena-heading mbox-hatena-h3" },
      { type: "replace", from: 0, to: 1 },
    ]);
  });

  it("uses h4 / h5 classes and hides the whole star run", () => {
    expect(specsFor("**Four")).toMatchObject([
      { type: "line", className: "mbox-hatena-heading mbox-hatena-h4" },
      { type: "replace", from: 0, to: 2 },
    ]);
    expect(specsFor("***Five")).toMatchObject([
      { type: "line", className: "mbox-hatena-heading mbox-hatena-h5" },
      { type: "replace", from: 0, to: 3 },
    ]);
  });

  it("keeps the line style but reveals the marker on active lines", () => {
    expect(specsFor("*Title", [1])).toEqual([
      { type: "line", from: 0, className: "mbox-hatena-heading mbox-hatena-h3" },
    ]);
  });

  it("creates no specs for a plain line", () => {
    expect(specsFor("plain")).toEqual([]);
  });

  it("does not ship a presentation theme (font-size/weight is visual, not structural)", () => {
    expect(hatenaHeadingPlugin().theme).toBeUndefined();
  });
});
