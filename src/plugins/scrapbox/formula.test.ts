import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  scrapboxFormulaPlugin,
} from "./formula.js";
import { createTestContext } from "../../editor/test-context.js";

const noActiveLines = new Set<number>();
const FORMULA = "[$ x^2]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxFormulaPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxFormulaSpecs", () => {
  it("reveals the raw syntax on the active line", () => {
    expect(specsFor(FORMULA, {}, [1])).toEqual([]);
  });

  it("creates no specs for a plain line", () => {
    expect(specsFor("just text")).toEqual([]);
  });
});

describe("scrapboxFormulaPlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: FORMULA,
      extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext(FORMULA)).length).toBe(1);
  });
});
