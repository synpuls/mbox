import { describe, expect, it } from "vitest";
import { createEditorState, createEditorView, createMboxExtension } from "./index.js";
import type { ScrapboxPageExistsResolver } from "./scrapbox.js";
import {
  createScrapboxEditor,
  createScrapboxEditorState,
  parseScrapboxDocument,
  scrapboxCompletionClassNames,
  scrapboxDefaultPresentationTheme,
  scrapboxLinkClassName,
  scrapboxPageMissingClassName,
  scrapboxPlugins,
} from "./scrapbox.js";

describe("./scrapbox sub-path", () => {
  it("exports the Scrapbox plugin bundle and representative helpers", () => {
    const pageExists: ScrapboxPageExistsResolver = (name) => name !== "Missing";

    expect(scrapboxPlugins()).toHaveLength(13);
    expect(scrapboxLinkClassName).toBe("mbox-scrapbox-link");
    expect(scrapboxPageMissingClassName).toBe("mbox-scrapbox-page-missing");
    expect(pageExists("Page")).toBe(true);
    expect(scrapboxCompletionClassNames).toEqual({
      option: "scrapbox-completion-option",
      optionWithPreview: "scrapbox-completion-option-with-preview",
      preview: "scrapbox-completion-preview",
      previewImage: "scrapbox-completion-preview-image",
    });
    expect(parseScrapboxDocument("[Page]").lines[0]?.inline[0]).toMatchObject({ type: "internalLink", href: "Page" });

    const parent = document.createElement("div");
    const state = createEditorState({
      doc: "plain",
      extensions: [createMboxExtension({ plugins: scrapboxPlugins() }), scrapboxDefaultPresentationTheme()],
    });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports createScrapboxEditorState/createScrapboxEditor, a notation-specific shortcut needing no notation option", () => {
    const state = createScrapboxEditorState({ doc: "[Page]" });

    expect(state.doc.toString()).toBe("[Page]");

    const parent = document.createElement("div");
    const view = createScrapboxEditor({ parent, doc: "[Page]" });

    expect(view.state.doc.toString()).toBe("[Page]");
    expect(parent.querySelector(`.${scrapboxLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});
