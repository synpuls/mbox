import type { EditorState } from "@codemirror/state";
import { createDocumentCache } from "../../editor/document-cache.js";
import { parseGfmDocument, type GfmDocument } from "./parser.js";

// One doc-keyed cache for the whole GFM namespace: the mdast parse runs only when
// `state.doc` changes, never on cursor movement. Every decoration plugin reads the
// parsed GfmDocument through this, so the tree is walked once per edit.
const gfmDocumentCache = createDocumentCache(parseGfmDocument);

export function getGfmDocumentFromState(state: EditorState): GfmDocument {
  return gfmDocumentCache.get(state);
}
