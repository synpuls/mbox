import type { EditorState } from "@codemirror/state";
import { createDocumentCache, type DocumentCacheEntry } from "../../editor/document-cache.js";
import { parseScrapboxDocument, type ScrapboxDocument } from "./parser.js";

const scrapboxDocumentCache = createDocumentCache(parseScrapboxDocument);

export function getScrapboxDocumentCacheEntryFromState(state: EditorState): DocumentCacheEntry<ScrapboxDocument> {
  return scrapboxDocumentCache.getEntry(state);
}

export function getScrapboxDocumentFromState(state: EditorState): ScrapboxDocument {
  return scrapboxDocumentCache.get(state);
}
