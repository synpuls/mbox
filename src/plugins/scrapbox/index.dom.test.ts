import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { scrapboxIconImageClassName, scrapboxLinkClassName, scrapboxPageMissingClassName } from "./link.js";
import { scrapboxCodeBlockClassName, scrapboxCodeBlockClassNames } from "./code-block.js";
import { scrapboxPlugins } from "./index.js";

// Walk the bundle's registered inputHandlers in facet order (as CodeMirror
// does) and stop at the first that claims the keystroke, so the test observes
// the real ordering between the `[` auto-close and the `` ` `` inline-code wrap.
function dispatchTypedInput(view: EditorView, text: string): boolean {
  for (const handler of view.state.facet(EditorView.inputHandler)) {
    const { from, to } = view.state.selection.main;
    const handled = handler(view, from, to, text, () =>
      view.state.update({ changes: { from, to, insert: text } }),
    );
    if (handled) return true;
  }
  return false;
}

describe("scrapboxPlugins", () => {
  it("wires the `[` auto-close and the `` ` `` inline-code wrap through the bundled input handlers", () => {
    const make = (doc: string, selection: EditorSelection | SelectionRange) =>
      createEditorView({
        parent: document.createElement("div"),
        state: EditorState.create({
          doc,
          selection,
          extensions: [createMboxExtension({ plugins: scrapboxPlugins() })],
        }),
      });

    // `[` still auto-closes to `a[]b` — the bracket handler runs first.
    const bracketView = make("ab", EditorSelection.cursor(1));
    expect(dispatchTypedInput(bracketView, "[")).toBe(true);
    expect(bracketView.state.doc.toString()).toBe("a[]b");
    bracketView.destroy();

    // An empty-selection backtick is claimed by no handler, so normal text
    // input inserts the single backtick.
    const emptyBacktickView = make("ab", EditorSelection.cursor(1));
    expect(dispatchTypedInput(emptyBacktickView, "`")).toBe(false);
    expect(emptyBacktickView.state.doc.toString()).toBe("ab");
    emptyBacktickView.destroy();

    // A non-empty selection backtick wraps as inline code — the inline-code
    // handler runs after the bracket handler passes it through.
    const wrapView = make("abc", EditorSelection.range(0, 3));
    expect(dispatchTypedInput(wrapView, "`")).toBe(true);
    expect(wrapView.state.doc.toString()).toBe("`abc`");
    wrapView.destroy();
  });

  it("does not turn scrapbox syntax inside a code block into decorations or links", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "code:sample\n [Page] [* bold]\nend",
        extensions: [createMboxExtension({ plugins: scrapboxPlugins() })],
      }),
    });

    // The bracketed text inside the code block stays literal.
    expect(parent.querySelector(`a.${scrapboxLinkClassName}`)).toBeNull();
    expect(parent.textContent).toContain("[Page] [* bold]");
    // The code block itself is still recognised (opener + body lines).
    expect(parent.querySelectorAll(`.${scrapboxCodeBlockClassName}`).length).toBe(2);

    view.destroy();
  });

  it("forwards all link resolvers through to the bundled link plugin", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Missing] [avatar.icon]",
        extensions: [createMboxExtension({ plugins: scrapboxPlugins({
          link: {
            iconUrl: (name) => `https://icons.example/${name}.png`,
            pageUrl: (name) => `/wiki/${name}`,
            pageExists: () => false,
          },
        }) })],
      }),
    });

    expect(parent.querySelector<HTMLImageElement>(`.${scrapboxIconImageClassName}`)?.getAttribute("src")).toBe(
      "https://icons.example/avatar.png",
    );
    expect(parent.querySelector<HTMLAnchorElement>(`a.${scrapboxLinkClassName}`)?.getAttribute("href")).toBe("/wiki/Missing");
    expect(parent.querySelector(`a.${scrapboxPageMissingClassName}`)?.textContent).toBe("Missing");

    view.destroy();
  });

  it("carries no code-block highlighter by default", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "code:a.js\n const x = 1;",
        extensions: [createMboxExtension({ plugins: scrapboxPlugins() })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).toBeNull();

    view.destroy();
  });

  it("adds the synchronous JS/TS highlighter when codeHighlight: true", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "code:a.js\n const x = 1;",
        extensions: [createMboxExtension({ plugins: scrapboxPlugins({ codeHighlight: true }) })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).not.toBeNull();

    view.destroy();
  });

  it("forwards a codeHighlight options object through to the dynamic loader", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: 'code:a.rb\n puts "hi"',
        extensions: [createMboxExtension({ plugins: scrapboxPlugins({ codeHighlight: { languages: "all" } }) })],
      }),
    });

    await vi.waitFor(() => {
      expect(parent.querySelector(`.${scrapboxCodeBlockClassNames.token}`)).not.toBeNull();
    });

    view.destroy();
  });
});
