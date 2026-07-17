import type { EditorState } from "@codemirror/state";
import { createDocumentCache, type DocumentCacheEntry } from "../../editor/document-cache.js";
import { parseHatenaDocument, type HatenaDocument } from "./parser.js";

// Every notation namespace owns its parse through one doc-keyed cache built at
// module level: the text is re-parsed only when `state.doc` changes, so cursor
// movement never re-parses. Every decoration plugin reads through this.
const hatenaDocumentCache = createDocumentCache(parseHatenaDocument);

export function getHatenaDocumentCacheEntryFromState(state: EditorState): DocumentCacheEntry<HatenaDocument> {
  return hatenaDocumentCache.getEntry(state);
}

export function getHatenaDocumentFromState(state: EditorState): HatenaDocument {
  return hatenaDocumentCache.get(state);
}
