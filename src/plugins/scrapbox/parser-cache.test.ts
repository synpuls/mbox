import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { getScrapboxDocumentCacheEntryFromState, getScrapboxDocumentFromState } from "./parser-cache.js";

describe("getScrapboxDocumentFromState", () => {
  it("parses the Scrapbox notation document from editor state", () => {
    const state = EditorState.create({ doc: " item\ncode:hello.js" });

    const document = getScrapboxDocumentFromState(state);

    expect(document.lines[0]?.listType).toBe("bullet");
    expect(document.codeBlocks[0]?.fileName).toBe("hello.js");
  });

  it("reuses the parsed document across selection-only editor states", () => {
    const state = EditorState.create({ doc: " item" });
    const first = getScrapboxDocumentFromState(state);
    const nextState = state.update({ selection: { anchor: 2 } }).state;

    expect(getScrapboxDocumentFromState(nextState)).toBe(first);
  });

  it("exposes the source input alongside the parsed document", () => {
    const state = EditorState.create({ doc: " item" });

    const entry = getScrapboxDocumentCacheEntryFromState(state);

    expect(entry.input).toBe(" item");
    expect(entry.document).toBe(getScrapboxDocumentFromState(state));
  });
});
