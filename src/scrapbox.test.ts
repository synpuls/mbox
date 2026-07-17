import { describe, expect, it } from "vitest";
import { createScrapboxEditorState, getScrapboxDocumentFromState } from "./scrapbox.js";

describe("./scrapbox sub-path", () => {
  it("exports getScrapboxDocumentFromState, resolving the Scrapbox document for a real EditorState", () => {
    const state = createScrapboxEditorState({ doc: "[Page]" });

    expect(getScrapboxDocumentFromState(state).lines[0]?.inline[0]).toMatchObject({ type: "internalLink", href: "Page" });
  });
});
