import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type MboxActiveLineNumbers = Set<number>;

export function getActiveLineNumbersFromState(state: EditorState): MboxActiveLineNumbers {
  const numbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const from = Math.min(Math.max(range.from, 0), state.doc.length);
    const to = Math.min(Math.max(range.to, 0), state.doc.length);
    const end = from === to ? to : Math.max(from, to - 1);
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(end).number;

    for (let number = startLine; number <= endLine; number += 1) {
      numbers.add(number);
    }
  }

  return numbers;
}

export function getActiveLineNumbersFromView(
  view: Pick<EditorView, "state"> & { hasFocus?: boolean },
): MboxActiveLineNumbers {
  if (view.hasFocus === false) {
    return new Set();
  }

  return getActiveLineNumbersFromState(view.state);
}
