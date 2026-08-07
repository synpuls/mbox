import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmLinkClassName, gfmLinkPlugin } from "./link.js";
import { gfmPlugins } from "./index.js";
import { gfmInlinePlugin } from "./inline.js";

describe("gfmInlinePlugin", () => {
  it("renders strong content in a strong element while retaining its presentation class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "**bold**",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const strong = parent.querySelector(".mbox-gfm-strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("bold");
    expect(strong?.tagName).toBe("STRONG");

    view.destroy();
  });

  it("renders emphasis content in an em element while retaining its presentation class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "*emphasis*",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const emphasis = parent.querySelector(".mbox-gfm-em");
    expect(emphasis).not.toBeNull();
    expect(emphasis?.textContent).toBe("emphasis");
    expect(emphasis?.tagName).toBe("EM");

    view.destroy();
  });

  it("renders deleted content in a del element while retaining its presentation class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "~~deleted~~",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const deleted = parent.querySelector(".mbox-gfm-del");
    expect(deleted).not.toBeNull();
    expect(deleted?.textContent).toBe("deleted");
    expect(deleted?.tagName).toBe("DEL");

    view.destroy();
  });

  it("nests a link that is the only thing inside emphasis/strong so the style still applies", () => {
    // Regression test: emphasis/strong compute their content range from their
    // mdast children (parser.ts), so `*[text](url)*` (a link with no other
    // text in the emphasis) makes the content mark's range identical to the
    // link's own replace range. Without inclusiveStart/inclusiveEnd on the
    // content mark, CodeMirror renders the link as a DOM sibling instead of
    // nesting it inside .mbox-gfm-em/-strong, so the italic/bold style
    // silently never applies to the link's text.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "a *[text](https://example.com)* b\nc **[text](https://example.com)** d",
        extensions: [createMboxExtension({ plugins: [gfmInlinePlugin(), gfmLinkPlugin()] })],
      }),
    });

    const [em, strong] = parent.querySelectorAll(".mbox-gfm-em, .mbox-gfm-strong");
    expect(em.querySelector(`.${gfmLinkClassName}`)).not.toBeNull();
    expect(strong.querySelector(`.${gfmLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});
