import { EditorState } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { GfmCodeBlockCopyButtonWidget, gfmCodeBlockHighlightPlugin, gfmCodeBlockPlugin } from "./code-block.js";

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
  it("keeps a quote-prefixed unterminated-fence line visible as code source", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```ts\nconst a=1\n> ```",
        extensions: [createMboxExtension({ plugins: [gfmCodeBlockPlugin(), gfmCodeBlockHighlightPlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll(".cm-line")].at(-1)?.textContent).toBe("> ```");

    view.destroy();
  });

  it.each([
    ["a blockquoted fence", "> ```ts\n> const a=1\n> ```"],
    ["a nested blockquoted fence", "> > ```ts\n> > const a=1\n> > ```"],
    ["a list-item fence", "- item\n\n  ```ts\n  const a=1\n  ```"],
    ["a closing fence indented by three spaces", "```ts\nconst a=1\n   ```"],
  ])("hides the closing marker for %s", (_description, doc) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmCodeBlockPlugin(), gfmCodeBlockHighlightPlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll(".cm-line")].at(-1)?.textContent).not.toContain("```");

    view.destroy();
  });

  it.each([
    ["a four-space-indented code line", "```ts\nconst a=1\n    ```"],
    ["a closing run shorter than the opening fence", "````ts\nconst a=1\n```"],
  ])("keeps an unterminated candidate visible for %s", (_description, doc) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmCodeBlockPlugin(), gfmCodeBlockHighlightPlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll(".cm-line")].at(-1)?.textContent).toContain("```");

    view.destroy();
  });

  it("renders a blockquoted fence's token on its actual source text without hiding the `>` markers", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "> ```ts\n> const a = 1;\n> ```",
        extensions: [createMboxExtension({ plugins: [gfmCodeBlockPlugin(), gfmCodeBlockHighlightPlugin()] })],
      }),
    });

    expect(parent.querySelector(".mbox-gfm-code-token")?.textContent).toBe("const");
    expect([...parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(["> tsCopy", "> const a = 1;", "> "]);

    view.destroy();
  });

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

    it("loads the decoded GFM language id rather than the mdast lang projection", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: "```&#10;python\nx = 1\n```",
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
