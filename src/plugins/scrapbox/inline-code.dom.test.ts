import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { scrapboxInlineCodePlugin } from "./inline-code.js";

function withInlineCodeView<T>(
  options: {
    doc: string;
    selection?: EditorSelection | SelectionRange;
  },
  run: (view: EditorView) => T,
): T {
  const parent = document.createElement("div");
  const plugin = scrapboxInlineCodePlugin();
  const state = EditorState.create({
    doc: options.doc,
    selection: options.selection,
    extensions: plugin.extensions ?? [],
  });
  const view = createEditorView({ parent, state });

  try {
    return run(view);
  } finally {
    view.destroy();
  }
}

function runInputHandler(view: EditorView, text: string): boolean {
  const handler = view.state.facet(EditorView.inputHandler)[0];
  return handler(view, view.state.selection.main.from, view.state.selection.main.to, text, () =>
    view.state.update({
      changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: text },
    }),
  );
}

describe("scrapboxInlineCodePlugin", () => {
  it("wraps selected text in inline code and keeps the text selected", () => {
    withInlineCodeView({ doc: "abc", selection: EditorSelection.range(0, 3) }, (view) => {
      expect(runInputHandler(view, "`")).toBe(true);
      expect(view.state.doc.toString()).toBe("`abc`");
      expect({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head }).toEqual({
        anchor: 1,
        head: 4,
      });
    });
  });

  it("falls through (returns false, leaves the doc) for an empty selection", () => {
    withInlineCodeView({ doc: "ab", selection: EditorSelection.cursor(1) }, (view) => {
      expect(runInputHandler(view, "`")).toBe(false);
      expect(view.state.doc.toString()).toBe("ab");
    });
  });
});
