import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { type EditorView } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  markdownImageClassName,
  markdownImageClassNames,
  markdownImagePlugin,
} from "./markdown-image.js";

function withMarkdownImageView<T>(
  options: {
    doc: string;
    selection?: EditorSelection | SelectionRange;
    plugin?: ReturnType<typeof markdownImagePlugin>;
  },
  run: (context: { parent: HTMLElement; view: EditorView }) => T,
): T {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      selection: options.selection,
      extensions: [
        createMboxExtension({
          plugins: [options.plugin ?? markdownImagePlugin()],
        }),
      ],
    }),
  });

  try {
    return run({ parent, view });
  } finally {
    view.destroy();
  }
}

describe("markdownImagePlugin", () => {
  it("renders unfocused Markdown images as image token widgets", () => {
    withMarkdownImageView(
      {
        doc: "![Alt](image.png)\n![Focused](focused.png)",
        selection: EditorSelection.cursor(19),
      },
      ({ parent }) => {
        const token = parent.querySelector<HTMLElement>(`.${markdownImageClassName}`);

        expect(token?.tagName).toBe("SPAN");
        expect(token?.textContent).toBe("Alt");
        expect(token?.dataset.alt).toBe("Alt");
        expect(token?.dataset.src).toBe("image.png");
        expect(token?.querySelector("img")).toBeNull();
      },
    );
  });

  it("keeps token rendering as the default render mode", () => {
    withMarkdownImageView(
      {
        doc: "![Alt](image.png)",
        selection: EditorSelection.cursor(17),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${markdownImageClassNames.token}`)).not.toBeNull();
        expect(parent.querySelector(`.${markdownImageClassNames.preview}`)).toBeNull();
      },
    );
  });

  it("renders opt-in preview mode as a figure with lazy image attributes and no inline placeholder size", () => {
    withMarkdownImageView(
      {
        doc: "![Alt](image.png)",
        selection: EditorSelection.cursor(17),
        plugin: markdownImagePlugin({ renderMode: "preview" }),
      },
      ({ parent }) => {
        const figure = parent.querySelector<HTMLElement>(`.${markdownImageClassNames.preview}`);
        const image = figure?.querySelector<HTMLImageElement>(`.${markdownImageClassNames.element}`);

        expect(figure?.tagName).toBe("FIGURE");
        expect(figure?.classList.contains(markdownImageClassName)).toBe(true);
        expect(figure?.dataset.alt).toBe("Alt");
        expect(figure?.dataset.src).toBe("image.png");
        expect(figure?.querySelector("a")).toBeNull();
        expect(figure?.onclick).toBeNull();
        expect(figure?.style.width).toBe("");
        expect(figure?.style.minHeight).toBe("");
        expect(image?.src).toContain("image.png");
        expect(image?.alt).toBe("Alt");
        expect(image?.loading).toBe("lazy");
        expect(image?.decoding).toBe("async");
      },
    );
  });

  it("ignores accepted Markdown image titles when rendering tokens and previews", () => {
    withMarkdownImageView(
      {
        doc: '![Alt](image.png "Title")',
        selection: EditorSelection.cursor(24),
      },
      ({ parent: tokenParent }) => {
        const token = tokenParent.querySelector<HTMLElement>(`.${markdownImageClassName}`);
        expect(token?.dataset.src).toBe("image.png");
        expect(token?.dataset.title).toBeUndefined();
        expect(token?.textContent).toBe("Alt");
      },
    );

    withMarkdownImageView(
      {
        doc: '![Alt](image.png "Title")',
        selection: EditorSelection.cursor(24),
        plugin: markdownImagePlugin({ renderMode: "preview" }),
      },
      ({ parent: previewParent }) => {
        const figure = previewParent.querySelector<HTMLElement>(`.${markdownImageClassNames.preview}`);
        const image = figure?.querySelector<HTMLImageElement>(`.${markdownImageClassNames.element}`);
        expect(figure?.dataset.src).toBe("image.png");
        expect(figure?.dataset.title).toBeUndefined();
        expect(image?.src).toContain("image.png");
        expect(image?.title).toBe("");
      },
    );
  });

  it("keeps empty alt text empty in preview images", () => {
    withMarkdownImageView(
      {
        doc: "![](image.png)",
        selection: EditorSelection.cursor(14),
        plugin: markdownImagePlugin({ renderMode: "preview" }),
      },
      ({ parent }) => {
        const image = parent.querySelector<HTMLImageElement>(`.${markdownImageClassNames.element}`);
        expect(image?.alt).toBe("");
      },
    );
  });

  it("lets the native image alt handle broken preview images", () => {
    withMarkdownImageView(
      {
        doc: "![Alt](missing.png)",
        selection: EditorSelection.cursor(19),
        plugin: markdownImagePlugin({ renderMode: "preview" }),
      },
      ({ parent }) => {
        const figure = parent.querySelector<HTMLElement>(`.${markdownImageClassNames.preview}`);
        const image = figure?.querySelector<HTMLImageElement>(`.${markdownImageClassNames.element}`);
        image?.dispatchEvent(new Event("error"));

        expect(image?.alt).toBe("Alt");
        expect(figure?.querySelector(".mbox-image-error")).toBeNull();
        expect(figure?.textContent).toBe("");
      },
    );
  });

  it("keeps raw Markdown image syntax on selected lines in the editor view", () => {
    withMarkdownImageView(
      {
        doc: "![One](one.png)\n![Two](two.png)",
        selection: EditorSelection.range(1, 17),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });

        expect(parent.querySelector(`.${markdownImageClassName}`)).toBeNull();
        expect(parent.textContent).toContain("![One](one.png)");
        expect(parent.textContent).toContain("![Two](two.png)");
      },
    );
  });

  it("does not add image widgets inside fenced code blocks", () => {
    withMarkdownImageView(
      {
        doc: "```\n![Alt](image.png)\n```\n![Logo](logo.png)",
        selection: EditorSelection.cursor(0),
      },
      ({ parent }) => {
        const tokens = [...parent.querySelectorAll<HTMLElement>(`.${markdownImageClassName}`)];

        expect(tokens.map((token) => token.dataset.alt)).toEqual(["Logo"]);
      },
    );
  });

  it("uses the preview class for the hidden measuring widget so sizing CSS is shared", () => {
    withMarkdownImageView(
      {
        doc: "![Alt](image.png)",
        selection: EditorSelection.cursor(2),
        plugin: markdownImagePlugin({ renderMode: "preview" }),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.cursor(2) });

        const measure = parent.querySelector<HTMLElement>(".mbox-image-measure");

        expect(measure?.classList.contains(markdownImageClassNames.preview)).toBe(true);
        expect(measure?.getAttribute("aria-hidden")).toBe("true");
      },
    );
  });
});
