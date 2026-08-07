import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders, type MboxReplaceDecorationSpec } from "../../editor/plugin.js";
import {
  scrapboxFormulaPlugin,
  ScrapboxFormulaWidget,
} from "./formula.js";
import { createTestContext } from "../../editor/test-context.js";

const noActiveLines = new Set<number>();
const FORMULA = "[$ x^2]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxFormulaPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxFormulaSpecs", () => {
  it("does not consider an inline and a block formula widget interchangeable", () => {
    const inline = new ScrapboxFormulaWidget("x^2", undefined);
    const block = new ScrapboxFormulaWidget("x^2", undefined, true);

    expect(inline.eq(block)).toBe(false);
    expect(block.eq(inline)).toBe(false);
  });

  it("replaces a code:tex opener with a block formula widget and hides its body using the code-block segment rule", () => {
    const input = "code:tex\n \\begin{pmatrix}\n  a & b\n  c & d\n \\end{pmatrix}";
    const specs = specsFor(input);
    const opener = specs[0] as MboxReplaceDecorationSpec;

    expect(opener).toMatchObject({ type: "replace", from: 0, to: 8 });
    expect(opener.widget).toEqual(new ScrapboxFormulaWidget("\\begin{pmatrix}\n a & b\n c & d\n\\end{pmatrix}", undefined, true));
    expect(specs.slice(1)).toEqual([
      { type: "replace", from: 9, to: 25 },
      { type: "line", from: 9, className: "mbox-scrapbox-formula-hidden-line" },
      { type: "replace", from: 26, to: 33 },
      { type: "line", from: 26, className: "mbox-scrapbox-formula-hidden-line" },
      { type: "replace", from: 34, to: 41 },
      { type: "line", from: 34, className: "mbox-scrapbox-formula-hidden-line" },
      { type: "replace", from: 42, to: 56 },
      { type: "line", from: 42, className: "mbox-scrapbox-formula-hidden-line" },
    ]);
  });

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
