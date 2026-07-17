import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { urlLinkClassName, urlLinkPlugin } from "./url-link.js";

describe("urlLinkPlugin", () => {
  it("renders unfocused Markdown links as anchors in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Label](https://example.com)\n[Focused](https://example.org)",
        selection: EditorSelection.cursor(30),
        extensions: [
          createMboxExtension({
            plugins: [urlLinkPlugin()],
          }),
        ],
      }),
    });

    const link = parent.querySelector<HTMLAnchorElement>(`a.${urlLinkClassName}`);

    expect(link?.textContent).toBe("Label");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");
    expect(parent.querySelector(".cm-line")?.textContent).toBe("Label");

    view.destroy();
  });

  it("renders unfocused bare URLs as anchors in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "https://example.com\nhttps://focused.example",
        selection: EditorSelection.cursor(21),
        extensions: [
          createMboxExtension({
            plugins: [urlLinkPlugin()],
          }),
        ],
      }),
    });

    const link = parent.querySelector<HTMLAnchorElement>(`a.${urlLinkClassName}`);

    expect(link?.textContent).toBe("https://example.com");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer");

    view.destroy();
  });

  it("keeps raw Markdown links and bare URLs on selected lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[One](https://one.example)\nhttps://two.example",
        selection: EditorSelection.range(1, 29),
        extensions: [
          createMboxExtension({
            plugins: [urlLinkPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });

    expect(parent.querySelector(`.${urlLinkClassName}`)).toBeNull();
    expect(parent.textContent).toContain("[One](https://one.example)");
    expect(parent.textContent).toContain("https://two.example");

    view.destroy();
  });

  it("does not add URL link anchors inside fenced code blocks", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```\n[Label](https://example.com)\nhttps://example.com\n```\nhttps://example.org",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [urlLinkPlugin()],
          }),
        ],
      }),
    });

    const links = [...parent.querySelectorAll<HTMLAnchorElement>(`a.${urlLinkClassName}`)];

    expect(links.map((link) => link.textContent)).toEqual(["https://example.org"]);

    view.destroy();
  });

  it("does not replace mbox page links", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page]",
        selection: EditorSelection.cursor(6),
        extensions: [
          createMboxExtension({
            plugins: [urlLinkPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.${urlLinkClassName}`)).toBeNull();

    view.destroy();
  });

});
