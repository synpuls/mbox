import type { EditorState } from "@codemirror/state";
import { createDocumentCache } from "../../editor/document-cache.js";
import { parseMboxDocument } from "./parser.js";
import type { MboxDocument } from "./types.js";

const mboxDocumentCache = createDocumentCache((input) => parseMboxDocument(input));

export function getMboxDocumentFromState(state: EditorState): MboxDocument {
  return mboxDocumentCache.get(state);
}
