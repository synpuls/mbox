import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxCodeBlockClassName,
  scrapboxCodeBlockClassNames,
  scrapboxCodeBlockCopyButtonClassName,
  scrapboxCodeBlockFileNameClassName,
  scrapboxCodeBlockHighlightPlugin,
  scrapboxCodeBlockLanguageLabelClassName,
  scrapboxCodeBlockOpenerClassName,
  scrapboxCodeBlockPlugin,
} from "./code-block.js";

describe("scrapboxCodeBlockHighlightPlugin", () => {
  describe("with a languages option", () => {
    it("dynamically loads and highlights a language outside the JS/TS default", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: "code:a.py\n x = 1",
          extensions: [createMboxExtension({ plugins: [scrapboxCodeBlockHighlightPlugin({ languages: ["python"] })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).not.toBeNull();
      });

      view.destroy();
    });

    it("resolves a file name containing spaces here too, not just in the synchronous default", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: "code:my script.py\n x = 1",
          extensions: [createMboxExtension({ plugins: [scrapboxCodeBlockHighlightPlugin({ languages: ["python"] })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).not.toBeNull();
      });

      view.destroy();
    });

    it('dynamically loads and highlights any registry language when given "all" instead of a whitelist, still resolving a space-containing file name', async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: 'code:my script.rb\n puts "hi"',
          extensions: [createMboxExtension({ plugins: [scrapboxCodeBlockHighlightPlugin({ languages: "all" })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).not.toBeNull();
      });

      view.destroy();
    });
  });
});

describe("scrapboxCodeBlockPlugin", () => {
  it("adds code block classes to opener and body lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "code:a.js\n body\nafter",
        extensions: [createMboxExtension({ plugins: [scrapboxCodeBlockPlugin()] })],
      }),
    });

    expect(parent.querySelectorAll(`.${scrapboxCodeBlockClassName}`).length).toBe(2);
    // The opener line's own textContent now also picks up the Copy button
    // widget's "Copy" label, since the widget renders inline on that line.
    expect(parent.querySelector(`.${scrapboxCodeBlockOpenerClassName}`)?.textContent).toContain("code:a.js");
    expect(parent.querySelector(`.${scrapboxCodeBlockFileNameClassName}`)?.textContent).toBe("a.js");
    expect(parent.querySelector(`.${scrapboxCodeBlockLanguageLabelClassName}`)?.textContent).toBe("a.js");
    expect(parent.querySelector(`.${scrapboxCodeBlockCopyButtonClassName}`)).not.toBeNull();

    view.destroy();
  });
});
