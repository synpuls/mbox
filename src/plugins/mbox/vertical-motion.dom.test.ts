import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { moveCursorToPreviousBlockStart } from "./vertical-motion.js";

function createView(doc: string, anchor: number, head = anchor): EditorView {
  return createEditorView({
    parent: document.createElement("div"),
    state: EditorState.create({ doc, selection: EditorSelection.range(anchor, head) }),
  });
}

describe("moveCursorToPreviousBlockStart", () => {
  it("moves the cursor to the previous line's block start when its type matches", () => {
    const view = createView("plain\n# Title\ntext", 14);

    expect(moveCursorToPreviousBlockStart(view, ["heading"])).toBe(true);
    expect(view.state.selection.main.head).toBe(6);
    expect(view.state.selection.main.empty).toBe(true);

    view.destroy();
  });

  it("matches any of the given block types", () => {
    const view = createView("> quote\ntext", 8);

    expect(moveCursorToPreviousBlockStart(view, ["heading", "quote"])).toBe(true);
    expect(view.state.selection.main.head).toBe(0);

    view.destroy();
  });

  it("does nothing when the selection is not empty", () => {
    const view = createView("# Title\ntext", 8, 12);

    expect(moveCursorToPreviousBlockStart(view, ["heading"])).toBe(false);
    expect(view.state.selection.main.anchor).toBe(8);
    expect(view.state.selection.main.head).toBe(12);

    view.destroy();
  });

  it("does nothing when the cursor is not at the start of its line", () => {
    const view = createView("# Title\ntext", 9);

    expect(moveCursorToPreviousBlockStart(view, ["heading"])).toBe(false);
    expect(view.state.selection.main.head).toBe(9);

    view.destroy();
  });

  it("does nothing on the first line", () => {
    const view = createView("# Title\ntext", 0);

    expect(moveCursorToPreviousBlockStart(view, ["heading"])).toBe(false);
    expect(view.state.selection.main.head).toBe(0);

    view.destroy();
  });

  it("does nothing when the previous line's block type does not match", () => {
    const view = createView("# Title\ntext", 8);

    expect(moveCursorToPreviousBlockStart(view, ["quote"])).toBe(false);
    expect(view.state.selection.main.head).toBe(8);

    view.destroy();
  });
});
