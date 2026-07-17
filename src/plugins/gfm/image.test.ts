import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { gfmImagePlugin, type GfmImagePluginOptions } from "./image.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options: GfmImagePluginOptions = {}, activeLines: Iterable<number> = noActiveLines) {
  return gfmImagePlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("gfmImagePlugin", () => {
  it("replaces an inactive image with a token widget by default", () => {
    const specs = specsFor("![alt](u)");
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "replace", from: 0, to: 9 });
    expect((specs[0] as unknown as { widget: unknown }).widget).toBeDefined();
  });

  it("emits no replace on the active line (raw markdown editable)", () => {
    // In token mode the active line simply carries no image decoration.
    expect(specsFor("![alt](u)", {}, [1])).toEqual([]);
  });

  it("uses a preview widget when renderMode is preview", () => {
    const specs = specsFor("![alt](u)", { renderMode: "preview" });
    expect(specs[0]).toMatchObject({ type: "replace", from: 0, to: 9 });
    // Preview mode adds a measurement widget on the active line instead of nothing.
    const active = specsFor("![alt](u)", { renderMode: "preview" }, [1]);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ type: "widget", from: 0 });
  });

  it("ships the image-kit theme", () => {
    expect(gfmImagePlugin().theme).toHaveProperty(".mbox-gfm-image-preview");
  });
});
