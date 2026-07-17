import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { paragraphClassNames, paragraphPlugin } from "./paragraph.js";

describe("paragraphPlugin", () => {
  it("adds paragraph classes in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "plain\n\n# heading",
        extensions: [
          createMboxExtension({
            plugins: [paragraphPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelectorAll(`.cm-line.${paragraphClassNames.paragraph}`)).toHaveLength(2);
    expect(parent.querySelector(`.cm-line.${paragraphClassNames.emptyLine}`)?.textContent).toBe("");
    expect(parent.querySelector(".cm-line:nth-child(3)")?.classList.contains(paragraphClassNames.paragraph)).toBe(false);

    view.destroy();
  });
});
