import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { search, searchKeymap } from "@codemirror/search";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { pageLinkClassName } from "../plugins/mbox/page-link.js";
import {
  createEditorState,
  createEditorView,
  createMboxEditor,
  createMboxEditorState,
  editorPresentationTheme,
} from "./create-editor.js";
import { createGfmEditor, createGfmEditorState } from "../gfm.js";
import { createHatenaEditor, createHatenaEditorState } from "../hatena.js";
import { createScrapboxEditor, createScrapboxEditorState } from "../scrapbox.js";
import type { MboxPlugin } from "./plugin.js";

describe("createEditorState", () => {
  it("gives the editable textbox a useful default accessible name", () => {
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state: createEditorState({ doc: "plain" }) });

    expect(view.contentDOM.getAttribute("role")).toBe("textbox");
    expect(view.contentDOM.getAttribute("aria-multiline")).toBe("true");
    expect(view.contentDOM.getAttribute("aria-label")).toBe("Text editor");

    view.destroy();
  });

  it("uses a non-blank ariaLabel and falls back for empty values", () => {
    const parent = document.createElement("div");
    const custom = createEditorView({ parent, state: createEditorState({ doc: "one", ariaLabel: "Article body" }) });
    const empty = createEditorView({ parent, state: createEditorState({ doc: "two", ariaLabel: "" }) });
    const whitespace = createEditorView({ parent, state: createEditorState({ doc: "three", ariaLabel: "  \t" }) });

    expect(custom.contentDOM.getAttribute("aria-label")).toBe("Article body");
    expect(empty.contentDOM.getAttribute("aria-label")).toBe("Text editor");
    expect(whitespace.contentDOM.getAttribute("aria-label")).toBe("Text editor");

    custom.destroy();
    empty.destroy();
    whitespace.destroy();
  });

  it("keeps host content attributes alongside its accessible name", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createEditorState({
        doc: "plain",
        ariaLabel: "Library label",
        extensions: [EditorView.contentAttributes.of({ "aria-label": "Host label", "aria-labelledby": "editor-heading" })],
      }),
    });

    expect(view.contentDOM.getAttribute("aria-label")).toBe("Host label");
    expect(view.contentDOM.getAttribute("aria-labelledby")).toBe("editor-heading");

    view.destroy();
  });

  it("keeps accessible names independent across multiple views", () => {
    const firstParent = document.createElement("div");
    const secondParent = document.createElement("div");
    const first = createEditorView({ parent: firstParent, state: createEditorState({ ariaLabel: "First editor" }) });
    const second = createEditorView({ parent: secondParent, state: createEditorState({ ariaLabel: "Second editor" }) });

    expect(first.contentDOM.getAttribute("aria-label")).toBe("First editor");
    expect(second.contentDOM.getAttribute("aria-label")).toBe("Second editor");

    first.destroy();
    second.destroy();
  });
  it("readOnly makes a viewer state: edits rejected and contenteditable dropped", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "# Hello", readOnly: true });

    expect(state.facet(EditorState.readOnly)).toBe(true);
    expect(state.facet(EditorView.editable)).toBe(false);

    const view = createEditorView({ parent, state });

    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");

    view.destroy();
  });

  it("does not highlight matching brackets by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "()" });

    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-matchingBracket")).toBeNull();

    view.destroy();
  });

  it("does not highlight other occurrences of the selected text by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "match match" });

    const view = createEditorView({ parent, state });
    view.dispatch({ selection: EditorSelection.range(0, 5) });

    expect(parent.querySelector(".cm-selectionMatch")).toBeNull();

    view.destroy();
  });

  it("does not open the CodeMirror search panel by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "find me" });
    const view = createEditorView({ parent, state });

    dispatchSearchShortcut(view);

    expect(parent.querySelector(".cm-search")).toBeNull();

    view.destroy();
  });

  it("does not render line numbers by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "one\ntwo" });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-lineNumbers")).toBeNull();

    view.destroy();
  });

  it("does not render a fold gutter by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "# one\n## two" });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-foldGutter")).toBeNull();

    view.destroy();
  });

  it("renders line numbers supplied as an extension", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "plain", extensions: [lineNumbers()] });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-gutters")).not.toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(parent.querySelector(".cm-foldGutter")).toBeNull();

    view.destroy();
  });

  it("does not highlight the focused line's background by default", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "one\ntwo" });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-activeLine")).toBeNull();

    view.destroy();
  });

  it("highlights the focused line's background when activeLine is true", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "one\ntwo", activeLine: true });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-activeLine")).not.toBeNull();

    view.destroy();
  });

  it("does not create a gutter or gutter highlight when activeLine is true on its own", () => {
    const parent = document.createElement("div");
    const activeLineOnly = createEditorView({ parent, state: createEditorState({ doc: "one", activeLine: true }) });
    expect(parent.querySelector(".cm-activeLineGutter")).toBeNull();
    activeLineOnly.destroy();

    const lineNumbersOnly = createEditorView({ parent, state: createEditorState({ doc: "one", extensions: [lineNumbers()] }) });
    expect(parent.querySelector(".cm-activeLineGutter")).toBeNull();
    lineNumbersOnly.destroy();
  });

  it("moves the active gutter highlight when the selection changes", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "one\ntwo", activeLine: true, extensions: [lineNumbers()] });
    const view = createEditorView({ parent, state });

    const gutterForLine = (line: string) =>
      [...parent.querySelectorAll<HTMLElement>(".cm-lineNumbers .cm-gutterElement")].find((gutter) => gutter.textContent === line);
    const firstLineGutter = gutterForLine("1");
    const secondLineGutter = gutterForLine("2");
    expect(firstLineGutter).toBeDefined();
    expect(secondLineGutter).toBeDefined();
    expect(firstLineGutter?.classList.contains("cm-activeLineGutter")).toBe(true);
    expect(secondLineGutter?.classList.contains("cm-activeLineGutter")).toBe(false);

    view.dispatch({ selection: { anchor: 4 } });

    expect(firstLineGutter?.classList.contains("cm-activeLineGutter")).toBe(false);
    expect(secondLineGutter?.classList.contains("cm-activeLineGutter")).toBe(true);

    view.destroy();
  });

  it("allows CodeMirror search to be opted in through extensions", () => {
    const parent = document.createElement("div");
    const state = createEditorState({
      doc: "find me",
      extensions: [search(), keymap.of(searchKeymap)],
    });
    const view = createEditorView({ parent, state });

    dispatchSearchShortcut(view);

    expect(parent.querySelector(".cm-search")).not.toBeNull();

    view.destroy();
  });

  it("creates an EditorView from a parent element and state", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "# Hello" });

    const view = createEditorView({ parent, state });

    expect(view).toBeInstanceOf(EditorView);
    expect(view.state).toBe(state);
    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });
});

