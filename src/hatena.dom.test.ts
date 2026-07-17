import { describe, expect, it } from "vitest";
import { createEditorState, createEditorView, createMboxExtension } from "./index.js";
import { createHatenaEditor, createHatenaEditorState, hatenaDefaultPresentationTheme, hatenaLinkClassName, hatenaPlugins, parseHatenaDocument } from "./hatena.js";

describe("./hatena sub-path", () => {
  it("exports the Hatena plugin bundle and representative helpers", () => {
    expect(hatenaPlugins()).toHaveLength(9);
    expect(hatenaLinkClassName).toBe("mbox-hatena-link");
    expect(parseHatenaDocument("*Hello").lines[0]?.heading).toMatchObject({ level: 3 });

    const parent = document.createElement("div");
    const state = createEditorState({
      doc: "plain",
      extensions: [createMboxExtension({ plugins: hatenaPlugins() }), hatenaDefaultPresentationTheme()],
    });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports createHatenaEditorState/createHatenaEditor, a notation-specific shortcut needing no notation option", () => {
    const state = createHatenaEditorState({ doc: "id:bob" });

    expect(state.doc.toString()).toBe("id:bob");

    const parent = document.createElement("div");
    const view = createHatenaEditor({ parent, doc: "id:bob" });

    expect(view.state.doc.toString()).toBe("id:bob");
    expect(parent.querySelector(`.${hatenaLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});
