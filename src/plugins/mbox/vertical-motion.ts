import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { MboxBlock } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export function moveCursorToPreviousBlockStart(view: EditorView, blockTypes: MboxBlock["type"][]): boolean {
  const range = view.state.selection.main;
  if (!range.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(range.head);
  if (range.head !== line.from || line.number <= 1) {
    return false;
  }

  const previousLineNumber = line.number - 1;
  const target = getMboxDocumentFromState(view.state).blocks.find(
    (block) => block.line === previousLineNumber && blockTypes.includes(block.type),
  );
  if (!target) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.cursor(target.from),
    scrollIntoView: true,
    userEvent: "select",
  });
  return true;
}
