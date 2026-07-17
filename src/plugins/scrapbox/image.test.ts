import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  defaultScrapboxImageSrcResolver,
  scrapboxImagePlugin,
  ScrapboxImageMeasureWidget,
} from "./image.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const noActiveLines = new Set<number>();
const IMG = "[https://i.com/a.png]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxImagePlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxImageSpecs", () => {
  it("reveals raw syntax on the active line in token mode", () => {
    expect(specsFor(IMG, {}, [1])).toEqual([]);
  });

  it("keeps a hidden measure widget on the active line in preview mode", () => {
    const specs = specsFor(IMG, { renderMode: "preview" }, [1]);

    expect(specs).toMatchObject([{ type: "widget", from: 0, to: 0, side: -1 }]);
    expect((specs[0] as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ScrapboxImageMeasureWidget);
  });

  it("does not render images inside a code block", () => {
    expect(specsFor(`code:x\n ${IMG}`)).toEqual([]);
  });

  it("creates no specs for a non-image line", () => {
    expect(specsFor("just text")).toEqual([]);
  });
});

describe("defaultScrapboxImageSrcResolver", () => {
  it("appends /raw to a bare Gyazo url", () => {
    // A bare gyazo.com URL serves Gyazo's HTML viewer page, not the raw
    // image bytes -- fetching it directly as an <img> src gets blocked by
    // the browser (net::ERR_BLOCKED_BY_ORB), confirmed against a real
    // Gyazo URL. /raw redirects to the actual image.
    expect(defaultScrapboxImageSrcResolver("https://gyazo.com/0123456789abcdef0123456789abcdef")).toBe(
      "https://gyazo.com/0123456789abcdef0123456789abcdef/raw",
    );
  });

  it("leaves a Gyazo url that already has /raw unchanged", () => {
    expect(defaultScrapboxImageSrcResolver("https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw")).toBe(
      "https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw",
    );
  });

  it("leaves a non-Gyazo image url unchanged", () => {
    expect(defaultScrapboxImageSrcResolver("https://i.com/a.png")).toBe("https://i.com/a.png");
  });
});

describe("scrapboxImagePlugin", () => {
  it("provides token specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: IMG,
      extensions: [createMboxExtension({ plugins: [scrapboxImagePlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0])).toMatchObject([
      { type: "replace", from: 0, to: 21 },
    ]);
  });
});
