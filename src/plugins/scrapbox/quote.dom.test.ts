import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxQuoteLineClassName,
  scrapboxQuoteMarkerHiddenClassName,
  scrapboxQuotePlugin,
} from "./quote.js";

describe("scrapboxQuotePlugin", () => {
  it("hides the marker with visibility (not layout removal) in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: ">quoted",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxQuotePlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxQuoteLineClassName}`)).not.toBeNull();
    // The `>` stays in the DOM (unlike the old replace-based hiding) so its
    // layout width is reserved -- only its visibility toggles (the theme
    // sets visibility: hidden on this class; happy-dom doesn't reliably
    // compute injected theme CSS, so the class itself is what's asserted
    // here -- the actual rendered effect is covered by a Playwright spec).
    expect(parent.querySelector(".cm-line")?.textContent).toBe(">quoted");
    const marker = parent.querySelector(`.${scrapboxQuoteMarkerHiddenClassName}`);
    expect(marker?.textContent).toBe(">");

    view.destroy();
  });

  it("reveals the raw marker on the active line but keeps the quote-line class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: ">quoted",
        extensions: [createMboxExtension({ plugins: [scrapboxQuotePlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(2) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe(">quoted");
    // A focused quote line keeps its left border and colour -- only the `>`
    // marker itself is revealed as raw text.
    expect(parent.querySelector(`.${scrapboxQuoteLineClassName}`)).not.toBeNull();
    expect(parent.querySelector(`.${scrapboxQuoteMarkerHiddenClassName}`)).toBeNull();

    view.destroy();
  });

});
