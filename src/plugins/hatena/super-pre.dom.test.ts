import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaSuperPreHighlightPlugin, hatenaSuperPreTokenClassName } from "./super-pre.js";

describe("hatenaSuperPreHighlightPlugin", () => {
  describe("with a languages option", () => {
    it("dynamically loads and highlights a language outside the JS/TS default", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: ">|python|\ndef f():\n    return 1\n||<",
          extensions: [createMboxExtension({ plugins: [hatenaSuperPreHighlightPlugin({ languages: ["python"] })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${hatenaSuperPreTokenClassName}`)).not.toBeNull();
      });

      view.destroy();
    });

    it('dynamically loads and highlights any registry language when given "all" instead of a whitelist', async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: '>|ruby|\nputs "hi"\n||<',
          extensions: [createMboxExtension({ plugins: [hatenaSuperPreHighlightPlugin({ languages: "all" })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${hatenaSuperPreTokenClassName}`)).not.toBeNull();
      });

      view.destroy();
    });

    it("leaves the `>|??|` auto-detect opener unhighlighted rather than guessing", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: ">|??|\nconst answer = 42;\n||<",
          extensions: [createMboxExtension({ plugins: [hatenaSuperPreHighlightPlugin({ languages: "all" })] })],
        }),
      });

      // The loader settles asynchronously; give it a tick before asserting the negative.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(parent.querySelector(`.${hatenaSuperPreTokenClassName}`)).toBeNull();

      view.destroy();
    });
  });
});
