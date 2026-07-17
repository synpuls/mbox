import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type Extension, type SelectionRange } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  listClassNames,
  listPlugin,
  runListDeleteBackward,
  runListDeleteForward,
  runListEnter,
  runListIndent,
  runListLineStart,
  runListOutdent,
  runListSpace,
} from "./list.js";

// Drive a public list command against a real editor view (the pure edit
// builders behind the commands are module-private now), then read the resulting
// document text and caret. Returns null when the command falls through.
function runListCommand(
  doc: string,
  selection: EditorSelection | SelectionRange,
  command: (view: EditorView) => boolean,
  extensions: Extension[] = [],
): { doc: string; selection: number } | null {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [createMboxExtension({ plugins: [listPlugin()] }), ...extensions],
    }),
  });

  try {
    if (!command(view)) {
      return null;
    }
    return {
      doc: view.state.doc.toString(),
      selection: view.state.selection.main.head,
    };
  } finally {
    view.destroy();
  }
}

function withListView<T>(
  options: { doc: string; selection?: EditorSelection | SelectionRange; attach?: boolean },
  run: (context: { parent: HTMLElement; view: EditorView }) => T,
): T {
  const parent = document.createElement("div");
  if (options.attach) {
    document.body.append(parent);
  }
  const selection = options.selection instanceof EditorSelection
    ? options.selection
    : options.selection === undefined
      ? undefined
      : EditorSelection.create([options.selection]);
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      selection,
      extensions: [
        createMboxExtension({
          plugins: [listPlugin()],
        }),
      ],
    }),
  });

  try {
    return run({ parent, view });
  } finally {
    view.destroy();
    parent.remove();
  }
}

function applyListEnter(doc: string, selection: number): { doc: string; selection: number } | null {
  return runListCommand(doc, EditorSelection.cursor(selection), runListEnter);
}

function applyListIndent(
  doc: string,
  selection: EditorSelection | SelectionRange,
  direction: "indent" | "outdent",
): { doc: string; selection: number } | null {
  const editorSelection = selection instanceof EditorSelection ? selection : EditorSelection.create([selection]);
  return runListCommand(doc, editorSelection, direction === "indent" ? runListIndent : runListOutdent);
}

function applyListDeleteBackward(doc: string, selection: number): { doc: string; selection: number } | null {
  return runListCommand(doc, EditorSelection.cursor(selection), runListDeleteBackward);
}

function applyListDeleteBackwardWithSelection(doc: string, selection: EditorSelection): { doc: string; selection: number } | null {
  return runListCommand(doc, selection, runListDeleteBackward, [EditorState.allowMultipleSelections.of(true)]);
}

function applyListDeleteForward(doc: string, selection: number): { doc: string; selection: number } | null {
  return runListCommand(doc, EditorSelection.cursor(selection), runListDeleteForward);
}

function applyListLineStart(doc: string, selection: number): number | null {
  const result = runListCommand(doc, EditorSelection.cursor(selection), runListLineStart);
  return result === null ? null : result.selection;
}

function applyListSpace(doc: string, selection: number): { doc: string; selection: number } | null {
  return runListCommand(doc, EditorSelection.cursor(selection), runListSpace);
}

