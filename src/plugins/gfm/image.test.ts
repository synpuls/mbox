import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { gfmImagePlugin, type GfmImagePluginOptions } from "./image.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options: GfmImagePluginOptions = {}, activeLines: Iterable<number> = noActiveLines) {
  return gfmImagePlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("gfmImagePlugin", () => {
  it("replaces an inactive image with a widget", () => {
    const specs = specsFor("![alt](u)");
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "replace", from: 0, to: 9 });
    expect((specs[0] as unknown as { widget: unknown }).widget).toBeDefined();
  });

  it("defaults to preview, matching the notation rather than the safer mode", () => {
    // GitHub renders an `<img>`. Pinned because it is a privacy-relevant
    // default: a host that passes no options fetches the URLs in its document,
    // and mbox does not proxy those requests the way GitHub does.
    expect(specsFor("![alt](u)")).toEqual(specsFor("![alt](u)", { renderMode: "preview" }));
    expect(specsFor("![alt](u)", {}, [1])).toEqual(specsFor("![alt](u)", { renderMode: "preview" }, [1]));
  });

  it("emits no decoration on the active line in token mode (raw markdown editable)", () => {
    expect(specsFor("![alt](u)", { renderMode: "token" }, [1])).toEqual([]);
  });

  it("uses a preview widget when renderMode is preview", () => {
    const specs = specsFor("![alt](u)", { renderMode: "preview" });
    expect(specs[0]).toMatchObject({ type: "replace", from: 0, to: 9 });
    // Preview mode adds a measurement widget on the active line instead of nothing.
    const active = specsFor("![alt](u)", { renderMode: "preview" }, [1]);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ type: "widget", from: 0 });
  });

  it("decorates a table-cell image in preview mode like any other", () => {
    // Cells used to be forced to the token. They are not any more: the table
    // plugin reserves a column wide enough for a picture (see table.dom.test.ts).
    const specs = specsFor("| ![alt](u) |\n| --- |", { renderMode: "preview" });
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "replace", from: 2, to: 11 });
  });

  it("ships the image-kit theme", () => {
    expect(gfmImagePlugin().theme).toHaveProperty(".mbox-gfm-image-preview");
  });
});
