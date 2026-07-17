import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// A small test/debug handle shape shared by the gfm/hatena demo entry points —
// Playwright drives each playground through it (see tests/layout/playground-helpers.ts).
// Not part of the library surface.
export interface PlaygroundHandle {
  view: EditorView;
  setDoc(nextDoc: string, selection?: number, shouldFocus?: boolean): void;
  setSelection(anchor: number, head?: number): void;
  selectionHead(): number;
  docString(): string;
  coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number } | null;
}

export function createPlaygroundHandle(view: EditorView): PlaygroundHandle {
  return {
    view,
    setDoc(nextDoc, selection = 0, shouldFocus = true) {
      if (shouldFocus) {
        view.focus();
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextDoc },
        selection: EditorSelection.cursor(selection),
      });
      if (!shouldFocus) {
        view.contentDOM.blur();
      }
    },
    setSelection(anchor, head = anchor) {
      view.focus();
      view.dispatch({ selection: EditorSelection.range(anchor, head) });
    },
    selectionHead() {
      return view.state.selection.main.head;
    },
    docString() {
      return view.state.doc.toString();
    },
    coordsAtPos(pos) {
      return view.coordsAtPos(pos);
    },
  };
}

declare global {
  interface Window {
    __mboxGfmPlayground?: PlaygroundHandle;
    __mboxHatenaPlayground?: PlaygroundHandle;
  }
}
