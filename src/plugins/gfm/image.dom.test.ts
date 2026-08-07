import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";

describe("gfmImagePlugin", () => {
  it("creates an editor for a multiline image without emitting a cross-line replace", () => {
    const parent = document.createElement("div");
    const doc = "![alt\ntext](https://e.test/x.png)";

    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    expect(parent.textContent).toContain("![alt");
    expect(parent.textContent).toContain("text](https://e.test/x.png)");
    view.destroy();
  });
});

// The work list names this file as a verification site for the image work in
// section 2, so the cases it asked for live here even where a neighbouring
// suite covers the same ground from its own angle.
describe("gfm images in the DOM", () => {
  function view(doc: string, plugins = gfmPlugins()) {
    const parent = document.createElement("div");
    const editor = createEditorView({
      parent,
      // Selection on a trailing line so the content line stays idle.
      state: EditorState.create({ doc: `${doc}\ntrailing`, selection: { anchor: doc.length + 1 }, extensions: [createMboxExtension({ plugins })] }),
    });
    return { parent, editor };
  }

  /** The `<img>` inside the preview figure, not whatever `img` comes first. */
  function previewImage(parent: HTMLElement): HTMLImageElement | null {
    return parent.querySelector<HTMLElement>(".mbox-gfm-image-preview")?.querySelector("img") ?? null;
  }

  it("renders a picture by default, without being asked", () => {
    const { parent, editor } = view("![alt](https://e.test/i.png)");

    expect(parent.querySelector(".mbox-gfm-image-preview")).not.toBeNull();
    expect(previewImage(parent)?.getAttribute("src")).toBe("https://e.test/i.png");

    editor.destroy();
  });

  it("renders a picture inside a table cell", () => {
    const { parent, editor } = view("| ![alt](https://e.test/i.png) | b |\n| --- | --- |");
    const cell = parent.querySelector(".mbox-gfm-table-cell");

    expect(cell?.querySelector(".mbox-gfm-image-preview")).not.toBeNull();

    editor.destroy();
  });

  it("keeps the alt text on the image so a failed load still says something", () => {
    // mbox has no error handler for a broken URL; the browser falls back to the
    // alt text, which is only useful if it is actually on the element.
    const { parent, editor } = view("![a helpful description](https://e.test/missing.png)");
    const image = previewImage(parent);

    expect(image?.getAttribute("alt")).toBe("a helpful description");

    editor.destroy();
  });

  it("does not fetch anything in token mode", () => {
    const { parent, editor } = view("![alt](https://e.test/i.png)", gfmPlugins({ image: { renderMode: "token" } }));

    expect(parent.querySelector(".mbox-gfm-image-preview")).toBeNull();
    expect(parent.querySelector(".mbox-gfm-image-token")?.textContent).toBe("alt");

    editor.destroy();
  });

  it("defers loading and decoding, so a document of images does not block", () => {
    const { parent, editor } = view("![alt](https://e.test/i.png)");
    const image = previewImage(parent);

    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");

    editor.destroy();
  });

  it("gives a link-wrapped image the same treatment inside a cell", () => {
    const { parent, editor } = view("| [![alt](https://e.test/i.png)](https://e.test/p) | b |\n| --- | --- |");
    const cell = parent.querySelector(".mbox-gfm-table-cell");
    // Look down from the anchor rather than up from the image: the picture is
    // the anchor's child by construction, and that is the thing to pin.
    const anchor = cell?.querySelector<HTMLAnchorElement>("a.mbox-gfm-link");
    const image = anchor?.querySelector("img");

    expect(anchor?.getAttribute("href")).toBe("https://e.test/p");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");

    editor.destroy();
  });
});
