import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";

describe("gfmInlineCodePlugin", () => {
  it("renders inline code in a code element while retaining its presentation class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`code`",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const code = parent.querySelector(".mbox-gfm-code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("code");
    expect(code?.tagName).toBe("CODE");

    view.destroy();
  });
});
