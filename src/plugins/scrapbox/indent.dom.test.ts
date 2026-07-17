import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  backspaceScrapboxIndent,
  enterScrapboxEmptyList,
  indentScrapboxLines,
  outdentScrapboxLines,
  scrapboxIndentPlugin,
  scrapboxLineStart,
} from "./indent.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";

function viewWith(doc: string, selection = EditorSelection.cursor(0)) {
  const parent = document.createElement("div");
  return createEditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [createMboxExtension({ plugins: [scrapboxIndentPlugin()] })],
    }),
  });
}

describe("indentScrapboxLines", () => {
  it("adds one leading space to the current line and keeps the cursor with the text", () => {
    const view = viewWith("abc", EditorSelection.cursor(2));

    expect(indentScrapboxLines(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(" abc");
    expect(view.state.selection.main.head).toBe(3);

    view.destroy();
  });

  it("deepens an already indented line", () => {
    const view = viewWith(" abc", EditorSelection.cursor(0));

    indentScrapboxLines(view);
    expect(view.state.doc.toString()).toBe("  abc");

    view.destroy();
  });

  it("indents every line touched by the selection", () => {
    const view = viewWith("one\ntwo\nthree", EditorSelection.range(1, 9));

    indentScrapboxLines(view);
    expect(view.state.doc.toString()).toBe(" one\n two\n three");

    view.destroy();
  });

  it("does not indent the next line when the selection ends at that line start", () => {
    const view = viewWith("one\ntwo\nthree", EditorSelection.range(0, 4));

    indentScrapboxLines(view);
    expect(view.state.doc.toString()).toBe(" one\ntwo\nthree");

    view.destroy();
  });
});

describe("outdentScrapboxLines", () => {
  it("removes one leading whitespace character", () => {
    const view = viewWith("  abc", EditorSelection.cursor(3));

    expect(outdentScrapboxLines(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(" abc");

    view.destroy();
  });

  it("does nothing and reports unhandled when there is no indentation", () => {
    const view = viewWith("abc", EditorSelection.cursor(1));

    expect(outdentScrapboxLines(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("abc");

    view.destroy();
  });

  it("outdents every line touched by the selection that has indentation", () => {
    const view = viewWith(" one\n  two\nthree", EditorSelection.range(0, 12));

    outdentScrapboxLines(view);
    expect(view.state.doc.toString()).toBe("one\n two\nthree");

    view.destroy();
  });

  it("does not outdent the next line when the selection ends at that line start", () => {
    const view = viewWith(" one\n two\n three", EditorSelection.range(0, 5));

    outdentScrapboxLines(view);
    expect(view.state.doc.toString()).toBe("one\n two\n three");

    view.destroy();
  });
});

describe("backspaceScrapboxIndent", () => {
  it("deletes exactly one leading space when the caret sits at the content start", () => {
    // regression: CodeMirror's indent-aware Backspace would remove both spaces
    const view = viewWith("  abc", EditorSelection.cursor(2));

    expect(backspaceScrapboxIndent(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(" abc");
    expect(view.state.selection.main.head).toBe(1);

    view.destroy();
  });

  it("deletes only one space when the caret is inside the indent", () => {
    const view = viewWith("   abc", EditorSelection.cursor(1));

    expect(backspaceScrapboxIndent(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("  abc");

    view.destroy();
  });

  it("falls through (returns false) when the caret is in the content", () => {
    const view = viewWith("  abc", EditorSelection.cursor(4));

    expect(backspaceScrapboxIndent(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("  abc");

    view.destroy();
  });

  it("falls through at the very line start", () => {
    const view = viewWith("  abc", EditorSelection.cursor(0));

    expect(backspaceScrapboxIndent(view)).toBe(false);

    view.destroy();
  });

  it("falls through for a non-empty selection", () => {
    const view = viewWith("  abc", EditorSelection.range(0, 2));

    expect(backspaceScrapboxIndent(view)).toBe(false);

    view.destroy();
  });
});

describe("scrapboxLineStart", () => {
  it("moves the cursor to the content start, right of the indent", () => {
    const view = viewWith("  xyz", EditorSelection.cursor(4));

    expect(scrapboxLineStart(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(2);

    view.destroy();
  });

  it("moves from the true line start to the content start", () => {
    const view = viewWith("  xyz", EditorSelection.cursor(0));

    expect(scrapboxLineStart(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(2);

    view.destroy();
  });

  it("falls through when already at the content start so a repeat press reaches line start", () => {
    const view = viewWith("  xyz", EditorSelection.cursor(2));

    expect(scrapboxLineStart(view)).toBe(false);

    view.destroy();
  });

  it("falls through on a line without indentation", () => {
    const view = viewWith("xyz", EditorSelection.cursor(2));

    expect(scrapboxLineStart(view)).toBe(false);

    view.destroy();
  });
});

describe("enterScrapboxEmptyList", () => {
  it("clears a whitespace-only list line and moves the caret to the next line", () => {
    const view = viewWith("  ", EditorSelection.cursor(2));

    expect(enterScrapboxEmptyList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("\n");
    expect(view.state.selection.main.head).toBe(1);

    view.destroy();
  });

  it("keeps following lines and only clears the empty list line", () => {
    const view = viewWith(" one\n \ntwo", EditorSelection.cursor(6));

    // caret is at the end of the empty second line (" ")
    expect(enterScrapboxEmptyList(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(" one\n\n\ntwo");
    expect(view.state.selection.main.head).toBe(6);

    view.destroy();
  });

  it("falls through on a list line that has content", () => {
    const view = viewWith(" item", EditorSelection.cursor(5));

    expect(enterScrapboxEmptyList(view)).toBe(false);
    expect(view.state.doc.toString()).toBe(" item");

    view.destroy();
  });

  it("falls through on a non-indented empty line", () => {
    const view = viewWith("", EditorSelection.cursor(0));

    expect(enterScrapboxEmptyList(view)).toBe(false);

    view.destroy();
  });

  it("falls through when the caret is not at the line end", () => {
    const view = viewWith("  ", EditorSelection.cursor(1));

    expect(enterScrapboxEmptyList(view)).toBe(false);

    view.destroy();
  });

  it("falls through inside a code block", () => {
    // the indented body line under `code:` must keep the normal newline
    const view = viewWith("code:a\n ", EditorSelection.cursor(8));

    expect(enterScrapboxEmptyList(view)).toBe(false);

    view.destroy();
  });

  it("uses the prewarmed scrapbox document cache instead of stringifying the document again", () => {
    const view = viewWith("  ", EditorSelection.cursor(2));
    getScrapboxDocumentFromState(view.state);
    const toString = vi.spyOn(view.state.doc, "toString");

    expect(enterScrapboxEmptyList(view)).toBe(true);
    expect(toString).not.toHaveBeenCalled();

    view.destroy();
  });
});
