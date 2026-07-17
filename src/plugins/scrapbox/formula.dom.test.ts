import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxFormulaClassName,
  scrapboxFormulaPlugin,
  ScrapboxFormulaWidget,
} from "./formula.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const noActiveLines = new Set<number>();
const FORMULA = "[$ x^2]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxFormulaPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxFormulaSpecs", () => {
  it("replaces a formula with a widget showing the raw expression by default", () => {
    const [spec] = specsFor(FORMULA);

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 7 });
    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM().textContent).toBe("x^2");
  });

  it("uses a provided renderer for the expression", () => {
    const [spec] = specsFor(FORMULA, {
      render: (expression: string) => {
        const el = document.createElement("var");
        el.textContent = `rendered:${expression}`;
        return el;
      },
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM();

    expect(dom.querySelector("var")?.textContent).toBe("rendered:x^2");
  });
});

describe("scrapboxFormulaPlugin", () => {
  it("renders the formula in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: FORMULA,
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)?.textContent).toBe("x^2");

    view.destroy();
  });
});
