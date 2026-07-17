import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmFootnotePlugin } from "./footnote.js";

describe("gfmFootnotePlugin DOM", () => {
  it("renders linked footnote references and merges target semantics onto the definition line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "text[^1] more\n\n[^1]: the note",
        extensions: [createMboxExtension({ plugins: [gfmFootnotePlugin()] })],
      }),
    });

    const reference = parent.querySelector<HTMLAnchorElement>("a.mbox-gfm-footnote-ref");
    expect(reference?.getAttribute("href")).toBe("#gfm-footnote-15");
    expect(reference?.getAttribute("role")).toBe("doc-noteref");
    expect(reference?.getAttribute("aria-label")).toBe("Footnote 1");
    const definition = parent.querySelectorAll<HTMLElement>(".cm-line")[2];
    expect(definition?.getAttribute("id")).toBe("gfm-footnote-15");
    expect(definition?.getAttribute("role")).toBe("doc-footnote");
    expect(definition?.querySelector(".mbox-gfm-footnote-marker")?.getAttribute("aria-hidden")).toBe("true");
    view.destroy();
  });

  it("connects inactive continuation lines to the definition target and removes all semantics when one is selected", () => {
    const parent = document.createElement("div");
    const doc = "text[^1]\n\n[^1]: first\n  second";
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmFootnotePlugin()] })],
      }),
    });

    const definition = parent.querySelector<HTMLElement>("#gfm-footnote-10");
    expect(definition?.getAttribute("aria-owns")).toBe("gfm-footnote-10-line-22");
    expect(parent.querySelector<HTMLElement>("#gfm-footnote-10-line-22")).not.toBeNull();

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: doc.indexOf("  second") } });
    expect(parent.querySelector("#gfm-footnote-10")).toBeNull();
    expect(parent.querySelector("#gfm-footnote-10-line-22")).toBeNull();
    expect(parent.querySelector(".mbox-gfm-footnote-marker")?.getAttribute("aria-hidden")).toBeNull();
    view.destroy();
  });
});
