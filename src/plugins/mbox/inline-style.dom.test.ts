import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  inlineStyleClassNames,
  inlineStylePlugin,
} from "./inline-style.js";

describe("inlineStylePlugin", () => {
  it("hides markers and marks inline style content in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "*em* **strong** ~~strike~~",
        extensions: [
          createMboxExtension({
            plugins: [inlineStylePlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("em strong strike");
    expect(parent.querySelector(`.${inlineStyleClassNames.em}`)?.textContent).toBe("em");
    expect(parent.querySelector(`.${inlineStyleClassNames.strong}`)?.textContent).toBe("strong");
    expect(parent.querySelector(`.${inlineStyleClassNames.strike}`)?.textContent).toBe("strike");

    view.destroy();
  });

  it("keeps raw inline style syntax on selected lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "*em*",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [inlineStylePlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(2) });

    expect(parent.querySelector(`.${inlineStyleClassNames.em}`)).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe("*em*");

    view.destroy();
  });
});
