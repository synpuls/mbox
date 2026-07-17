import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  tableClassNames,
  tablePlugin,
} from "./table.js";

describe("tablePlugin", () => {
  it("adds table classes in the editor view and hides pipe markers on inactive raw syntax lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| A | B |\n| --- | --- |\n| 1 | 2 |",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [tablePlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelectorAll(`.cm-line.${tableClassNames.table}`)).toHaveLength(3);
    expect(parent.querySelector(`.${tableClassNames.cell}`)?.textContent).toBe("A");
    expect(parent.textContent).not.toContain("| A | B |");
    expect(parent.textContent).toContain("AB");

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("mbox-table-0-row-1");
    expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);
    expect(parent.querySelector(`.${tableClassNames.delimiter}`)?.getAttribute("aria-hidden")).toBe("true");

    view.destroy();
  });
});
