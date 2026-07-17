// Its own file, not folded into create-editor.test.ts: CodeMirror mounts all
// EditorView.theme() rules into one shared, cumulative <style> element per
// document, and never removes a rule once a view has requested it (even
// after that view is destroyed). A per-file happy-dom document keeps that
// history from leaking in from unrelated describe blocks that create an
// editor with the default (enabled) presentation theme.
//
// "disable only the notation presentation theme" (which keeps the
// container theme on, and so leaves --mbox-editor-font-size in the shared
// stylesheet) lives in its own sibling file
// (create-editor-presentation-notation.test.ts): it and "disable only the
// container presentation theme" below each check the absence of a token the
// OTHER test unavoidably emits, so neither order would let both live in one
// file.

import { describe, expect, it } from "vitest";
import { pageLinkClassName } from "../plugins/mbox/page-link.js";
import { createMboxEditor } from "./create-editor.js";

describe("createMboxEditor presentation", () => {
  it("can disable all bundled presentation themes", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({ parent, doc: "[Page]", presentation: false });

    expect(parent.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    expect(styleText()).not.toContain("--mbox-page-link-color");

    view.destroy();
  });

  it("can disable only the container presentation theme", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({
      parent,
      doc: "[Page]",
      presentation: { container: false },
    });

    expect(parent.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    expect(styleText()).not.toContain("--mbox-editor-font-size");

    view.destroy();
  });
});

function styleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}
