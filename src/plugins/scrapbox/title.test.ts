import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { createTestContext } from "../../editor/test-context.js";
import { scrapboxTitleLineClassName, scrapboxTitlePlugin } from "./title.js";

function specsFor(input: string) {
  return scrapboxTitlePlugin().decorations!(createTestContext(input, { activeLines: new Set() }));
}

describe("createScrapboxTitleSpecs", () => {
  it("marks only the first line as the title", () => {
    expect(specsFor("Title\nbody\nmore")).toEqual([
      { type: "line", from: 0, to: 0, className: scrapboxTitleLineClassName },
    ]);
  });

  it("still marks the first line when the document is a single line", () => {
    expect(specsFor("Title")).toEqual([{ type: "line", from: 0, to: 0, className: scrapboxTitleLineClassName }]);
  });

  it("still marks the first line when it is empty", () => {
    expect(specsFor("\nbody")).toEqual([{ type: "line", from: 0, to: 0, className: scrapboxTitleLineClassName }]);
  });
});

describe("scrapboxTitlePlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "Title\nbody",
      extensions: [createMboxExtension({ plugins: [scrapboxTitlePlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(
      provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<
        typeof provider
      >[0]),
    ).toEqual([{ type: "line", from: 0, to: 0, className: scrapboxTitleLineClassName }]);
  });
});
