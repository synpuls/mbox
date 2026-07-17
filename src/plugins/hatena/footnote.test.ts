import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { HatenaFootnoteWidget, hatenaFootnotePlugin } from "./footnote.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaFootnotePlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaFootnotePlugin", () => {
  it("replaces an inactive `((note))` with a numbered superscript widget", () => {
    const specs = specsFor("A((一))B((二))");
    expect(specs).toMatchObject([
      { type: "line", from: 0, to: 0, className: "mbox-hatena-footnote-line" },
      { type: "replace", from: 1, to: 6 },
      { type: "replace", from: 7, to: 12 },
    ]);
    const first = (specs[1] as unknown as { widget: HatenaFootnoteWidget }).widget;
    expect(first).toBeInstanceOf(HatenaFootnoteWidget);
    expect(first.number).toBe(1);
    expect(first.note).toBe("一");
    expect((specs[2] as unknown as { widget: HatenaFootnoteWidget }).widget.number).toBe(2);
  });

  it("reveals the raw `((note))` on the active line but keeps the height reserved", () => {
    expect(specsFor("A((一))", [1])).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-hatena-footnote-line" },
    ]);
  });

  it("creates no specs for a line without footnotes", () => {
    expect(specsFor("plain")).toEqual([]);
  });

});
