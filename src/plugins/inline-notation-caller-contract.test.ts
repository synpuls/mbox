import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../editor/test-context.js";
import { gfmLinkPlugin } from "./gfm/link.js";
import { hatenaFootnotePlugin } from "./hatena/footnote.js";

function specsFor(
  plugin: ReturnType<typeof gfmLinkPlugin> | ReturnType<typeof hatenaFootnotePlugin>,
  doc: string,
  activeLines: Iterable<number> = [],
) {
  const context = createTestContext(doc, { activeLines });
  const specs = plugin.decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("inline-notation callers' parser-to-kit contract", () => {
  it("gfm leaves a multiline link raw because one replace cannot span its two lines", () => {
    const input = "[first\nsecond](https://example.com)";

    expect(specsFor(gfmLinkPlugin(), input)).toEqual([]);
    expect(specsFor(gfmLinkPlugin(), input, [2])).toEqual([]);
  });

  it("hatena leaves its own active footnote raw while preserving its line treatment", () => {
    const input = "A((note))";

    expect(specsFor(hatenaFootnotePlugin(), input)).toEqual([
      { type: "line", from: 0, className: "mbox-hatena-footnote-line" },
      expect.objectContaining({ type: "replace", from: 1, to: 9 }),
    ]);
    expect(specsFor(hatenaFootnotePlugin(), input, [1])).toEqual([
      { type: "line", from: 0, className: "mbox-hatena-footnote-line" },
    ]);
  });
});