describe("editorPresentationTheme", () => {
  it("returns an extension a host can opt into alongside createEditorState", () => {
    const parent = document.createElement("div");
    const state = createEditorState({ doc: "plain", extensions: [editorPresentationTheme()] });

    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });
});

describe("createMboxEditorState", () => {
  it("creates an mbox editor state by default with doc, selection, plugins, and extra extensions", () => {
    const selection = EditorSelection.cursor(1);
    const extraPlugin: MboxPlugin = {
      decorations: () => [{ type: "mark", from: 0, to: 6, className: "custom-plugin-mark" }],
    };
    const state = createMboxEditorState({
      doc: "plain\n[Page]",
      selection,
      link: { pageUrl: (name) => `/wiki/${name}` },
      extraPlugins: [extraPlugin],
      extensions: [EditorState.readOnly.of(true)],
    });
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state });

    expect(state.doc.toString()).toBe("plain\n[Page]");
    expect(state.selection.main.from).toBe(1);
    expect(state.facet(EditorState.readOnly)).toBe(true);
    expect(parent.querySelector<HTMLAnchorElement>(`a.${pageLinkClassName}`)?.getAttribute("href")).toBe("/wiki/Page");
    expect(parent.querySelector(".custom-plugin-mark")).not.toBeNull();

    view.destroy();
  });

  it("does not highlight the focused line's background or render line numbers by default", () => {
    const parent = document.createElement("div");
    const state = createMboxEditorState({ doc: "one\ntwo" });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-activeLine")).toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).toBeNull();

    view.destroy();
  });

  it("forwards activeLine and extensions through to the underlying editor state", () => {
    const parent = document.createElement("div");
    const state = createMboxEditorState({ doc: "one\ntwo", activeLine: true, extensions: [lineNumbers()] });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-activeLine")).not.toBeNull();
    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(parent.querySelector(".cm-activeLineGutter")).not.toBeNull();

    view.destroy();
  });
});

describe("createMboxEditor", () => {
  it("creates an EditorView from a parent and high-level editor state options", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({ parent, doc: "[Page]" });

    expect(view).toBeInstanceOf(EditorView);
    expect(view.state.doc.toString()).toBe("[Page]");
    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    expect(parent.querySelector(`.${pageLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});

describe("notation editor shortcuts", () => {
  it("forwards ariaLabel through every state and view shortcut", () => {
    const states = [
      createMboxEditorState({ ariaLabel: "mbox state" }),
      createGfmEditorState({ ariaLabel: "gfm state" }),
      createHatenaEditorState({ ariaLabel: "hatena state" }),
      createScrapboxEditorState({ ariaLabel: "scrapbox state" }),
    ];
    const parents = states.map(() => document.createElement("div"));
    const views = states.map((state, index) => createEditorView({ parent: parents[index], state }));

    expect(views.map((view) => view.contentDOM.getAttribute("aria-label"))).toEqual([
      "mbox state",
      "gfm state",
      "hatena state",
      "scrapbox state",
    ]);

    views.forEach((view) => view.destroy());

    const viewShortcuts = [
      createMboxEditor({ parent: document.createElement("div"), ariaLabel: "mbox view" }),
      createGfmEditor({ parent: document.createElement("div"), ariaLabel: "gfm view" }),
      createHatenaEditor({ parent: document.createElement("div"), ariaLabel: "hatena view" }),
      createScrapboxEditor({ parent: document.createElement("div"), ariaLabel: "scrapbox view" }),
    ];

    expect(viewShortcuts.map((view) => view.contentDOM.getAttribute("aria-label"))).toEqual([
      "mbox view",
      "gfm view",
      "hatena view",
      "scrapbox view",
    ]);

    viewShortcuts.forEach((view) => view.destroy());
  });
});

function dispatchSearchShortcut(view: EditorView) {
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }));
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }));
}
