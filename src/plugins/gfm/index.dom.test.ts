import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";

describe("gfmPlugins", () => {
  it("carries no code-block highlighter by default", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```js\nconst x = 1;\n```",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    expect(parent.querySelector(".mbox-gfm-code-token")).toBeNull();

    view.destroy();
  });

  it("adds the synchronous JS/TS highlighter when codeHighlight: true", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```js\nconst x = 1;\n```",
        extensions: [createMboxExtension({ plugins: gfmPlugins({ codeHighlight: true }) })],
      }),
    });

    expect(parent.querySelector(".mbox-gfm-code-token")).not.toBeNull();

    view.destroy();
  });

  it("forwards a codeHighlight options object through to the dynamic loader", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: '```ruby\nputs "hi"\n```',
        extensions: [createMboxExtension({ plugins: gfmPlugins({ codeHighlight: { languages: "all" } }) })],
      }),
    });

    await vi.waitFor(() => {
      expect(parent.querySelector(".mbox-gfm-code-token")).not.toBeNull();
    });

    view.destroy();
  });

  it("forwards custom link protocols to the link plugin", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[note](obsidian://open?vault=notes)",
        extensions: [
          createMboxExtension({
            plugins: gfmPlugins({ link: { additionalAllowedProtocols: ["obsidian"] } }),
          }),
        ],
      }),
    });

    expect(parent.querySelector("a.mbox-gfm-link")?.getAttribute("href")).toBe(
      "obsidian://open?vault=notes",
    );

    view.destroy();
  });
});
