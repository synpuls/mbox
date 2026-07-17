import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  codeBlockHighlightClassNames,
  codeBlockHighlightPlugin,
  codeBlockClassNames,
  codeBlockPlugin,
  CodeBlockCopyButtonWidget,
} from "./code-block.js";

describe("createCodeBlockSpecs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a copy button widget that writes only code content to the clipboard", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    const button = new CodeBlockCopyButtonWidget("const x = 1\n", codeBlockClassNames.copyButton).toDOM();

    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toBe(codeBlockClassNames.copyButton);
    expect(button.textContent).toBe("Copy");

    button.click();
    await Promise.resolve();

    expect(written).toEqual(["const x = 1\n"]);
    expect(button.dataset.copied).toBe("true");
  });

  it("shows Copied for one second after a successful clipboard write", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => { },
      },
    });
    const button = new CodeBlockCopyButtonWidget("const x = 1\n", codeBlockClassNames.copyButton).toDOM();

    button.click();
    await Promise.resolve();

    expect(button.textContent).toBe("Copied");
    expect(button.dataset.copied).toBe("true");

    vi.advanceTimersByTime(999);
    expect(button.textContent).toBe("Copied");

    vi.advanceTimersByTime(1);
    expect(button.textContent).toBe("Copy");
    expect(button.dataset.copied).toBeUndefined();
  });
});

describe("codeBlockHighlightPlugin", () => {
  it("adds token classes in the editor view while fence markers are hidden", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```js\nconst x = 1\n```",
        selection: EditorSelection.cursor(7),
        extensions: [
          createMboxExtension({
            plugins: [codeBlockPlugin(), codeBlockHighlightPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)?.textContent).toBe("const");
    expect(parent.textContent).not.toContain("```js");
    expect(parent.textContent).toContain("const x = 1");
    expect(parent.textContent).not.toContain("```");

    view.destroy();
  });

  describe("with a languages option", () => {
    it("dynamically loads and highlights a language outside the JS/TS default", async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: "```python\nx = 1\n```",
          extensions: [createMboxExtension({ plugins: [codeBlockHighlightPlugin({ languages: ["python"] })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)).not.toBeNull();
      });

      view.destroy();
    });

    it('dynamically loads and highlights any registry language when given "all" instead of a whitelist', async () => {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: '```ruby\nputs "hi"\n```',
          extensions: [createMboxExtension({ plugins: [codeBlockHighlightPlugin({ languages: "all" })] })],
        }),
      });

      await vi.waitFor(() => {
        expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)).not.toBeNull();
      });

      view.destroy();
    });
  });
});

describe("codeBlockPlugin", () => {
  it("adds code block classes in the editor view while hiding inactive fence markers", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```ts\nconst x = 1\n```",
        selection: EditorSelection.cursor(7),
        extensions: [
          createMboxExtension({
            plugins: [codeBlockPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.block}`)).toHaveLength(3);
    expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.fenceLine}`)).toHaveLength(2);
    expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.openingFenceLine}`)).toHaveLength(1);
    expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.closingFenceLine}`)).toHaveLength(1);
    expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.contentLine}`)).toHaveLength(1);
    expect(parent.querySelector(".mbox-code-opening-fence")?.textContent).toBe("ts");
    expect(parent.querySelector(`.${codeBlockClassNames.info}`)?.textContent).toBe("ts");
    expect(parent.querySelector(`.${codeBlockClassNames.text}`)?.textContent).toBe("const x = 1");
    expect(parent.textContent).not.toContain("```ts");
    expect(parent.textContent).not.toContain("```");

    view.destroy();
  });

  it("keeps code block raw syntax on selected lines", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```ts\nconst x = 1\n```",
        selection: EditorSelection.range(1, 10),
        extensions: [
          createMboxExtension({
            plugins: [codeBlockPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.range(1, 10) });

    expect(parent.textContent).toContain("```ts");
    expect(parent.textContent).toContain("const x = 1");
    expect(parent.textContent).not.toContain("\n```");

    view.destroy();
  });

});
