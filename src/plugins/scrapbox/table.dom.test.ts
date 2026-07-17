import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxTableCellClassName,
  scrapboxTableHeaderClassName,
  scrapboxTableOpenerClassName,
  scrapboxTablePlugin,
  scrapboxTableRowClassName,
} from "./table.js";

describe("scrapboxTablePlugin", () => {
  it("styles the table as an aligned grid in the editor view, with the first row as a header", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:example\n abc\tdef\n 12\t34",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxTableOpenerClassName}`)?.textContent).toBe("table:example");
    expect(parent.querySelectorAll(`.${scrapboxTableRowClassName}`).length).toBe(2);
    expect(parent.querySelectorAll(`.${scrapboxTableHeaderClassName}`).length).toBe(1);
    expect([...parent.querySelectorAll(`.${scrapboxTableCellClassName}`)].map((el) => el.textContent)).toEqual([
      "abc",
      "def",
      "12",
      "34",
    ]);
    // the leading indent and tab separators are hidden on this idle table
    expect(parent.textContent).not.toContain("\t");

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("scrapbox-table-0-row-1");
    expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);

    view.destroy();
  });
});
