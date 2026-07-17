import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { MboxIconWidget, iconClassName, iconImageClassName, pageLinkClassName, pageLinkPlugin } from "./page-link.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";
import type { PageLinkPluginOptions } from "./page-link.js";

const pageLinkSpecs = (doc: string, activeLines: Iterable<number> = [], options: PageLinkPluginOptions = {}) =>
  pageLinkPlugin(options).decorations!(createTestContext(doc, { activeLines }));

describe("createPageLinkSpecs", () => {
  it("passes resolved icon URLs to icon widgets", () => {
    const iconUrl = vi.fn((name: string) => `https://icons.example/${name}.png`);

    const [spec] = pageLinkSpecs("[name.icon]", [2], { iconUrl });
    const element = ((spec as MboxReplaceDecorationSpec).widget as MboxIconWidget).toDOM();
    const image = element.querySelector<HTMLImageElement>(`img.${iconImageClassName}`);

    expect(iconUrl).toHaveBeenCalledWith("name");
    expect(element).toMatchObject({
      tagName: "A",
      className: iconClassName,
    });
    expect(element.getAttribute("href")).toBe("./name");
    expect(element.getAttribute("title")).toBe("name");
    expect(image?.getAttribute("src")).toBe("https://icons.example/name.png");
    expect(image?.getAttribute("alt")).toBe("name");
  });

  it("falls back to icon text when iconUrl is omitted", () => {
    const [spec] = pageLinkSpecs("[name.icon]", [2]);

    const element = ((spec as MboxReplaceDecorationSpec).widget as MboxIconWidget).toDOM();

    expect(element.textContent).toBe("name");
    expect(element.querySelector("img")).toBeNull();
  });
});

describe("pageLinkPlugin", () => {
  it("adds a page link class to wiki links outside active raw syntax lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page]\n[Focused]",
        selection: EditorSelection.cursor(8),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin()],
          }),
        ],
      }),
    });

    const link = parent.querySelector<HTMLAnchorElement>(`a.${pageLinkClassName}`);

    expect(link?.textContent).toBe("Page");
    expect(link?.getAttribute("href")).toBe("./Page");
    expect(parent.querySelector(".cm-line")?.textContent).toBe("Page");

    view.destroy();
  });

  it("keeps the page link class on the whole raw wiki link while focused", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page]",
        selection: EditorSelection.cursor(1),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin()],
          }),
        ],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(1) });

    const linkText = parent.querySelector<HTMLElement>(`.${pageLinkClassName}`);

    expect(linkText?.textContent).toBe("[Page]");
    expect(parent.querySelector("a")).toBeNull();

    view.destroy();
  });

  it("renders icon images outside active raw syntax lines in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[name.icon]",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin({ iconUrl: (name) => `https://icons.example/${name}.png` })],
          }),
        ],
      }),
    });

    const icon = parent.querySelector<HTMLAnchorElement>(`a.${iconClassName}`);
    const image = icon?.querySelector<HTMLImageElement>(`img.${iconImageClassName}`);

    expect(icon?.getAttribute("href")).toBe("./name");
    expect(icon?.getAttribute("title")).toBe("name");
    expect(image?.getAttribute("src")).toBe("https://icons.example/name.png");
    expect(image?.getAttribute("alt")).toBe("name");

    view.destroy();
  });

  it("keeps focused icon syntax raw and undecorated", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[name.icon]",
        selection: EditorSelection.cursor(1),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin({ iconUrl: (name) => `https://icons.example/${name}.png` })],
          }),
        ],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(1) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("[name.icon]");
    expect(parent.querySelector(`.${iconClassName}`)).toBeNull();
    expect(parent.querySelector(`.${pageLinkClassName}`)).toBeNull();

    view.destroy();
  });

  it("does not add a page link class to Markdown links or images", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Label](https://example.com)\n![Alt](image.png)",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.${pageLinkClassName}`)).toBeNull();

    view.destroy();
  });

  it("does not add a page link class to bare URLs", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "https://example.com",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.${pageLinkClassName}`)).toBeNull();

    view.destroy();
  });

  it("does not add anchors for bracket syntax inside fenced code blocks in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```\nextensions: [basicSetup, markdown()]\n```\n[Page]",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin()],
          }),
        ],
      }),
    });

    const links = [...parent.querySelectorAll<HTMLAnchorElement>(`a.${pageLinkClassName}`)];

    expect(links.map((link) => link.textContent)).toEqual(["Page"]);

    view.destroy();
  });

  it("resolves the href through an injected pageUrl instead of the default ./name", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page]\n[Focused]",
        selection: EditorSelection.cursor(8),
        extensions: [
          createMboxExtension({
            plugins: [pageLinkPlugin({ pageUrl: (name) => `/wiki/${name}` })],
          }),
        ],
      }),
    });

    const link = parent.querySelector<HTMLAnchorElement>(`a.${pageLinkClassName}`);
    expect(link?.getAttribute("href")).toBe("/wiki/Page");

    view.destroy();
  });
});
