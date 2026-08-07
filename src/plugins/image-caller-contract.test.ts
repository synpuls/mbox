import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../editor/test-context.js";
import { gfmImagePlugin } from "./gfm/image.js";
import { markdownImagePlugin } from "./mbox/markdown-image.js";
import { scrapboxImagePlugin } from "./scrapbox/image.js";

function specsFor(
  plugin: ReturnType<typeof markdownImagePlugin> | ReturnType<typeof gfmImagePlugin> | ReturnType<typeof scrapboxImagePlugin>,
  doc: string,
  activeLines: Iterable<number> = [],
) {
  const context = createTestContext(doc, { activeLines });
  const specs = plugin.decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("image callers' parser-to-kit contract", () => {
  it("mbox forwards its parser range, active state, and render mode to image-kit", () => {
    const input = "😀 ![alt](u)";

    expect(specsFor(markdownImagePlugin(), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 12 }),
    ]);
    expect(specsFor(markdownImagePlugin(), input, [1])).toEqual([]);
    expect(specsFor(markdownImagePlugin({ renderMode: "preview" }), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 12 }),
    ]);
    expect(specsFor(markdownImagePlugin({ renderMode: "preview" }), input, [1])).toEqual([
      expect.objectContaining({ type: "widget", from: 3, side: -1 }),
    ]);
  });

  it("gfm forwards its parser range, active state, and render mode to image-kit", () => {
    const input = "😀 ![alt](u)";

    expect(specsFor(gfmImagePlugin({ renderMode: "token" }), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 12 }),
    ]);
    expect(specsFor(gfmImagePlugin({ renderMode: "token" }), input, [1])).toEqual([]);
    expect(specsFor(gfmImagePlugin({ renderMode: "preview" }), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 12 }),
    ]);
    expect(specsFor(gfmImagePlugin({ renderMode: "preview" }), input, [1])).toEqual([
      expect.objectContaining({ type: "widget", from: 3, side: -1 }),
    ]);
  });

  it("gfm defaults to preview, unlike the other notations", () => {
    // GitHub renders an `<img>`, so this namespace does too -- the owner chose
    // to match the notation. Pinned because it is a privacy-relevant default: a
    // host that passes no options fetches the URLs in its document.
    const input = "😀 ![alt](u)";

    expect(specsFor(gfmImagePlugin(), input)).toEqual(specsFor(gfmImagePlugin({ renderMode: "preview" }), input));
    expect(specsFor(gfmImagePlugin(), input, [1])).toEqual(specsFor(gfmImagePlugin({ renderMode: "preview" }), input, [1]));
    // The measure widget on the active line is the preview shape; token mode
    // emits nothing there.
    expect(specsFor(gfmImagePlugin(), input, [1])).not.toEqual([]);
  });

  it("scrapbox forwards its parser range, active state, and render mode to image-kit", () => {
    const input = "😀 [https://i.com/a.png]";

    expect(specsFor(scrapboxImagePlugin(), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 24 }),
    ]);
    expect(specsFor(scrapboxImagePlugin(), input, [1])).toEqual([]);
    expect(specsFor(scrapboxImagePlugin({ renderMode: "preview" }), input)).toEqual([
      expect.objectContaining({ type: "replace", from: 3, to: 24 }),
    ]);
    expect(specsFor(scrapboxImagePlugin({ renderMode: "preview" }), input, [1])).toEqual([
      expect.objectContaining({ type: "widget", from: 3, side: -1 }),
    ]);
  });
});
