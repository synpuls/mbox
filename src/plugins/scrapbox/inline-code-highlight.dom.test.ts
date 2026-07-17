import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  createInlineCodeCacheClearer,
  scrapboxInlineCodeHighlightPlugin,
  scrapboxInlineCodeTokenClassName,
} from "./inline-code-highlight.js";

describe("scrapboxInlineCodeHighlightPlugin", () => {
  it("highlights inline code as Ruby once the language has finished loading", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });

    await vi.waitFor(() => {
      expect(parent.querySelector(`.${scrapboxInlineCodeTokenClassName}`)).not.toBeNull();
    });

    // Ruby classifies "do" as an actual language keyword here (RSpec's own
    // "describe"/"it" are just identifiers to a Ruby-only tokenizer) -- a
    // clear look at what the fixed-Ruby approximation actually produces.
    const keyword = parent.querySelector(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`);
    expect(keyword).not.toBeNull();
    expect(keyword?.textContent).toBe("do");

    view.destroy();
  });

  it("keeps inline code token colors on the active line", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });
    await vi.waitFor(() => {
      expect(parent.querySelector(`.${scrapboxInlineCodeTokenClassName}`)).not.toBeNull();
    });

    view.dispatch({ selection: { anchor: 0 } });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({});

    const keyword = parent.querySelector(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`);
    expect(keyword).not.toBeNull();
    expect(keyword?.textContent).toBe("do");

    view.destroy();
  });

  it("keeps active-line backticks literal without tokenizing the marker characters", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });
    await vi.waitFor(() => {
      expect(parent.querySelector(`.${scrapboxInlineCodeTokenClassName}`)).not.toBeNull();
    });

    view.dispatch({ selection: { anchor: 0 } });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({});

    const line = parent.querySelector(".cm-line");
    const markerIsTokenized = [...parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}`)].some(
      (el) => el.textContent === "`",
    );
    expect(line?.textContent).toContain("`describe User do`");
    expect(markerIsTokenized).toBe(false);

    view.destroy();
  });

  it("highlights the same inline code on both active and inactive lines", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`describe User do`\n`describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });
    await vi.waitFor(() => {
      expect(parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`).length).toBe(2);
    });

    view.dispatch({ selection: { anchor: 0 } });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({});

    const keywords = [...parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`)];
    expect(keywords).toHaveLength(2);
    expect(keywords.every((el) => el.textContent === "do")).toBe(true);

    view.destroy();
  });

  it("does not highlight inline code inside a code block or table", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "code:hello.rb\n `describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });

    // The code block's own line is the only backtick-looking text here, so
    // scrapboxDocumentHasInlineCode is false and Ruby never even starts
    // loading. Give that (non-)load a moment, then assert nothing appears.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(parent.querySelector(`.${scrapboxInlineCodeTokenClassName}`)).toBeNull();

    view.destroy();
  });

  it("does not highlight inline code inside a table block line", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`describe User do`\ntable:example\n `describe User do`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });

    await vi.waitFor(() => {
      expect(parent.querySelector(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`)).not.toBeNull();
    });

    const keywords = [...parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}.tok-keyword`)];
    expect(keywords).toHaveLength(1);
    expect(keywords[0]?.textContent).toBe("do");

    view.destroy();
  });

  it("reuses cached highlight specs (by text) across repeated decoration passes, offsetting them to each occurrence", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "`puts 1`\n`puts 1`",
        extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
      }),
    });

    await vi.waitFor(() => {
      expect(parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}.tok-number`).length).toBeGreaterThan(0);
    });

    const numbers = [...parent.querySelectorAll(`.${scrapboxInlineCodeTokenClassName}.tok-number`)];
    expect(numbers).toHaveLength(2);
    expect(numbers.every((el) => el.textContent === "1")).toBe(true);

    view.destroy();
  });

  it("clears the highlight cache on a doc change, so it never grows past the current document", () => {
    const cache = new Map([["stale", []]]);
    const view = createEditorView({
      parent: document.createElement("div"),
      state: EditorState.create({ doc: "x", extensions: [createInlineCodeCacheClearer(cache)] }),
    });

    expect(cache.size).toBe(1);
    view.dispatch({ changes: { from: 0, to: 1, insert: "y" } });
    expect(cache.size).toBe(0);

    view.destroy();
  });
});
