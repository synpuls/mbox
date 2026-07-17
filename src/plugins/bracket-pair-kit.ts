import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxPlugin } from "../editor/plugin.js";

export interface BracketPairKitOptions {
  open: string;
  close: string;
  requireNonEmptySelection?: boolean;
}

export function createBracketPairTransaction(state: EditorState, options: BracketPairKitOptions): TransactionSpec {
  return state.changeByRange((range) => ({
    changes: [
      { from: range.from, insert: options.open },
      { from: range.to, insert: options.close },
    ],
    range: EditorSelection.range(range.from + options.open.length, range.to + options.open.length),
  }));
}

export function bracketPairInputPlugin(options: BracketPairKitOptions): MboxPlugin {
  return {
    extensions: [
      EditorView.inputHandler.of((view, _from, _to, text) => {
        if (text !== options.open || view.state.readOnly) {
          return false;
        }
        if (options.requireNonEmptySelection && view.state.selection.ranges.every((range) => range.empty)) {
          return false;
        }
        view.dispatch(createBracketPairTransaction(view.state, options), {
          userEvent: "input.type",
          scrollIntoView: true,
        });
        return true;
      }),
    ],
  };
}
