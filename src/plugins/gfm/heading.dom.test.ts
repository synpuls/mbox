import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";
import { gfmHeadingSetextUnderlineClassName } from "./heading.js";

function createHeadingView(doc: string, selection?: number) {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: selection === undefined ? undefined : EditorSelection.cursor(selection),
      extensions: [createMboxExtension({ plugins: gfmPlugins() })],
    }),
  });
  return { parent, view };
}

describe("gfm setext headings", () => {
  it("hides the underline line while idle", () => {
    const { parent, view } = createHeadingView("Title\n=====");
    const underline = parent.querySelector<HTMLElement>(`.cm-line.${gfmHeadingSetextUnderlineClassName}`);

    expect(underline).not.toBeNull();
    document.body.appendChild(parent);
    expect(getComputedStyle(underline!).display).toBe("none");

    view.destroy();
    parent.remove();
  });

  it.each([
    ["heading text", 0],
    ["underline", "Title\n".length],
  ])("restores the complete raw setext source when the %s line is active", (_part, selection) => {
    const doc = "Title\n=====";
    const { parent, view } = createHeadingView(doc, selection);

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(selection) });

    expect(parent.querySelector(`.cm-line.${gfmHeadingSetextUnderlineClassName}`)).toBeNull();
    expect([...parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(["Title", "====="]);

    view.destroy();
  });

  it.each([
    ["thematic break", "- - -", 0],
    ["standalone equals", "===", 0],
    ["blank-line-separated equals", "Title\n\n=====", 2],
  ])("does not hide the source line for a non-heading %s", (_description, doc, lineIndex) => {
    const { parent, view } = createHeadingView(doc);
    document.body.appendChild(parent);
    const line = parent.querySelectorAll<HTMLElement>(".cm-line")[lineIndex];

    // Establish that this is a real line before making the absence assertion.
    expect(line).toBeDefined();
    expect(line.classList.contains(gfmHeadingSetextUnderlineClassName)).toBe(false);
    expect(getComputedStyle(line).display).not.toBe("none");

    view.destroy();
    parent.remove();
  });
});