describe("listPlugin", () => {
  it("adds a syntax hide class to list syntax outside active raw syntax lines", () => {
    withListView(
      {
        doc: "# Heading\n- item",
        selection: EditorSelection.cursor(2),
      },
      ({ parent }) => {
        expect(parent.querySelector(".mbox-list-syntax-hide")?.textContent).toBe("- ");
      },
    );
  });

  it("adds an unfocused class to list lines outside the focused line in the editor view", () => {
    withListView(
      {
        doc: "# Heading\n- item",
        selection: EditorSelection.cursor(2),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.cm-line.mbox-list-unfocused-line.${listClassNames.ul}`)?.textContent).toBe("- item");
      },
    );
  });

  it("replaces focused list syntax so raw marker text is not rendered", () => {
    withListView(
      {
        doc: "- item",
        selection: EditorSelection.cursor(2),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.cursor(2) });

        expect(parent.querySelector(".cm-line")?.textContent).toBe("item");
      },
    );
  });

  it("replaces focused nested list syntax including leading spaces", () => {
    withListView(
      {
        doc: "  - nested",
        selection: EditorSelection.cursor(4),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.cursor(4) });

        expect(parent.querySelector(".cm-line")?.textContent).toBe("nested");
      },
    );
  });

  it("keeps nested list marker syntax as the bullet replacement slot", () => {
    withListView(
      {
        doc: "- root\n  - nested",
        selection: EditorSelection.cursor(2),
      },
      ({ parent }) => {
        const line = parent.querySelector(".cm-line.mbox-list-unfocused-line");
        const marker = line?.querySelector(".mbox-list-syntax-hide");

        expect(marker?.textContent).toBe("- ");
      },
    );
  });

  it("moves the unfocused list class when selection moves to another list line", () => {
    withListView(
      {
        doc: "- one\n- two",
        selection: EditorSelection.cursor(2),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.cursor(3) });

        expect(parent.querySelector(".cm-line.mbox-list-unfocused-line")?.textContent).toBe("- two");

        view.dispatch({
          selection: EditorSelection.cursor(8),
        });

        expect(parent.querySelector(".cm-line.mbox-list-unfocused-line")?.textContent).toBe("- one");
      },
    );
  });

  it("runs list editing through the registered keybinding", () => {
    withListView({ doc: "- item", selection: EditorSelection.cursor(6), attach: true }, ({ view }) => {
      const enterBinding = view.state.facet(keymap).flat().find((binding) => binding.key === "Enter");

      if (!enterBinding?.run) {
        throw new Error("Enter keybinding was not registered");
      }

      expect(enterBinding.run(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("- item\n- ");
      expect(view.state.selection.main.head).toBe(9);
    });
  });
});

describe("list editing commands", () => {
  it("continues a list item at the same depth when Enter is pressed at the end", () => {
    const result = applyListEnter("- item", 6);

    expect(result).toEqual({
      doc: "- item\n- ",
      selection: 9,
    });
  });

  it("continues a nested list item at the same depth", () => {
    const result = applyListEnter(" - item", 7);

    expect(result).toEqual({
      doc: " - item\n - ",
      selection: 11,
    });
  });

  it("continues a task list item as a new task list item", () => {
    const result = applyListEnter("- [ ] task", 10);

    expect(result).toEqual({
      doc: "- [ ] task\n- [ ] ",
      selection: 17,
    });
  });

  it("continues a checked task list item as an unchecked task list item", () => {
    const result = applyListEnter("- [x] done", 10);

    expect(result).toEqual({
      doc: "- [x] done\n- [ ] ",
      selection: 17,
    });
  });

  it("continues a nested task list item at the same depth", () => {
    const result = applyListEnter("  - [ ] task", 12);

    expect(result).toEqual({
      doc: "  - [ ] task\n  - [ ] ",
      selection: 21,
    });
  });

  it("removes an empty list marker and inserts a new empty line when Enter is pressed", () => {
    const result = applyListEnter("- ", 2);

    expect(result).toEqual({
      doc: "\n",
      selection: 1,
    });
  });

  it("indents a list item by one leading space", () => {
    const result = applyListIndent("- item", EditorSelection.cursor(2), "indent");

    expect(result?.doc).toBe(" - item");
  });

  it("indents an empty list marker by one leading space", () => {
    const result = applyListIndent("- ", EditorSelection.cursor(2), "indent");

    expect(result?.doc).toBe(" - ");
  });

  it("outdents a depth 2 list item to depth 1", () => {
    const result = applyListIndent("  - item", EditorSelection.cursor(4), "outdent");

    expect(result?.doc).toBe(" - item");
  });

  it("outdents an empty nested list marker by one leading space", () => {
    const result = applyListIndent(" - ", EditorSelection.cursor(3), "outdent");

    expect(result?.doc).toBe("- ");
  });

  it("outdents a root list item to plain text", () => {
    const result = applyListIndent("- item", EditorSelection.cursor(2), "outdent");

    expect(result?.doc).toBe("item");
  });

  it("outdents a root empty list marker to an empty line", () => {
    const result = applyListIndent("- ", EditorSelection.cursor(2), "outdent");

    expect(result?.doc).toBe("");
  });

  it("outdents a root empty list marker to an empty line when Backspace is pressed", () => {
    const result = applyListDeleteBackward("- ", 2);

    expect(result).toEqual({
      doc: "",
      selection: 0,
    });
  });

  it("outdents a nested empty list marker by one leading space when Backspace is pressed", () => {
    const result = applyListDeleteBackward("  - ", 4);

    expect(result).toEqual({
      doc: " - ",
      selection: 3,
    });
  });

  it("outdents an empty list marker by one leading space when Delete is pressed", () => {
    const result = applyListDeleteForward("  - ", 4);

    expect(result).toEqual({
      doc: " - ",
      selection: 3,
    });
  });

  it("deletes one list syntax character when Backspace is pressed inside the syntax", () => {
    expect(applyListDeleteBackward("  - ", 2)).toEqual({
      doc: " - ",
      selection: 1,
    });
  });

  it("deletes one list syntax character when Delete is pressed inside the syntax", () => {
    expect(applyListDeleteForward("  - ", 2)).toEqual({
      doc: " - ",
      selection: 1,
    });
  });

  it("does not use list Space when the cursor is inside empty list syntax", () => {
    expect(applyListSpace("  - ", 2)).toBeNull();
  });

  it("does not use list deletion with multiple cursors in empty list markers", () => {
    const selection = EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(5)]);

    expect(applyListDeleteBackwardWithSelection("- \n- ", selection)).toBeNull();
  });

  it("outdents a nested non-empty list item by one level at the content start when Backspace is pressed", () => {
    expect(applyListDeleteBackward("  - item", 4)).toEqual({
      doc: " - item",
      selection: 3,
    });
  });

  it("outdents a root non-empty list item to plain text at the content start when Backspace is pressed", () => {
    expect(applyListDeleteBackward("- item", 2)).toEqual({
      doc: "item",
      selection: 0,
    });
  });

  it("does not use list deletion in the content body", () => {
    expect(applyListDeleteBackward("- item", 4)).toBeNull();
    expect(applyListDeleteForward("- item", 4)).toBeNull();
  });

  it("moves to the content start on Ctrl-a", () => {
    expect(applyListLineStart("  - item", 8)).toBe(4);
  });

  it("moves from the true line start to the content start on Ctrl-a", () => {
    expect(applyListLineStart("  - item", 0)).toBe(4);
  });

  it("falls through when already at the content start so repeated Ctrl-a reaches the true line start", () => {
    expect(applyListLineStart("  - item", 4)).toBeNull();
  });

  it("falls through on a non-list line for Ctrl-a", () => {
    expect(applyListLineStart("plain", 3)).toBeNull();
  });

  it("turns a plain text line into a depth 1 list item when indented", () => {
    const result = applyListIndent("plain", EditorSelection.cursor(2), "indent");

    expect(result?.doc).toBe(" - plain");
  });

  it("turns an empty plain line into a root empty list marker when indented", () => {
    const result = applyListIndent("", EditorSelection.cursor(0), "indent");

    expect(result).toEqual({
      doc: "- ",
      selection: 2,
    });
  });

  it("does not use list Space handling on an empty plain line", () => {
    expect(applyListSpace("", 0)).toBeNull();
  });

  it("increases the nesting of an empty list marker when Space is pressed", () => {
    const result = applyListSpace("- ", 2);

    expect(result).toEqual({
      doc: " - ",
      selection: 3,
    });
  });

  it("does not use list Space handling for non-empty list items", () => {
    expect(applyListSpace("- item", 2)).toBeNull();
  });

  it("applies list indentation to task list items", () => {
    const indent = applyListIndent("- [ ] task", EditorSelection.cursor(2), "indent");
    const outdent = applyListIndent(" - [x] task", EditorSelection.cursor(4), "outdent");
    const outdentRoot = applyListIndent("- [x] task", EditorSelection.cursor(2), "outdent");

    expect(indent?.doc).toBe(" - [ ] task");
    expect(outdent?.doc).toBe("- [x] task");
    expect(outdentRoot?.doc).toBe("task");
  });

  it("indents every selected list, task list, and plain line", () => {
    const doc = "- one\n- [ ] task\nplain";
    const result = applyListIndent(doc, EditorSelection.range(0, doc.length), "indent");

    expect(result?.doc).toBe(" - one\n - [ ] task\n - plain");
  });

  it("outdents every selected list and task list line", () => {
    const doc = "  - one\n - [x] task\nplain";
    const result = applyListIndent(doc, EditorSelection.range(0, doc.length), "outdent");

    expect(result?.doc).toBe(" - one\n- [x] task\nplain");
  });

  it("does not run list editing inside fenced code blocks", () => {
    const doc = "```\n- item\nplain\n```";

    expect(applyListEnter(doc, 10)).toBeNull();
    expect(applyListIndent(doc, EditorSelection.cursor(6), "indent")).toBeNull();
  });

  it("does not run empty list marker editing inside fenced code blocks", () => {
    const doc = "```\n- \n```";

    expect(applyListDeleteBackward(doc, 6)).toBeNull();
    expect(applyListDeleteForward(doc, 6)).toBeNull();
    expect(applyListSpace(doc, 6)).toBeNull();
  });
});
