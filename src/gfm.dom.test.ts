import { describe, expect, it } from "vitest";
import { createEditorState, createEditorView, createMboxExtension } from "./index.js";
import {
  createGfmEditor,
  createGfmEditorState,
  gfmDefaultPresentationTheme,
  gfmLinkClassName,
  gfmMathClassName,
  gfmMathPlugin,
  gfmPlugins,
  gfmUnsafeLinkClassName,
  parseGfmDocument,
} from "./gfm.js";

describe("./gfm sub-path", () => {
  it("exports the GFM plugin bundle and representative helpers", () => {
    expect(gfmPlugins()).toHaveLength(11);
    expect(gfmLinkClassName).toBe("mbox-gfm-link");
    expect(gfmUnsafeLinkClassName).toBe("mbox-gfm-link-unsafe");
    expect(gfmMathClassName).toBe("mbox-gfm-math");
    expect(gfmMathPlugin({ render: () => document.createElement("span") }).name).toBe("gfm/math");
    expect(parseGfmDocument("# Hello").headings[0]).toMatchObject({ level: 1 });

    const parent = document.createElement("div");
    const state = createEditorState({
      doc: "plain",
      extensions: [createMboxExtension({ plugins: gfmPlugins() }), gfmDefaultPresentationTheme()],
    });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports createGfmEditorState/createGfmEditor, a notation-specific shortcut needing no notation option", () => {
    const state = createGfmEditorState({ doc: "[label](path)" });

    expect(state.doc.toString()).toBe("[label](path)");

    const parent = document.createElement("div");
    const view = createGfmEditor({ parent, doc: "[label](path)" });

    expect(view.state.doc.toString()).toBe("[label](path)");
    expect(parent.querySelector(`.${gfmLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});
