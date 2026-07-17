import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaTablePlugin } from "./table.js";

describe("hatenaTablePlugin semantics", () => {
  it("renders its table tree in the CodeMirror DOM", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "|*名前|*色|\n|りんご|赤|",
        extensions: [createMboxExtension({ plugins: [hatenaTablePlugin()] })],
      }),
    });

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("hatena-table-0-row-1");
    expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);

    view.destroy();
  });
});
