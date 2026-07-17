import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { GfmThematicBreakWidget, gfmThematicBreakPlugin } from "./thematic-break.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return gfmThematicBreakPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("gfmThematicBreakPlugin", () => {
  it("styles the line and replaces the `---` with a rule widget while inactive", () => {
    const specs = specsFor("a\n\n---\n\nb");
    expect(specs[0]).toEqual({ type: "line", from: 3, to: 3, className: "mbox-gfm-hr-line" });
    expect(specs[1]).toMatchObject({ type: "replace", from: 3, to: 6 });
    expect((specs[1] as unknown as { widget: GfmThematicBreakWidget }).widget).toBeInstanceOf(GfmThematicBreakWidget);
  });

  it("keeps only the line style and reveals the raw marker on an active line", () => {
    expect(specsFor("a\n\n---\n\nb", [3])).toEqual([{ type: "line", from: 3, to: 3, className: "mbox-gfm-hr-line" }]);
  });
});
