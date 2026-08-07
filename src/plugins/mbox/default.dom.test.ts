import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorState, createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { codeBlockClassNames, codeBlockHighlightClassNames } from "./code-block.js";
import { mboxPlugins } from "./default.js";
import { emojiClassName } from "./emoji.js";
import { mboxFootnoteRefClassName } from "./footnote.js";
import { inlineCodeClassName } from "./inline-code.js";
import { inlineStyleClassNames } from "./inline-style.js";
import { markdownImageClassName, markdownImageClassNames } from "./markdown-image.js";
import { pageLinkClassName } from "./page-link.js";
import { paragraphClassNames } from "./paragraph.js";
import { quoteClassNames } from "./quote.js";
import { tableClassNames } from "./table.js";
import { taskListClassNames } from "./task-list.js";
import { urlLinkClassName } from "./url-link.js";

function withDefaultView<T>(
  options: {
    doc: string;
    selection?: EditorSelection | SelectionRange;
    plugins?: NonNullable<Parameters<typeof createMboxExtension>[0]>["plugins"];
    useBaseState?: boolean;
  },
  run: (context: { parent: HTMLElement; view: EditorView }) => T,
): T {
  const parent = document.createElement("div");
  const state = (options.useBaseState ? createEditorState : EditorState.create)({
    doc: options.doc,
    selection: options.selection,
    extensions: [
      createMboxExtension({
        plugins: options.plugins ?? mboxPlugins(),
      }),
    ],
  });
  const view = createEditorView({ parent, state });

  try {
    return run({ parent, view });
  } finally {
    view.destroy();
  }
}

