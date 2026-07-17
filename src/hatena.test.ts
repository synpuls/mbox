import { describe, expect, it } from "vitest";
import { createHatenaEditorState, getHatenaDocumentFromState } from "./hatena.js";

describe("./hatena sub-path", () => {
  it("exports getHatenaDocumentFromState, resolving the Hatena document for a real EditorState", () => {
    const state = createHatenaEditorState({ doc: "*Hello" });

    expect(getHatenaDocumentFromState(state).lines[0]?.heading).toMatchObject({ level: 3 });
  });
});
