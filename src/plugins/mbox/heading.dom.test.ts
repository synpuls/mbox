import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  headingClassNames,
  headingPlugin,
} from "./heading.js";

describe("headingPlugin", () => {
  it("adds heading line class and hide class in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# Heading\n## Other",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [headingPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(3) });

    expect(parent.querySelector(`.cm-line.mbox-heading-line.${headingClassNames.h1}`)?.getAttribute("style")).toContain(
      "--mbox-heading-level: 1",
    );
    expect(parent.querySelectorAll(".cm-line")[1]?.textContent).toBe("Other");

    view.destroy();
  });

  it("hides heading syntax on the initial unfocused editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# h1",
        selection: EditorSelection.cursor(0),
        extensions: [
          createMboxExtension({
            plugins: [headingPlugin()],
          }),
        ],
      }),
    });
    expect(parent.querySelector(".cm-line")?.textContent).toBe("h1");

    view.destroy();
  });

  it("keeps empty heading markers visible on the initial unfocused editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# ",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [headingPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.cm-line.mbox-heading-line.${headingClassNames.h1}`)?.textContent).toBe("# ");

    view.destroy();
  });
});

describe("headingPlugin keymap", () => {
  it("binds ArrowUp to move the cursor from a line start onto the previous heading", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# Title\ntext",
        selection: EditorSelection.cursor(8),
        extensions: [
          createMboxExtension({
            plugins: [headingPlugin()],
          }),
        ],
      }),
    });

    const arrowUp = headingPlugin().keymap?.find((binding) => binding.key === "ArrowUp");
    expect(arrowUp?.run?.(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(0);

    view.destroy();
  });
});
