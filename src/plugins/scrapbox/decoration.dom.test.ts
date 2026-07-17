import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxCodeClassName,
  scrapboxDecorationPlugin,
  scrapboxStrongClassName,
  scrapboxStrongLevelClassNamePrefix,
} from "./decoration.js";
import { scrapboxLinkClassName, scrapboxLinkPlugin } from "./link.js";

describe("scrapboxDecorationPlugin", () => {
  it("styles bold text and hides its markers in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "a [* bold] b",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxDecorationPlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxStrongClassName}`)?.textContent).toBe("bold");
    expect(parent.querySelector(".cm-line")?.textContent).toBe("a bold b");

    view.destroy();
  });

  it("leaves inline code literal on the active line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        // Inline code stays literal, so the active line reveals it completely:
        // raw backticks shown and the styling class gone.
        doc: "a `x` b",
        extensions: [createMboxExtension({ plugins: [scrapboxDecorationPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("a `x` b");
    expect(parent.querySelector(`.${scrapboxCodeClassName}`)).toBeNull();

    view.destroy();
  });

  it("keeps big text sized on the active line while showing its raw markers", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[** big]",
        extensions: [createMboxExtension({ plugins: [scrapboxDecorationPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    // Raw markers are shown (line is fully editable) but the content keeps both
    // its font-size and its bold weight, so the text neither shrinks nor
    // un-bolds under the cursor.
    expect(parent.querySelector(".cm-line")?.textContent).toBe("[** big]");
    expect(parent.querySelector(`.${scrapboxStrongLevelClassNamePrefix}-2`)?.textContent).toBe("big");
    expect(parent.querySelector(`.${scrapboxStrongClassName}`)?.textContent).toBe("big");

    view.destroy();
  });

  it("nests a link that is the only thing inside strong so the bold weight still applies", () => {
    // Regression test: `[[[Page]]]` makes strong's content range identical to
    // the internal link's own replace range (no other text inside `[[...]]`).
    // Without inclusiveStart/inclusiveEnd on the content mark, CodeMirror
    // renders the link as a DOM sibling instead of nesting it inside
    // .mbox-scrapbox-strong, so the bold weight silently never applies.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "a [[[Page]]] b",
        extensions: [createMboxExtension({ plugins: [scrapboxDecorationPlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const strong = parent.querySelector(`.${scrapboxStrongClassName}`);
    expect(strong).not.toBeNull();
    expect(strong?.querySelector(`.${scrapboxLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});
