import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { MboxPlugin } from "../../editor/plugin.js";
import { bracketPairInputPlugin, createBracketPairTransaction } from "../bracket-pair-kit.js";

const scrapboxBracketPair = { open: "[", close: "]" };

/**
 * A transaction that surrounds each selection range with `[` … `]` and leaves
 * the caret/selection inside. For an empty selection it inserts `[]` with the
 * caret between the brackets (the Scrapbox link/icon entry point); for a
 * non-empty selection it wraps the selected text and keeps it selected.
 *
 * The document text stays the single source of truth — this is a plain edit, so
 * undo/redo and every decoration plugin see the closing bracket as real text.
 */
export function insertScrapboxBracketPair(state: EditorState): TransactionSpec {
  return createBracketPairTransaction(state, scrapboxBracketPair);
}

/**
 * Auto-close the Scrapbox `[` bracket: typing `[` inserts the matching `]` and
 * drops the caret between them, so the user starts an empty `[]` ready for a
 * page link, icon or (later) an autocomplete popup. A non-empty selection is
 * wrapped instead. Everything else — IME composition, paste, other keys — falls
 * through untouched.
 */
export function scrapboxBracketPlugin(): MboxPlugin {
  return bracketPairInputPlugin(scrapboxBracketPair);
}
