import { WidgetType } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../editor/create-editor.js";
import { createMboxExtension, type MboxPlugin } from "../editor/plugin.js";
import { gfmTablePlugin } from "./gfm/table.js";
import { hatenaTablePlugin } from "./hatena/table.js";
import { tablePlugin } from "./mbox/table.js";
import { scrapboxTablePlugin } from "./scrapbox/table.js";

class WholeCellWidget extends WidgetType {
  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "table-kit-whole-cell-widget";
    element.textContent = "widget";
    return element;
  }
}

function wholeCellWidget(from: number, to: number): MboxPlugin {
  return {
    name: "test/whole-cell-widget",
    decorations: () => [{ type: "replace", from, to, widget: new WholeCellWidget() }],
  };
}

describe("table-kit lowering contract", () => {
  it.each([
    { name: "mbox", doc: "| a | b |\n| --- | --- |", from: 2, to: 3, table: tablePlugin(), cellClass: "mbox-table-cell" },
    { name: "gfm", doc: "| a | b |\n| --- | --- |", from: 2, to: 3, table: gfmTablePlugin(), cellClass: "mbox-gfm-table-cell" },
    { name: "scrapbox", doc: "table:t\n a\tb\n c\td", from: 9, to: 10, table: scrapboxTablePlugin(), cellClass: "mbox-scrapbox-table-cell" },
    { name: "hatena", doc: "|a|b|\n|c|d|", from: 1, to: 2, table: hatenaTablePlugin(), cellClass: "mbox-hatena-table-cell" },
  ] as const)("nests a whole-cell widget inside the $name cell", ({ doc, from, to, table, cellClass }) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc, extensions: [createMboxExtension({ plugins: [table, wholeCellWidget(from, to)] })] }),
    });

    const cell = parent.querySelector<HTMLElement>(`.${cellClass}`);
    expect(cell).not.toBeNull();
    expect(cell?.querySelector(".table-kit-whole-cell-widget")?.textContent).toBe("widget");

    view.destroy();
  });
});
