import { describe, expect, it } from "vitest";
import { StateEffect, StateField } from "@codemirror/state";
import type {
  MboxActiveLineNumbers,
  CreateMboxEditorOptions,
  CreateMboxEditorStateOptions,
  MboxDecorationSpec,
  MboxPlugin,
} from "./index.js";
import {
  createContentMarkSpec,
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

  it("lets third parties build a notation from only root public exports", () => {
    // README and the guide promise that third parties can build a notation with
    // public APIs alone. Keep this as executable evidence: if a required symbol
    // becomes private, this test must fail.
    interface Callout {
      line: number;
      from: number;
      to: number;
    }

    const cache = new WeakMap<object, Callout[]>();
    const parse = (doc: string): Callout[] => {
      const callouts: Callout[] = [];
      let offset = 0;
      doc.split("\n").forEach((text, index) => {
        if (text.startsWith("!")) callouts.push({ line: index + 1, from: offset, to: offset + text.length });
        offset += text.length + 1;
      });
      return callouts;
    };
    const calloutPlugin: MboxPlugin = {
      name: "callout",
      theme: { ".my-callout": { background: "#eef" } },
      decorations: ({ state, activeLineNumbers }) => {
        let callouts = cache.get(state.doc);
        if (!callouts) {
          callouts = parse(state.doc.toString());
          cache.set(state.doc, callouts);
        }
        return callouts.flatMap<MboxDecorationSpec>((callout) => [
          { type: "line", from: callout.from, className: "my-callout" },
          ...(activeLineNumbers.has(callout.line) ? [] : [{ type: "replace" as const, from: callout.from, to: callout.from + 1 }]),
          createContentMarkSpec(callout.from + 1, callout.to, "my-callout-body"),
        ]);
      },
    };
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = createEditorView({
      parent,
      state: createEditorState({
        doc: "! Notice\nplain",
        selection: { anchor: 8 },
        extensions: [createMboxExtension({ plugins: [calloutPlugin] })],
      }),
    });

    try {
      const calloutLine = parent.querySelector<HTMLElement>(".my-callout");
      expect(calloutLine).not.toBeNull();
      expect(calloutLine?.textContent).toBe(" Notice");

      view.focus();
      view.dispatch({ selection: { anchor: 0 } });

      expect(calloutLine?.textContent).toBe("! Notice");
    } finally {
      view.destroy();
      parent.remove();
    }
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
