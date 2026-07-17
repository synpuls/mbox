import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { mboxFootnotePlugin } from "./footnote.js";

describe("mboxFootnotePlugin DOM", () => {
  it("renders linked footnote references and merges target semantics onto the definition line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "text[^1] more\n\n[^1]: the note",
        extensions: [createMboxExtension({ plugins: [mboxFootnotePlugin()] })],
      }),
    });

    const reference = parent.querySelector<HTMLAnchorElement>("a.mbox-footnote-ref");
    expect(reference?.getAttribute("href")).toBe("#mbox-footnote-15");
    expect(reference?.getAttribute("role")).toBe("doc-noteref");
    expect(reference?.getAttribute("aria-label")).toBe("Footnote 1");
    expect(reference?.getAttribute("title")).toBe("the note");
    const definition = parent.querySelectorAll<HTMLElement>(".cm-line")[2];
    expect(definition?.getAttribute("id")).toBe("mbox-footnote-15");
    expect(definition?.getAttribute("role")).toBe("doc-footnote");
    expect(definition?.getAttribute("aria-label")).toBe("Footnote 1");
    expect(definition?.querySelector(".mbox-footnote-marker")?.getAttribute("aria-hidden")).toBe("true");
    view.destroy();
  });
});
