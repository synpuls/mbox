import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaFootnotePlugin } from "./footnote.js";

describe("hatenaFootnotePlugin DOM", () => {
  it("gives an inactive superscript a document-footnote role and accessible name", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "A((note))",
        extensions: [createMboxExtension({ plugins: [hatenaFootnotePlugin()] })],
      }),
    });

    const sup = parent.querySelector<HTMLElement>(".mbox-hatena-footnote");
    expect(sup?.getAttribute("role")).toBe("doc-footnote");
    expect(sup?.getAttribute("aria-label")).toBe("Footnote 1: note");
    expect(sup?.getAttribute("title")).toBe("note");
    view.destroy();
  });
});
