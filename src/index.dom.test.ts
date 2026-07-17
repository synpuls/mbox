import { describe, expect, it } from "vitest";
import { StateEffect, StateField } from "@codemirror/state";
import type {
  MboxActiveLineNumbers,
  CreateMboxEditorOptions,
  CreateMboxEditorStateOptions,
  MboxPlugin,
} from "./index.js";
import {
  createEditorState,
  createEditorView,
  createMboxEditor,
  createMboxExtension,
  createMboxEditorState,
  defaultEditorPresentationThemeSpec,
  editorPresentationTheme,
  mboxDefaultPresentationTheme,
  mboxDefaultPresentationThemeSpec,
  pageLinkClassName,
} from "./index.js";

describe("root public API", () => {
  it("exports MboxActiveLineNumbers as the type MboxDecorationContext.activeLineNumbers carries", () => {
    const plugin: MboxPlugin = {
      decorations: (context) => {
        const activeLineNumbers: MboxActiveLineNumbers = context.activeLineNumbers;
        expect(activeLineNumbers).toBeInstanceOf(Set);
        return [];
      },
    };
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createEditorState({ doc: "plain", extensions: [createMboxExtension({ plugins: [plugin] })] }),
    });

    view.destroy();
  });

  it("exports editor factory and plugin extension APIs", () => {
    const plugin: MboxPlugin = {};
    const state = createEditorState({
      doc: "# Hello",
      extensions: [createMboxExtension({ plugins: [plugin] })],
    });
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state });

    expect(state.doc.toString()).toBe("# Hello");
    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports batteries-included mbox editor factories and option types", () => {
    const stateOptions: CreateMboxEditorStateOptions = { doc: "[Page]", link: { pageUrl: (name) => `/wiki/${name}` } };
    const state = createMboxEditorState(stateOptions);
    const parent = document.createElement("div");
    const editorOptions: CreateMboxEditorOptions = { parent, doc: "[Page]" };
    const view = createMboxEditor(editorOptions);

    expect(state.doc.toString()).toBe("[Page]");
    expect(view.state.doc.toString()).toBe("[Page]");
    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports the opt-in editor presentation theme", () => {
    expect(defaultEditorPresentationThemeSpec).toMatchObject({ "&": { fontSize: "var(--mbox-editor-font-size, 15px)" } });

    const parent = document.createElement("div");
    const state = createEditorState({ doc: "plain", extensions: [editorPresentationTheme()] });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("exports the mbox notation's own optional presentation theme, as both a spec and a ready-to-use extension", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({ [`.${pageLinkClassName}`]: { textDecoration: "underline" } });

    const parent = document.createElement("div");
    const state = createEditorState({ doc: "[Page]", extensions: [mboxDefaultPresentationTheme()] });
    const view = createEditorView({ parent, state });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();

    view.destroy();
  });

  it("allows host apps to add CodeMirror extensions through the public editor factory", () => {
    const setHostValue = StateEffect.define<string>();
    const hostValue = StateField.define<string>({
      create: () => "initial",
      update: (value, transaction) => {
        for (const effect of transaction.effects) {
          if (effect.is(setHostValue)) {
            return effect.value;
          }
        }

        return value;
      },
    });
    const state = createEditorState({
      extensions: [hostValue],
    });
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state });

    view.dispatch({ effects: setHostValue.of("host") });

    expect(view.state.field(hostValue)).toBe("host");

    view.destroy();
  });
});
