import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaPlugins } from "./index.js";

describe("hatenaPlugins", () => {
  it("passes a link idUrl resolver through the bundle to the rendered anchor", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "hi id:bob\nfocused",
        extensions: [createMboxExtension({ plugins: hatenaPlugins({ link: { idUrl: (name) => `/wiki/${name}` } }) })],
      }),
    });

    expect(parent.querySelector<HTMLAnchorElement>("a.mbox-hatena-link")?.getAttribute("href")).toBe("/wiki/bob");

    view.destroy();
  });

  it("renders no highlight tokens by default, and highlights JS synchronously with codeHighlight: true", () => {
    const doc = ">|js|\nconst x = 1;\n||<";
    const tokensWith = (codeHighlight: boolean | undefined) => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc,
          extensions: [createMboxExtension({ plugins: hatenaPlugins({ codeHighlight }) })],
        }),
      });
      const count = parent.querySelectorAll(".mbox-hatena-superpre-token").length;
      view.destroy();
      return count;
    };

    expect(tokensWith(undefined)).toBe(0);
    expect(tokensWith(true)).toBeGreaterThan(0);
  });
});
