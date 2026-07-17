import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmTablePlugin } from "./table.js";

describe("gfmTablePlugin semantics", () => {
  it("renders the complete table tree in the DOM only while all table rows are inactive", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| A | B |\n|:--|--:|\n| 1 | 2 |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin()] })],
      }),
    });

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table).not.toBeNull();
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("gfm-table-0-row-1");
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);
    expect(parent.querySelector('.mbox-gfm-table-delimiter')?.getAttribute("aria-hidden")).toBe("true");

    view.destroy();
  });
});
