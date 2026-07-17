import { EditorSelection, type ChangeSpec, type EditorState, type Line, type SelectionRange } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import type { MboxPlugin } from "../../editor/plugin.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

const whitespaceOnlyRegExp = /^\s+$/;

const indentUnit = " ";
const leadingWhitespaceRegExp = /^\s/;
const leadingWhitespaceRunRegExp = /^\s*/;

interface ScrapboxEdit {
  changes?: ChangeSpec | ChangeSpec[];
  selection?: EditorSelection | SelectionRange;
  userEvent?: string;
  scrollIntoView?: boolean;
}

/** Number of leading whitespace characters (one per Scrapbox indent level). */
function leadingWhitespaceLength(text: string): number {
  return leadingWhitespaceRunRegExp.exec(text)?.[0].length ?? 0;
}

/** The unique lines touched by any selection range, top to bottom. */
function selectedLines(state: EditorState): Line[] {
  const lineNumbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(selectionLineEnd(range));
    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      lineNumbers.add(lineNumber);
    }
  }

  return [...lineNumbers]
    .sort((a, b) => a - b)
    .map((lineNumber) => state.doc.line(lineNumber));
}

function selectionLineEnd(range: SelectionRange): number {
  return range.empty ? range.to : Math.max(range.from, range.to - 1);
}

function createScrapboxIndentEdit(state: EditorState): ScrapboxEdit {
  const changes: ChangeSpec[] = selectedLines(state).map((line) => ({ from: line.from, insert: indentUnit }));
  return { changes, userEvent: "input.indent", scrollIntoView: true };
}

function createScrapboxOutdentEdit(state: EditorState): ScrapboxEdit | null {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(state)) {
    if (leadingWhitespaceRegExp.test(state.doc.sliceString(line.from, line.to))) {
      changes.push({ from: line.from, to: line.from + 1 });
    }
  }

  return changes.length === 0 ? null : { changes, userEvent: "delete.dedent", scrollIntoView: true };
}

function createScrapboxBackspaceIndentEdit(state: EditorState): ScrapboxEdit | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  const indent = leadingWhitespaceLength(line.text);
  const column = range.head - line.from;
  // The character before the caret must be part of the leading indent.
  if (column < 1 || column > indent) {
    return null;
  }

  return {
    changes: { from: range.head - 1, to: range.head },
    selection: EditorSelection.cursor(range.head - 1),
    userEvent: "delete.backward",
    scrollIntoView: true,
  };
}

function createScrapboxLineStartEdit(state: EditorState): ScrapboxEdit | null {
  let anyIndent = false;

  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => {
      const line = state.doc.lineAt(range.head);
      const indent = leadingWhitespaceLength(line.text);
      if (indent > 0) {
        anyIndent = true;
      }
      return EditorSelection.cursor(line.from + indent);
    }),
    state.selection.mainIndex,
  );

  // Fall through when there is no indent to skip (content start == line start)
  // or when the caret is already at the content start.
  if (!anyIndent || selection.eq(state.selection)) {
    return null;
  }

  return { selection, scrollIntoView: true };
}

function createScrapboxEnterEmptyListEdit(state: EditorState): ScrapboxEdit | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to || !whitespaceOnlyRegExp.test(line.text)) {
    return null;
  }

  const document = getScrapboxDocumentFromState(state);
  if (scrapboxBlockLineNumbers(document).has(line.number)) {
    return null;
  }

  return {
    changes: { from: line.from, to: line.to, insert: "\n" },
    selection: EditorSelection.cursor(line.from + 1),
    userEvent: "input",
    scrollIntoView: true,
  };
}

/**
 * Indent every line touched by the selection by one Scrapbox indent level
 * (a single leading space). The selection is mapped through the insertions so
 * the cursor stays with its text.
 */
export function indentScrapboxLines(view: EditorView): boolean {
  const edit = createScrapboxIndentEdit(view.state);
  view.dispatch(view.state.update(edit));
  return true;
}

/**
 * Outdent every selected line that starts with whitespace by removing one
 * leading whitespace character. Returns false when nothing is indented so the
 * key can fall through to other handlers.
 */
export function outdentScrapboxLines(view: EditorView): boolean {
  const edit = createScrapboxOutdentEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch(view.state.update(edit));
  return true;
}

/**
 * Delete a single leading whitespace character when the caret sits inside a
 * line's indent. Scrapbox indent levels are one space each, so a backspace in
 * the indent must remove exactly one level. Without this, CodeMirror's
 * indent-unit-aware Backspace deletes a whole 2-space indent unit, collapsing
 * two Scrapbox levels at once. Returns false (falls through to the default
 * deletion) whenever the caret is not a plain cursor within the indent.
 */
export function backspaceScrapboxIndent(view: EditorView): boolean {
  const edit = createScrapboxBackspaceIndentEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch(view.state.update(edit));
  return true;
}

/**
 * Move every cursor to the start of its line's content, i.e. just to the right
 * of the indent whitespace (`"  xyz"` puts the caret left of `x`). Falls
 * through when the selection is already there, so a repeat press can reach the
 * true line start via the default line-boundary motion.
 */
export function scrapboxLineStart(view: EditorView): boolean {
  const edit = createScrapboxLineStartEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch(view.state.update(edit));
  return true;
}

/**
 * On an empty list line — one that holds only indent whitespace, with the caret
 * at its end — pressing Enter clears the whole line and drops the caret onto the
 * next line, instead of carrying the indentation down. Mirrors the markdown list
 * plugin's empty-list Enter behaviour. Falls through (returns false) for lines
 * with content, non-indented empty lines, mid-line carets, multi-cursor
 * selections and code/table block bodies.
 */
export function enterScrapboxEmptyList(view: EditorView): boolean {
  const edit = createScrapboxEnterEmptyListEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch(view.state.update(edit));
  return true;
}

export function scrapboxIndentPlugin(): MboxPlugin {
  return {
    keymap: [
      { key: "Enter", run: enterScrapboxEmptyList },
      { key: "Tab", run: indentScrapboxLines },
      { key: "Shift-Tab", run: outdentScrapboxLines },
      { key: "Backspace", run: backspaceScrapboxIndent },
      { key: "Ctrl-h", run: backspaceScrapboxIndent },
      { key: "Ctrl-a", run: scrapboxLineStart },
    ],
  };
}