describe("mboxPlugins", () => {
  it("includes bracket input handling in the default built-in plugin set", () => {
    withDefaultView({ doc: "ab", selection: EditorSelection.cursor(1) }, ({ view }) => {
      const handler = view.state.facet(EditorView.inputHandler)[0];

      expect(handler(view, 1, 1, "[", () => view.state.update({ changes: { from: 1, to: 1, insert: "[" } }))).toBe(true);
      expect(view.state.doc.toString()).toBe("a[]b");
      expect(view.state.selection.main.anchor).toBe(2);
    });
  });

  it("keeps selected heading and list lines as raw syntax without plainMarkerPlugin", () => {
    withDefaultView({ doc: "# H\n- item\n## Other", selection: EditorSelection.range(1, 10) }, ({ parent, view }) => {
      Object.defineProperty(view, "hasFocus", { value: true });
      view.dispatch({ selection: EditorSelection.range(1, 10) });
      expect(parent.querySelectorAll(".cm-line")[2]?.textContent).toBe("Other");
      expect(parent.querySelector(".mbox-list-syntax-hide")).toBeNull();
    });
  });

  it("nests a page link that starts at the very beginning of unfocused list content", () => {
    // Regression test: when an inline widget decoration (page link) starts at
    // the exact same offset as the list content mark's own start, CodeMirror
    // cannot tell which one should nest inside the other and renders them as
    // siblings by default -- which breaks natural text wrapping under the
    // line's flex layout (the link and the trailing text each wrap in their
    // own independent column). `inclusiveStart: true` on the content mark
    // makes it claim the coincident widget instead.
    withDefaultView({ doc: "- [Page]rest", selection: EditorSelection.cursor(0) }, ({ parent }) => {
      const content = parent.querySelector(".mbox-list-content");
      expect(content).not.toBeNull();
      expect(content?.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    });
  });

  it("nests a page link that starts at the very beginning of unfocused task list content", () => {
    // Same regression as the plain-list case above, but for task-list.ts's own
    // separate flex layout and content mark/class.
    withDefaultView({ doc: "- [ ] [Page]rest", selection: EditorSelection.cursor(0) }, ({ parent }) => {
      const content = parent.querySelector(".mbox-task-list-content");
      expect(content).not.toBeNull();
      expect(content?.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    });
  });

  it("nests a page link that is the ENTIRE unfocused list content (no trailing text)", () => {
    // A stricter variant of the regression above: when the widget's end ALSO
    // coincides with the content mark's end (nothing follows the link either),
    // `inclusiveStart` alone is not enough -- `inclusiveEnd` is needed too, or
    // CodeMirror renders no wrapper element for the content mark at all.
    withDefaultView({ doc: "- [Page]", selection: EditorSelection.cursor(0) }, ({ parent }) => {
      const content = parent.querySelector(".mbox-list-content");
      expect(content).not.toBeNull();
      expect(content?.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    });
  });

  it("nests a page link that is the ENTIRE unfocused task list content (no trailing text)", () => {
    withDefaultView({ doc: "- [ ] [Page]", selection: EditorSelection.cursor(0) }, ({ parent }) => {
      const content = parent.querySelector(".mbox-task-list-content");
      expect(content).not.toBeNull();
      expect(content?.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    });
  });

  it("keeps active block syntax visible when multiple cursors touch separate lines", () => {
    const selection = EditorSelection.create([
      EditorSelection.cursor(1),
      EditorSelection.cursor(5),
      EditorSelection.cursor(12),
      EditorSelection.cursor(23),
    ]);

    withDefaultView(
      {
        doc: "# H\n- item\n- [x] task\n> quote\nplain",
        selection,
        useBaseState: true,
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection });
        expect(parent.querySelector(".mbox-list-syntax-hide")).toBeNull();
        expect(parent.querySelector(".mbox-list-focused-syntax")).not.toBeNull();
        expect(parent.querySelector(`.${taskListClassNames.checkbox}`)).toBeNull();
        expect(Array.from(parent.querySelectorAll(".cm-line")).map((line) => line.textContent)).toEqual([
          "# H",
          "item",
          "- [x] task",
          "> quote",
          "plain",
        ]);
      },
    );
  });

  it("keeps every inline widget syntax raw when multiple selection ranges touch separate lines", () => {
    const doc = "[Page]\n:smile:\nhttps://example.com\n![Alt](image.png)\n`code`\n*em*\nplain";
    const selection = EditorSelection.create([
      EditorSelection.range(1, 5),
      EditorSelection.range(8, 14),
      EditorSelection.range(16, 35),
      EditorSelection.range(37, 54),
      EditorSelection.range(56, 60),
      EditorSelection.range(63, 65),
    ]);

    withDefaultView({ doc, selection, useBaseState: true }, ({ parent, view }) => {
      Object.defineProperty(view, "hasFocus", { value: true });
      view.dispatch({ selection });

      expect(parent.querySelector(`.${pageLinkClassName}`)?.textContent).toBe("[Page]");
      expect(parent.querySelector(`.${emojiClassName}`)).toBeNull();
      expect(parent.querySelector(`.${urlLinkClassName}`)).toBeNull();
      expect(parent.querySelector(`.${markdownImageClassName}`)).toBeNull();
      expect(parent.querySelector(`.${inlineCodeClassName}`)).toBeNull();
      expect(parent.querySelector(`.${inlineStyleClassNames.em}`)).toBeNull();
      expect(Array.from(parent.querySelectorAll(".cm-line")).map((line) => line.textContent)).toEqual(doc.split("\n"));
    });
  });

  it("keeps presentation syntax when the editor has multiple selections but no focus", () => {
    withDefaultView(
      {
        doc: "# H\n[Page]",
        selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(5)]),
        useBaseState: true,
      },
      ({ parent }) => {
        expect(parent.querySelectorAll(".cm-line")[0]?.textContent).toBe("H");
        expect(parent.querySelector(`.${pageLinkClassName}`)?.textContent).toBe("Page");
      },
    );
  });

  it("renders initial unfocused syntax in presentation mode", () => {
    withDefaultView(
      {
        doc: "# h1\n- item\n- [x] task\n> quote\n[Page]\n:smile:\nhttps://example.com\n![Alt](image.png)\n`code`\n*em*\n**strong**\n~~strike~~",
        selection: EditorSelection.cursor(0),
      },
      ({ parent }) => {
        expect(parent.querySelectorAll(".cm-line")[0]?.textContent).toBe("h1");
        expect(parent.querySelector(".mbox-list-syntax-hide")?.textContent).toBe("- ");
        expect(parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.checked).toBe(true);
        expect(parent.querySelectorAll(".cm-line")[3]?.textContent).toBe("quote");
        expect(parent.querySelector(`.${pageLinkClassName}`)?.textContent).toBe("Page");
        expect(parent.querySelector(`.${emojiClassName}`)?.textContent).toBe("smile");
        expect(parent.querySelector(`.${urlLinkClassName}`)?.textContent).toBe("https://example.com");
        expect(parent.querySelector<HTMLElement>(`.${markdownImageClassName}`)?.dataset.src).toBe("image.png");
        expect(parent.querySelector(`.${inlineCodeClassName}`)?.textContent).toBe("code");
        expect(parent.querySelector(`.${inlineStyleClassNames.em}`)?.textContent).toBe("em");
        expect(parent.querySelector(`.${inlineStyleClassNames.strong}`)?.textContent).toBe("strong");
        expect(parent.querySelector(`.${inlineStyleClassNames.strike}`)?.textContent).toBe("strike");
      },
    );
  });

  it("adds page link decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "[Page]\n[Focused]",
        selection: EditorSelection.cursor(8),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${pageLinkClassName}`)?.textContent).toBe("Page");
      },
    );
  });

  it("adds footnote reference decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "[^1] text\n[^1]: note",
        selection: EditorSelection.cursor(10),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${mboxFootnoteRefClassName}`)?.textContent).toBe("1");
      },
    );
  });

  it("passes a page link URL resolver through the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "[Page]\n[Focused]",
        selection: EditorSelection.cursor(8),
        plugins: mboxPlugins({
          link: {
            pageUrl: (name) => `/wiki/${name}`,
          },
        }),
      },
      ({ parent }) => {
        expect(parent.querySelector<HTMLAnchorElement>(`a.${pageLinkClassName}`)?.getAttribute("href")).toBe(
          "/wiki/Page",
        );
      },
    );
  });

  it("adds paragraph decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "plain\n\n# heading",
      },
      ({ parent }) => {
        expect(parent.querySelectorAll(`.cm-line.${paragraphClassNames.paragraph}`)).toHaveLength(2);
        expect(parent.querySelector(`.cm-line.${paragraphClassNames.emptyLine}`)?.textContent).toBe("");
        expect(parent.querySelectorAll(".cm-line")[2]?.classList.contains(paragraphClassNames.paragraph)).toBe(false);
      },
    );
  });

  it("adds emoji decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: ":smile:\n:focused:",
        selection: EditorSelection.cursor(9),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${emojiClassName}`)?.textContent).toBe("smile");
      },
    );
  });

  it("adds URL link decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "[Label](https://example.com)\nhttps://focused.example",
        selection: EditorSelection.cursor(30),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${urlLinkClassName}`)?.textContent).toBe("Label");
      },
    );
  });

  it("adds Markdown image decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "![Alt](image.png)\n![Focused](focused.png)",
        selection: EditorSelection.cursor(19),
      },
      ({ parent }) => {
        expect(parent.querySelector<HTMLElement>(`.${markdownImageClassName}`)?.dataset.src).toBe("image.png");
        expect(parent.querySelector(`.${markdownImageClassNames.preview}`)).toBeNull();
      },
    );
  });

  it("passes Markdown image options through the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "![Alt](image.png)\n![Focused](focused.png)",
        selection: EditorSelection.cursor(19),
        plugins: mboxPlugins({
          image: {
            renderMode: "preview",
          },
        }),
      },
      ({ parent }) => {
        const preview = parent.querySelector<HTMLElement>(`.${markdownImageClassNames.preview}`);

        expect(preview?.dataset.src).toBe("image.png");
        expect(preview?.style.width).toBe("");
        expect(preview?.style.minHeight).toBe("");
        expect(preview?.querySelector("img")?.getAttribute("src")).toBe("image.png");
      },
    );
  });

  it("adds no highlighter by default or when codeHighlight is false", () => {
    expect(mboxPlugins()).toHaveLength(16);
    expect(mboxPlugins({ codeHighlight: false })).toHaveLength(16);

    withDefaultView({ doc: "```js\nconst x = 1\n```", plugins: mboxPlugins() }, ({ parent }) => {
      expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)).toBeNull();
    });
  });

  it("adds the synchronous JS/TS highlighter when codeHighlight is true", () => {
    expect(mboxPlugins({ codeHighlight: true })).toHaveLength(17);

    withDefaultView({ doc: "```js\nconst x = 1\n```", plugins: mboxPlugins({ codeHighlight: true }) }, ({ parent }) => {
      expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)?.textContent).toBe("const");
    });
  });

  it("forwards codeHighlight options to the dynamic loader", async () => {
    expect(mboxPlugins({ codeHighlight: { languages: "all" } })).toHaveLength(17);
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: '```ruby\nputs "hi"\n```',
        extensions: [createMboxExtension({ plugins: mboxPlugins({ codeHighlight: { languages: "all" } }) })],
      }),
    });

    try {
      await vi.waitFor(() => {
        expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}`)).not.toBeNull();
      });
    } finally {
      view.destroy();
    }
  });

  it("adds inline code decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "`code`\n`focused`",
        selection: EditorSelection.cursor(8),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${inlineCodeClassName}`)?.textContent).toBe("code");
      },
    );
  });

  it("adds inline style decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "*em*\n**strong**",
        selection: EditorSelection.cursor(5),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.${inlineStyleClassNames.em}`)?.textContent).toBe("em");
        expect(parent.querySelector(`.${inlineStyleClassNames.strong}`)?.textContent).toBe("strong");
      },
    );
  });

  it("renders a control-character-free code language label after CodeMirror normalizes line endings", () => {
    // This is the editor integration contract, not CRLF parser coverage:
    // EditorState has already normalized \r\n to \n before parsing.
    withDefaultView(
      {
        doc: "```ts\nconst x = 1\n```",
        selection: EditorSelection.cursor(7),
      },
      ({ parent }) => {
        expect(parent.querySelectorAll(`.cm-line.${codeBlockClassNames.block}`)).toHaveLength(3);
        expect(parent.querySelector(`.${codeBlockClassNames.info}`)?.textContent).toBe("ts");
        expect(parent.querySelector(`.${codeBlockClassNames.text}`)?.textContent).toBe("const x = 1");
      },
    );
  });

  it("adds quote decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "> quote\nplain",
        selection: EditorSelection.cursor(9),
      },
      ({ parent }) => {
        expect(parent.querySelector(`.cm-line.${quoteClassNames.quote}`)?.textContent).toBe("quote");
      },
    );
  });

  it("adds table decorations from the default built-in plugin set", () => {
    withDefaultView(
      {
        doc: "| A | B |\n| --- | --- |\n| 1 | 2 |",
      },
      ({ parent }) => {
        expect(parent.querySelectorAll(`.cm-line.${tableClassNames.table}`)).toHaveLength(3);
        expect(parent.querySelector(`.${tableClassNames.cell}`)?.textContent).toBe("A");
      },
    );
  });
});
