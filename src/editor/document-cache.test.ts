import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createDocumentCache } from "./document-cache.js";

describe("createDocumentCache", () => {
  it("reuses the parsed document across selection-only editor states that share the same text document", () => {
    let parseCount = 0;
    const cache = createDocumentCache((input: string) => {
      parseCount += 1;
      return { input };
    });
    const state = EditorState.create({ doc: "ab" });

    const first = cache.get(state);
    const nextState = state.update({ selection: { anchor: 1 } }).state;
    const second = cache.get(nextState);

    expect(nextState).not.toBe(state);
    expect(nextState.doc).toBe(state.doc);
    expect(second).toBe(first);
    expect(parseCount).toBe(1);
  });

  it("parses again after the text document changes", () => {
    let parseCount = 0;
    const cache = createDocumentCache((input: string) => {
      parseCount += 1;
      return { input };
    });
    const state = EditorState.create({ doc: "a" });

    const first = cache.get(state);
    const nextState = state.update({ changes: { from: 1, insert: "b" } }).state;
    const second = cache.get(nextState);

    expect(second).not.toBe(first);
    expect(second.input).toBe("ab");
    expect(parseCount).toBe(2);
  });

  it("caches the source input together with the parsed document", () => {
    const cache = createDocumentCache((input: string) => ({ input }));
    const state = EditorState.create({ doc: "source" });

    const entry = cache.getEntry(state);

    expect(entry.input).toBe("source");
    expect(entry.document).toEqual({ input: "source" });
    expect(cache.getEntry(state)).toBe(entry);
  });
});
