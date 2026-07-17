import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorView } from "../editor/create-editor.js";
import { bracketPairInputPlugin, type BracketPairKitOptions } from "./bracket-pair-kit.js";

function withBracketPairView<T>(
  options: {
    doc: string;
    selection?: EditorSelection | SelectionRange;
    readOnly?: boolean;
    pair?: BracketPairKitOptions;
    allowMultipleSelections?: boolean;
  },
  run: (view: EditorView) => T,
): T {
  const parent = document.createElement("div");
  const plugin = bracketPairInputPlugin(options.pair ?? { open: "[", close: "]" });
  const state = EditorState.create({
    doc: options.doc,
    selection: options.selection,
    extensions: [
      ...(plugin.extensions ?? []),
      ...(options.readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(options.allowMultipleSelections ? [EditorState.allowMultipleSelections.of(true)] : []),
    ],
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

describe("bracketPairInputPlugin", () => {
  it("handles the configured open text by inserting the pair around the caret", () => {
    withBracketPairView({ doc: "ab", selection: EditorSelection.cursor(1) }, (view) => {
      expect(runInputHandler(view, "[")).toBe(true);
      expect(view.state.doc.toString()).toBe("a[]b");
      expect(view.state.selection.main.anchor).toBe(2);
    });
  });

  it("wraps selected text when the configured open text is typed", () => {
    withBracketPairView({ doc: "abc", selection: EditorSelection.range(0, 3) }, (view) => {
      expect(runInputHandler(view, "[")).toBe(true);
      expect(view.state.doc.toString()).toBe("[abc]");
      expect({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head }).toEqual({
        anchor: 1,
        head: 4,
      });
    });
  });

  it("falls through for text that does not match the configured open text", () => {
    withBracketPairView({ doc: "ab", selection: EditorSelection.cursor(1) }, (view) => {
      expect(runInputHandler(view, "(")).toBe(false);
      expect(view.state.doc.toString()).toBe("ab");
    });
  });

  it("falls through for read-only states", () => {
    withBracketPairView({ doc: "ab", selection: EditorSelection.cursor(1), readOnly: true }, (view) => {
      expect(runInputHandler(view, "[")).toBe(false);
      expect(view.state.doc.toString()).toBe("ab");
    });
  });

  it("uses arbitrary bracket pair characters from options", () => {
    withBracketPairView({ doc: "ab", selection: EditorSelection.cursor(1), pair: { open: "(", close: ")" } }, (view) => {
      expect(runInputHandler(view, "(")).toBe(true);
      expect(view.state.doc.toString()).toBe("a()b");
      expect(view.state.selection.main.anchor).toBe(2);
    });
  });

  it("falls through for an empty selection when non-empty selection is required", () => {
    withBracketPairView(
      {
        doc: "ab",
        selection: EditorSelection.cursor(1),
        pair: { open: "`", close: "`", requireNonEmptySelection: true },
      },
      (view) => {
        expect(runInputHandler(view, "`")).toBe(false);
        expect(view.state.doc.toString()).toBe("ab");
      },
    );
  });

  it("wraps selected text when non-empty selection is required", () => {
    withBracketPairView(
      {
        doc: "abc",
        selection: EditorSelection.range(0, 3),
        pair: { open: "`", close: "`", requireNonEmptySelection: true },
      },
      (view) => {
        expect(runInputHandler(view, "`")).toBe(true);
        expect(view.state.doc.toString()).toBe("`abc`");
        expect({ anchor: view.state.selection.main.anchor, head: view.state.selection.main.head }).toEqual({
          anchor: 1,
          head: 4,
        });
      },
    );
  });

  it("handles multiple selections when any range is non-empty and non-empty selection is required", () => {
    withBracketPairView(
      {
        doc: "abcd",
        selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.range(2, 4)]),
        allowMultipleSelections: true,
        pair: { open: "`", close: "`", requireNonEmptySelection: true },
      },
      (view) => {
        expect(runInputHandler(view, "`")).toBe(true);
        expect(view.state.doc.toString()).toBe("a``b`cd`");
        expect(view.state.selection.ranges.map((range) => ({ anchor: range.anchor, head: range.head }))).toEqual([
          { anchor: 2, head: 2 },
          { anchor: 5, head: 7 },
        ]);
      },
    );
  });
});
