import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { GfmCodeBlockCopyButtonWidget, gfmCodeBlockHighlightPlugin } from "./code-block.js";

describe("GfmCodeBlockCopyButtonWidget", () => {
  it("clears a previous copy-failure flag after a later successful copy", async () => {
    let shouldFail = true;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          if (shouldFail) {
            throw new Error("denied");
          }
        },
      },
    });
    const button = new GfmCodeBlockCopyButtonWidget("const x = 1;\n", "mbox-gfm-code-copy-button").toDOM();

    button.click();
    await Promise.resolve();
    expect(button.dataset.copyFailed).toBe("true");

    shouldFail = false;
    button.click();
    await Promise.resolve();

    expect(button.dataset.copyFailed).toBeUndefined();
    expect(button.dataset.copied).toBe("true");
  });
});

describe("gfmCodeBlockHighlightPlugin", () => {
  describe("with a languages option", () => {
    it("dynamically loads and highlights a language outside the JS/TS default", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: "```python\nx = 1\n```",
          extensions: [createMboxExtension({ plugins: [gfmCodeBlockHighlightPlugin({ languages: ["python"] })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(".mbox-gfm-code-token")).not.toBeNull();
      });

      view.destroy();
    });

    it('dynamically loads and highlights any registry language when given "all" instead of a whitelist', async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: '```ruby\nputs "hi"\n```',
          extensions: [createMboxExtension({ plugins: [gfmCodeBlockHighlightPlugin({ languages: "all" })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(".mbox-gfm-code-token")).not.toBeNull();
      });

      view.destroy();
    });
  });
});
