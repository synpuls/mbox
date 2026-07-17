import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { getMboxDocumentFromState } from "./parser-cache.js";

describe("getMboxDocumentFromState", () => {
  it("parses the markdown notation document from editor state", () => {
    const state = EditorState.create({ doc: "# Title\nbody" });

    const document = getMboxDocumentFromState(state);

    expect(document.blocks[0]?.type).toBe("heading");
    expect(document.blocks[1]?.type).toBe("paragraph");
  });

  it("reuses the parsed document across selection-only editor states", () => {
    const state = EditorState.create({ doc: "# Title" });
    const first = getMboxDocumentFromState(state);
    const nextState = state.update({ selection: { anchor: 2 } }).state;

    expect(getMboxDocumentFromState(nextState)).toBe(first);
  });
});
