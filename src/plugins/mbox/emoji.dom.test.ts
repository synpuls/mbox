import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { emojiClassName, emojiPlugin } from "./emoji.js";

describe("emojiPlugin", () => {
  it("adds an emoji widget outside active raw syntax lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: ":smile:\n:focused:",
        selection: EditorSelection.cursor(9),
        extensions: [
          createMboxExtension({
            plugins: [emojiPlugin()],
          }),
        ],
      }),
    });

    const token = parent.querySelector<HTMLElement>(`.${emojiClassName}`);

    expect(token?.textContent).toBe("smile");
    expect(parent.querySelector(".cm-line")?.textContent).toBe("smile");

    view.destroy();
  });

  it("keeps emoji raw syntax on selected lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: ":one:\n:two:",
        selection: EditorSelection.range(1, 7),
        extensions: [
          createMboxExtension({
            plugins: [emojiPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });

    expect([...parent.querySelectorAll(`.${emojiClassName}`)].map((element) => element.textContent)).toEqual([]);
    expect(parent.textContent).toContain(":one:");
    expect(parent.textContent).toContain(":two:");

    view.destroy();
  });

  it("does not add emoji widgets for emoji syntax inside fenced code blocks", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```\n:smile:\n```\n:ok:",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [emojiPlugin()],
          }),
        ],
      }),
    });

    expect([...parent.querySelectorAll(`.${emojiClassName}`)].map((element) => element.textContent)).toEqual(["ok"]);

    view.destroy();
  });
});
