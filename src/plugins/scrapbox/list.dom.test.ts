import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { scrapboxLinkPlugin } from "./link.js";
import {
  scrapboxBulletClassName,
  scrapboxListLineClassName,
  scrapboxListPlugin,
  scrapboxNumberClassName,
} from "./list.js";
import { createTestContext } from "../../editor/test-context.js";

const listSpecs = (doc: string) =>
  scrapboxListPlugin().decorations!(createTestContext(doc));

describe("createScrapboxListSpecs", () => {
  it("keeps the bullet on every list line (the dot never depends on focus)", () => {
    const input = " one\n two";

    const specs = listSpecs(input);

    expect(specs.filter((spec) => spec.type === "replace" && (spec.widget as { toDOM(): HTMLElement } | undefined)?.toDOM().className === scrapboxBulletClassName)).toHaveLength(2);
  });
});

describe("scrapboxListPlugin", () => {
  it("keeps the bullet dot on the focused line in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: " one\n two",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxListPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });

    // Like real Scrapbox, the dot stays on the line under the cursor: both
    // bullet lines keep their dot no matter where the selection is.
    view.dispatch({ selection: EditorSelection.cursor(0) });
    expect(parent.querySelectorAll(`.${scrapboxBulletClassName}`)).toHaveLength(2);

    view.dispatch({ selection: EditorSelection.cursor(6) });
    expect(parent.querySelectorAll(`.${scrapboxBulletClassName}`)).toHaveLength(2);

    view.destroy();
  });

  it("keeps a single bullet dot on the indent even when the content holds a link", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        // a page link at the very start of the content used to split the bullet
        // mark and drag the dot into the middle of the line
        doc: " [ページ] は内部リンク",
        extensions: [createMboxExtension({ plugins: [scrapboxListPlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const bullets = [...parent.querySelectorAll(`.${scrapboxBulletClassName}`)];
    expect(bullets).toHaveLength(1);
    // the dot host is the indent bullet-slot widget at the line start, not a
    // text segment after the link; the widget holds only a zero-width space
    expect(bullets[0].textContent).toBe("​");

    view.destroy();
  });

  it("renders bullet indent marks, indent data and a number marker in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: " item\n  nested\n1. first",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxListPlugin()] })],
      }),
    });

    const bullets = [...parent.querySelectorAll(`.${scrapboxBulletClassName}`)];
    expect(bullets).toHaveLength(2);
    // the innermost bullet slot is a widget holding only a zero-width space (the
    // raw indent whitespace is replaced, not wrapped)
    expect(bullets[0].textContent).toBe("​");
    expect(bullets[1].textContent).toBe("​");
    // the deeper line's extra (outer) level is a separate indent widget
    expect(parent.querySelectorAll(".mbox-scrapbox-bullet-indent")).toHaveLength(1);

    const listLines = [...parent.querySelectorAll<HTMLElement>(`.${scrapboxListLineClassName}`)];
    expect(listLines.map((line) => line.getAttribute("data-mbox-scrapbox-indent"))).toEqual(["1", "2", "0"]);

    expect(parent.querySelector(`.${scrapboxNumberClassName}`)?.textContent).toBe("1. ");

    view.destroy();
  });
});
