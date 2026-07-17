import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { scrapboxTitleLineClassName, scrapboxTitlePlugin } from "./title.js";

describe("scrapboxTitlePlugin", () => {
  it("adds the title line class to only the first line in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "Title\nbody",
        extensions: [createMboxExtension({ plugins: [scrapboxTitlePlugin()] })],
      }),
    });

    const lines = [...parent.querySelectorAll(".cm-line")];
    expect(lines[0]?.classList.contains(scrapboxTitleLineClassName)).toBe(true);
    expect(lines[1]?.classList.contains(scrapboxTitleLineClassName)).toBe(false);

    view.destroy();
  });
});
