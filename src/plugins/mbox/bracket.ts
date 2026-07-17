import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { MboxPlugin } from "../../editor/plugin.js";
import { bracketPairInputPlugin, createBracketPairTransaction } from "../bracket-pair-kit.js";

const mboxBracketPair = { open: "[", close: "]" };

export function insertMboxBracketPair(state: EditorState): TransactionSpec {
  return createBracketPairTransaction(state, mboxBracketPair);
}

export function mboxBracketPlugin(): MboxPlugin {
  return bracketPairInputPlugin(mboxBracketPair);
}
