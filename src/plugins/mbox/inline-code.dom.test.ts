import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  inlineCodeClassName,
  inlineCodePlugin,
} from "./inline-code.js";

describe("inlineCodePlugin", () => {
  it("hides backtick markers and marks inline code content in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "Use `code` here",
        extensions: [
          createMboxExtension({
            plugins: [inlineCodePlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("Use code here");
    expect(parent.querySelector(`.${inlineCodeClassName}`)?.textContent).toBe("code");

    view.destroy();
  });

  it("keeps raw inline code syntax on selected lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "Use `code` here",
        selection: EditorSelection.cursor(6),
        extensions: [
          createMboxExtension({
            plugins: [inlineCodePlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(6) });

    expect(parent.querySelector(`.${inlineCodeClassName}`)).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe("Use `code` here");

    view.destroy();
  });
});
