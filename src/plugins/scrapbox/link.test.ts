import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  scrapboxHashTagClassName,
  scrapboxLinkClassName,
  scrapboxLinkPlugin,
  scrapboxPageMissingClassName,
  ScrapboxLinkWidget,
} from "./link.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxLinkPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxLinkSpecs", () => {
  it("replaces an internal link with a link anchor widget", () => {
    const [spec] = specsFor("[Page]");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 6 });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ScrapboxLinkWidget);
  });

  it("adds the missing page class to an active internal link mark when pageExists returns false", () => {
    const [spec] = specsFor(
      "[Missing]",
      {
        pageExists: (name: string) => name !== "Missing",
      },
      [1],
    );

    expect(spec).toMatchObject({
      type: "mark",
      from: 0,
      to: 9,
      className: `${scrapboxLinkClassName} ${scrapboxPageMissingClassName}`,
    });
  });

  it("adds the missing page class to an active hashtag mark when pageExists returns false", () => {
    const [spec] = specsFor(
      "a #missing",
      {
        pageExists: (name: string) => name !== "missing",
      },
      [1],
    );

    expect(spec).toMatchObject({
      type: "mark",
      from: 2,
      to: 10,
      className: `${scrapboxHashTagClassName} ${scrapboxPageMissingClassName}`,
    });
  });

  it("finds links nested inside a decoration", () => {
    const [spec] = specsFor("[* [Page]]");

    expect(spec).toMatchObject({ type: "replace", from: 3, to: 9 });
  });

  it("passes raw internal link and hashtag names to pageExists", () => {
    const names: string[] = [];

    specsFor("[/proj/Page] #tag [demo-user.icon] https://e.com", {
      pageExists: (name: string) => {
        names.push(name);
        return true;
      },
    });

    expect(names).toEqual(["/proj/Page", "tag"]);
  });

  it("returns no specs for plain text", () => {
    expect(specsFor("nothing here")).toEqual([]);
  });

  it("reveals raw syntax but keeps a color mark over the whole span on active lines", () => {
    const specs = specsFor("[One]\n[Two]", {}, [1]);

    // Line 1 ("[One]") is active: no replace widget (raw brackets stay), but
    // still a mark spanning the whole bracketed range, not just the content.
    expect(specs).toContainEqual(
      expect.objectContaining({ type: "mark", from: 0, to: 5, className: scrapboxLinkClassName }),
    );
    // Line 2 ("[Two]") is inactive: the usual widget replace.
    expect(specs.some((spec) => spec.type === "replace" && spec.from === 6 && spec.to === 11)).toBe(true);
  });
});

describe("scrapboxLinkPlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "[Page]",
      extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0])).toMatchObject([
      { type: "replace", from: 0, to: 6 },
    ]);
  });

  it("uses the cached source input instead of stringifying the document separately", () => {
    const state = EditorState.create({
      doc: "[Page]",
      extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);
    const toString = vi.spyOn(state.doc, "toString");

    provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]);

    expect(toString).toHaveBeenCalledTimes(1);
  });
});
