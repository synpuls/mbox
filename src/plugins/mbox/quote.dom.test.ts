import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  quoteClassNames,
  quotePlugin,
} from "./quote.js";

describe("quotePlugin", () => {
  it("adds quote line class and hides marker syntax outside active raw syntax lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "> quote\nplain",
        selection: EditorSelection.cursor(9),
        extensions: [
          createMboxExtension({
            plugins: [quotePlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.cm-line.${quoteClassNames.quote}`)?.textContent).toBe("quote");

    view.destroy();
  });

  it("keeps quote raw syntax on selected lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "> quote\n> selected",
        selection: EditorSelection.range(1, 14),
        extensions: [
          createMboxExtension({
            plugins: [quotePlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    expect(parent.textContent).toContain("> quote");
    expect(parent.textContent).toContain("> selected");

    view.destroy();
  });
});

describe("quotePlugin keymap", () => {
  it("binds ArrowUp to move the cursor from a line start onto the previous quote", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "> quote\ntext",
        selection: EditorSelection.cursor(8),
        extensions: [
          createMboxExtension({
            plugins: [quotePlugin()],
          }),
        ],
      }),
    });

    const arrowUp = quotePlugin().keymap?.find((binding) => binding.key === "ArrowUp");
    expect(arrowUp?.run?.(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(0);

    view.destroy();
  });
});
