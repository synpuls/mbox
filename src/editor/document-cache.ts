import type { EditorState } from "@codemirror/state";

export interface DocumentCacheEntry<TDocument> {
  input: string;
  document: TDocument;
}

export interface DocumentCache<TDocument> {
  getEntry(state: EditorState): DocumentCacheEntry<TDocument>;
  get(state: EditorState): TDocument;
}

/**
 * Cache one parsed document per text document (`state.doc`). Selection-only
 * updates produce a new `EditorState` but reuse the same immutable `Text`
 * instance, so keying on `state.doc` means the text is re-parsed only when it
 * actually changes — never on cursor movement.
 *
 * This is how a notation namespace owns its parse: build the cache once at
 * module level from a plain `parse(input)` function and read it from any
 * `EditorState` (decorations and keymaps alike).
 */
export function createDocumentCache<TDocument>(parse: (input: string) => TDocument): DocumentCache<TDocument> {
  const entries = new WeakMap<EditorState["doc"], DocumentCacheEntry<TDocument>>();

  return {
    getEntry(state) {
      const cached = entries.get(state.doc);
      if (cached) {
        return cached;
      }

      const input = state.doc.toString();
      const entry = { input, document: parse(input) };
      entries.set(state.doc, entry);
      return entry;
    },
    get(state) {
      return this.getEntry(state).document;
    },
  };
}
