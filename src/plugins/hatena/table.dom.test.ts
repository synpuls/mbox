import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaLinkPlugin } from "./link.js";
import { hatenaPrePlugin } from "./pre.js";
import { hatenaSuperPrePlugin } from "./super-pre.js";
import { hatenaTableClassNames, hatenaTablePlugin } from "./table.js";

describe("hatenaTablePlugin semantics", () => {
  it("keeps CodeMirror-normalized literal-block delimiters out of table rendering", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        // EditorState normalizes this CRLF input to LF before the plugins call
        // parseHatenaDocument. CRLF-specific parsing is guarded in parser.test;
        // this integration test guards the normalized EditorView behavior.
        doc: ">||\r\nconst a=1\r\n||<\r\n>|\r\ntext\r\n|<",
        extensions: [createMboxExtension({ plugins: [hatenaSuperPrePlugin(), hatenaPrePlugin(), hatenaTablePlugin()] })],
      }),
    });

    expect(view.state.doc.toString()).toBe(">||\nconst a=1\n||<\n>|\ntext\n|<");
    expect(parent.querySelectorAll('[role="table"]')).toHaveLength(0);

    view.destroy();
  });

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

  it("keeps a full-cell link widget inside its table cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "|[https://example.com/i.png]|b|\n|c|d|",
        extensions: [createMboxExtension({ plugins: [hatenaTablePlugin(), hatenaLinkPlugin()] })],
      }),
    });

    const cells = parent.querySelectorAll<HTMLElement>(`.${hatenaTableClassNames.cell}`);
    expect(cells).toHaveLength(4);
    expect([...cells].map((cell) => ({ role: cell.getAttribute("role"), colindex: cell.getAttribute("aria-colindex") }))).toEqual([
      { role: "cell", colindex: "1" },
      { role: "cell", colindex: "2" },
      { role: "cell", colindex: "1" },
      { role: "cell", colindex: "2" },
    ]);
    expect(cells[0]?.querySelector("a")?.textContent).toBe("https://example.com/i.png");

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);

    view.destroy();
  });
});
