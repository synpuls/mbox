import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { hatenaPrePlugin } from "./pre.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaPrePlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaPrePlugin", () => {
  it("wraps a `>| ... |<` block in one line range and hides its markers when inactive", () => {
    // ">|"=0..2, "text"=3..7, "|<"=8..10
    expect(specsFor(">|\ntext\n|<")).toEqual([
      { type: "lineRange", from: 0, to: 10, className: "mbox-hatena-pre" },
      { type: "replace", from: 0, to: 2 },
      { type: "replace", from: 8, to: 10 },
    ]);
  });

  it("reveals the opener marker on its active line", () => {
    expect(specsFor(">|\ntext\n|<", [1])).toMatchObject([
      { type: "lineRange", from: 0, to: 10 },
      { type: "replace", from: 8, to: 10 },
    ]);
  });

  it("creates no specs when there is no pre block", () => {
    expect(specsFor("*heading")).toEqual([]);
  });
});
