import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmFootnotePlugin } from "./footnote.js";
import { gfmPlugins } from "./index.js";

describe("gfmFootnotePlugin DOM", () => {
  // A math renderer has to be injected: without one the math plugin is not
  // added at all, so `.mbox-gfm-math` would be absent whatever the parser
  // decided and this test could not tell a fixed build from a broken one.
  // Measured — with no renderer it stays green even when the footnote guard is
  // removed. The paragraph is in the fixture as the positive control: the same
  // construct one blank line away must still become math.
  it("renders a dollar-wrapped code span in a definition as ordinary inline code, not math", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "Para $`y^2`$ here.[^a]\n\n[^a]: note with $`x^2`$ inside",
        extensions: [createMboxExtension({
          plugins: gfmPlugins({
            math: {
              render: (expression) => {
                const element = document.createElement("span");
                element.textContent = expression;
                return element;
              },
            },
          }),
        })],
      }),
    });

    const definition = parent.querySelector<HTMLElement>(".cm-line.mbox-gfm-footnote");
    expect(definition?.querySelector(".mbox-gfm-math")).toBeNull();
    expect(definition?.querySelector("code.mbox-gfm-code")?.textContent).toBe("x^2");
    // The paragraph one line above proves the renderer is wired up.
    expect(parent.querySelector(".cm-content .mbox-gfm-math")).not.toBeNull();

    view.destroy();
  });

  it("renders inline markup inside an inactive definition without counting the ordinary paragraph", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "ordinary **bold** and `code` and [link](https://example.com)\n\n[^a]: **bold** and `code` and [link](https://example.com)",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const definition = parent.querySelector<HTMLElement>(".cm-line.mbox-gfm-footnote");
    expect(definition).not.toBeNull();
    expect(definition?.querySelectorAll(".mbox-gfm-strong")).toHaveLength(1);
    expect(definition?.querySelectorAll(".mbox-gfm-code")).toHaveLength(1);
    expect(definition?.querySelectorAll(".mbox-gfm-link")).toHaveLength(1);
    expect(definition?.querySelectorAll(".mbox-gfm-footnote-marker")).toHaveLength(1);

    view.destroy();
  });

  it("strips code-span padding inside an inactive definition paragraph", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[^a]: ` code `",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    expect(parent.querySelector(".mbox-gfm-footnote code.mbox-gfm-code")?.textContent).toBe("code");

    view.destroy();
  });

  it("renders inline markup in the second paragraph of an inactive definition", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[^a]: **first**\n\n    `second` and [link](https://example.com)",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const secondParagraph = [...parent.querySelectorAll<HTMLElement>(".cm-line.mbox-gfm-footnote")]
      .find((line) => line.textContent?.includes("second"));
    expect(secondParagraph).toBeDefined();
    expect(secondParagraph?.querySelectorAll(".mbox-gfm-code")).toHaveLength(1);
    expect(secondParagraph?.querySelectorAll(".mbox-gfm-link")).toHaveLength(1);

    view.destroy();
  });

  it("keeps list, blockquote, and fenced-code children of a definition raw", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[^a]: intro\n\n    - **list**\n\n    > **quote**\n\n    ```js\n    **code**\n    ```",
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    const definitionLines = [...parent.querySelectorAll<HTMLElement>(".cm-line.mbox-gfm-footnote")];
    const definitionText = definitionLines.map((line) => line.textContent).join("\n");
    expect(definitionText).toContain("- **list**");
    expect(definitionText).toContain("> **quote**");
    expect(definitionText).toContain("```js");
    expect(definitionLines.flatMap((line) => [...line.querySelectorAll(".mbox-gfm-bullet")])).toHaveLength(0);
    expect(definitionLines.filter((line) => line.classList.contains("mbox-gfm-code-block"))).toHaveLength(0);
    expect(definitionLines.filter((line) => line.classList.contains("mbox-gfm-quote"))).toHaveLength(0);
    expect(definitionLines.flatMap((line) => [...line.querySelectorAll(".mbox-gfm-strong")])).toHaveLength(0);

    view.destroy();
  });

  it("renders linked footnote references and merges target semantics onto the definition line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "text[^1] more\n\n[^1]: the note",
        extensions: [createMboxExtension({ plugins: [gfmFootnotePlugin()] })],
      }),
    });

    const reference = parent.querySelector<HTMLAnchorElement>("a.mbox-gfm-footnote-ref");
    expect(reference?.getAttribute("href")).toBe("#gfm-footnote-15");
    expect(reference?.getAttribute("role")).toBe("doc-noteref");
    expect(reference?.getAttribute("aria-label")).toBe("Footnote 1");
    const definition = parent.querySelectorAll<HTMLElement>(".cm-line")[2];
    expect(definition?.getAttribute("id")).toBe("gfm-footnote-15");
    expect(definition?.getAttribute("role")).toBe("doc-footnote");
    expect(definition?.querySelector(".mbox-gfm-footnote-marker")?.getAttribute("aria-hidden")).toBe("true");
    view.destroy();
  });

  it("connects inactive continuation lines to the definition target and removes all semantics when one is selected", () => {
    const parent = document.createElement("div");
    const doc = "text[^1]\n\n[^1]: first\n  second";
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmFootnotePlugin()] })],
      }),
    });

    const definition = parent.querySelector<HTMLElement>("#gfm-footnote-10");
    expect(definition?.getAttribute("aria-owns")).toBe("gfm-footnote-10-line-22");
    expect(parent.querySelector<HTMLElement>("#gfm-footnote-10-line-22")).not.toBeNull();

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: doc.indexOf("  second") } });
    expect(parent.querySelector("#gfm-footnote-10")).toBeNull();
    expect(parent.querySelector("#gfm-footnote-10-line-22")).toBeNull();
    expect(parent.querySelector(".mbox-gfm-footnote-marker")?.getAttribute("aria-hidden")).toBeNull();
    view.destroy();
  });
});
