import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorState, createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { plainMarkerPlugin } from "./plain-marker.js";

describe("plainMarkerPlugin", () => {
  it("connects the hide class theme to the editor view", () => {
    const parentWithoutPlugin = document.createElement("div");
    const parentWithPlugin = document.createElement("div");
    const withoutPlugin = createEditorView({
      parent: parentWithoutPlugin,
      state: createEditorState({
        extensions: [createMboxExtension()],
      }),
    });
    const withPlugin = createEditorView({
      parent: parentWithPlugin,
      state: createEditorState({
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });

    expect(withPlugin.dom.classList.length).toBeGreaterThan(withoutPlugin.dom.classList.length);

    withoutPlugin.destroy();
    withPlugin.destroy();
  });

  it("adds a marker class to a heading marker in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createEditorState({
        doc: "# Heading",
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(".mbox-plain-marker")).not.toBeNull();

    view.destroy();
  });

  it("adds a marker class to a list marker in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createEditorState({
        doc: "- item",
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelector(".mbox-plain-marker")).not.toBeNull();

    view.destroy();
  });

  it("adds marker classes to all markers in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createEditorState({
        doc: "# Heading\n- item",
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });

    expect(parent.querySelectorAll(".mbox-plain-marker")).toHaveLength(2);

    view.destroy();
  });

  it("adds a hide class to marker syntax outside the focused line in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# Heading\n- item",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: view.state.selection });

    expect(parent.querySelectorAll(".mbox-plain-marker-hide")).toHaveLength(1);

    view.destroy();
  });

  it("keeps marker syntax on the focused line out of the hide class", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# Heading\n- item",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: view.state.selection });

    expect(Array.from(parent.querySelectorAll(".mbox-plain-marker-hide")).map((element) => element.textContent)).not.toContain(
      "# ",
    );

    view.destroy();
  });

  it("moves the hide class when selection moves to another line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "# Heading\n- item",
        selection: EditorSelection.cursor(2),
        extensions: [
          createMboxExtension({
            plugins: [plainMarkerPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: view.state.selection });

    expect(Array.from(parent.querySelectorAll(".mbox-plain-marker-hide")).map((element) => element.textContent)).toEqual([
      "- ",
    ]);

    view.dispatch({
      selection: EditorSelection.cursor(12),
    });

    expect(Array.from(parent.querySelectorAll(".mbox-plain-marker-hide")).map((element) => element.textContent)).toEqual([
      "# ",
    ]);

    view.destroy();
  });
});
