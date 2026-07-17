import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { highlightingFor, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import {
  createEditorState,
  createMboxEditorState,
  defaultEditorPresentationThemeSpec,
  editorPresentationThemeSpecFor,
} from "./create-editor.js";

describe("createEditorState", () => {
  it("returns an EditorState with the given initial document", () => {
    const state = createEditorState({ doc: "# Hello" });

    expect(state).toBeInstanceOf(EditorState);
    expect(state.doc.toString()).toBe("# Hello");
  });

  it("returns an EditorState with the given initial selection", () => {
    const selection = EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(5)]);
    const state = createEditorState({ doc: "one\ntwo", selection });

    expect(state.selection.ranges.map((range) => range.from)).toEqual([1, 5]);
  });

  it("is editable and not read-only by default", () => {
    const state = createEditorState({ doc: "# Hello" });

    expect(state.facet(EditorState.readOnly)).toBe(false);
    expect(state.facet(EditorView.editable)).toBe(true);
  });

  it("does not include markdown language support by default", () => {
    const state = createEditorState({ doc: "# Hello" });
    const nodeNames: string[] = [];

    syntaxTree(state).iterate({
      enter: (node) => {
        nodeNames.push(node.name);
      },
    });

    expect(nodeNames).not.toContain("ATXHeading1");
  });

  it("does not include CodeMirror default syntax highlight by default", () => {
    const state = createEditorState({ doc: "# Hello" });

    expect(highlightingFor(state, [tags.heading])).toBeNull();
    expect(highlightingFor(state, [tags.link])).toBeNull();
  });

  it("does not bind Tab or Shift-Tab when no plugin handles them", () => {
    const state = createEditorState({ doc: "plain" });
    const bindings = state.facet(keymap).flat();

    expect(bindings.some((binding) => binding.key === "Tab")).toBe(false);
    expect(bindings.some((binding) => binding.key === "Shift-Tab")).toBe(false);
  });

  it("allows markdown language support to be opted in through extensions", () => {
    const state = createEditorState({ doc: "# Hello", extensions: [markdown()] });
    const nodeNames: string[] = [];

    syntaxTree(state).iterate({
      enter: (node) => {
        nodeNames.push(node.name);
      },
    });

    expect(nodeNames).toContain("ATXHeading1");
  });
});

describe("defaultEditorPresentationThemeSpec", () => {
  it("provides CSS-variable-overridable font size and padding for the editor container, and fills its parent's height", () => {
    expect(defaultEditorPresentationThemeSpec).toMatchObject({
      "&": { fontSize: "var(--mbox-editor-font-size, 15px)", minHeight: "var(--mbox-editor-min-height, 100%)" },
      ".cm-content": { padding: "var(--mbox-editor-padding, 18px)" },
    });
    // "&"'s 100% is relative -- it only ever matches the parent, so it never
    // fights an embedding context the way a fixed px floor would. The fixed,
    // playground-sized 560px floor on .cm-scroller/.cm-gutters stays opt-in.
    expect(defaultEditorPresentationThemeSpec).not.toHaveProperty(".cm-scroller");
    expect(defaultEditorPresentationThemeSpec).not.toHaveProperty(".cm-gutters");
  });

  it("carries no monospace font-family -- that's scoped to each construct's own plugin theme instead", () => {
    expect(JSON.stringify(defaultEditorPresentationThemeSpec)).not.toContain("monospace");
  });
});

describe("editorPresentationTheme", () => {
  it("builds the same default spec as defaultEditorPresentationThemeSpec when called with no options", () => {
    // Can't inspect the compiled Extension's spec directly, so this pins the
    // function to build on the same defaults as the exported constant --
    // catches the fontSize/padding/minHeight defaults drifting apart from it.
    expect(editorPresentationThemeSpecFor()).toEqual(defaultEditorPresentationThemeSpec);
  });

  it("uses an explicitly passed fontSize/padding as a plain literal, not a CSS variable", () => {
    // A host that already chose a value in JS owns it outright -- layering a
    // CSS variable on top would let an unrelated stylesheet silently
    // override a value the host deliberately set at the call site. The CSS
    // variable escape hatch only makes sense for the un-parameterized
    // default (see the test above).
    expect(editorPresentationThemeSpecFor({ fontSize: "16px", padding: "12px" })).toMatchObject({
      "&": { fontSize: "16px" },
      ".cm-content": { padding: "12px" },
    });
  });

  it("always CSS-variable-wraps \"&\"'s fill-parent minHeight -- it has no JS override of its own", () => {
    expect(editorPresentationThemeSpecFor({ fontSize: "16px" })["&"]).toMatchObject({
      minHeight: "var(--mbox-editor-min-height, 100%)",
    });
  });

  it("keeps the opt-in fixed minHeight (.cm-scroller/.cm-gutters) a plain literal, never CSS-variable-wrapped", () => {
    const spec = editorPresentationThemeSpecFor({ minHeight: "560px" });

    expect(spec[".cm-scroller"]).toEqual({ minHeight: "560px" });
    expect(spec[".cm-gutters"]).toEqual({ minHeight: "560px" });
  });
});

describe("createMboxEditorState", () => {
  it("passes readOnly through to the shared editor state assembly", () => {
    const state = createMboxEditorState({ doc: "# Hello", readOnly: true });

    expect(state.facet(EditorState.readOnly)).toBe(true);
    expect(state.facet(EditorView.editable)).toBe(false);
  });
});
