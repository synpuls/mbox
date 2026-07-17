import { describe, expect, it } from "vitest";
import { createGfmEditorState, getGfmDocumentFromState } from "./gfm.js";

describe("./gfm sub-path", () => {
  it("exports getGfmDocumentFromState, resolving the GFM document for a real EditorState", () => {
    const state = createGfmEditorState({ doc: "# Hello" });

    expect(getGfmDocumentFromState(state).headings[0]).toMatchObject({ level: 1 });
  });
});
