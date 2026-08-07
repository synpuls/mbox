import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension, type MboxPlugin } from "../../editor/plugin.js";
import {
  scrapboxFormulaClassName,
  scrapboxFormulaClassNames,
  scrapboxFormulaPlugin,
  ScrapboxFormulaWidget,
} from "./formula.js";
import {
  scrapboxCodeBlockClassName,
  scrapboxCodeBlockCopyButtonClassName,
  scrapboxCodeBlockHighlightPlugin,
  scrapboxCodeBlockTokenClassName,
  scrapboxCodeBlockPlugin,
} from "./code-block.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";
import { parseScrapboxInline } from "./inline.js";

const noActiveLines = new Set<number>();
const FORMULA = "[$ x^2]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxFormulaPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxFormulaSpecs", () => {
  it("renders code:tex and nested code:latex as block formulas, without a card, Copy button, or token highlighting", () => {
    const parent = document.createElement("div");
    const source = "code:tex\n x^2\nParent\n code:latex\n  y^2";
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [createMboxExtension({
          plugins: [scrapboxCodeBlockPlugin(), scrapboxCodeBlockHighlightPlugin(), scrapboxFormulaPlugin()],
        })],
      }),
    });

    expect(parent.querySelectorAll(`.${scrapboxFormulaClassName}`)).toHaveLength(2);
    expect(parent.querySelectorAll(`.${scrapboxFormulaClassNames.block}`)).toHaveLength(2);
    expect(parent.querySelectorAll(`.${scrapboxCodeBlockClassName}`)).toHaveLength(0);
    expect(parent.querySelector(`.${scrapboxCodeBlockCopyButtonClassName}`)).toBeNull();
    expect(parent.querySelector(`.${scrapboxCodeBlockTokenClassName}`)).toBeNull();

    view.destroy();
  });

  it("restores a formula block's complete source when any of its lines becomes active without changing the document", () => {
    const parent = document.createElement("div");
    const source = "code:tex\n \\frac\n  {-b}\n  {2a}";
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: source,
        selection: EditorSelection.cursor(source.indexOf("{-b}")),
        extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(source.indexOf("{-b}")) });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)).toBeNull();
    expect(parent.querySelector(".cm-content")?.textContent).toBe(source.replaceAll("\n", ""));
    expect(view.state.doc.toString()).toBe(source);

    view.destroy();
  });

  it("replaces a formula with a widget showing the raw expression by default", () => {
    const [spec] = specsFor(FORMULA);
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM();

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 7 });
    expect(dom.textContent).toBe("x^2");
    expect(dom.getAttribute("role")).toBe("math");
    expect(dom.querySelector(".mbox-scrapbox-formula-source")).toBeNull();
  });

  it.each([
    ["[$ [x-3]+a^2 ] tail", " tail"],
    ["[$ a ]b ]", "b ]"],
  ])("replaces only the selected formula close and preserves %s's trailing text", (source, trailingText) => {
    const formula = parseScrapboxInline(source).find((node) => node.type === "formula");
    if (formula?.type !== "formula") throw new Error("test source needs a formula");
    let renderedExpression: string | undefined;
    const [spec] = specsFor(source, {
      render: (expression: string) => {
        renderedExpression = expression;
        const element = document.createElement("var");
        element.textContent = expression;
        return element;
      },
    }) as MboxReplaceDecorationSpec[];

    expect(spec).toMatchObject({ type: "replace", from: formula.from, to: formula.to });
    expect(source.slice(spec.to)).toBe(trailingText);
    ((spec.widget as ScrapboxFormulaWidget).toDOM());
    expect(renderedExpression).toBe(formula.expression);

    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc: source, extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })] }),
    });
    expect(parent.querySelector(".cm-line")?.textContent).toBe(`${formula.expression}${trailingText}`);
    view.destroy();
  });

  it.each(["[$ [x-3]+a^2 ] tail", "[$ a ]b ]"])("restores the complete raw source on the active line: %s", (source) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: source,
        selection: EditorSelection.cursor(3),
        extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(3) });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe(source);
    view.destroy();
  });

  it("uses a provided renderer for the expression", () => {
    const [spec] = specsFor(FORMULA, {
      render: (expression: string) => {
        const el = document.createElement("var");
        el.textContent = `rendered:${expression}`;
        return el;
      },
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM();

    expect(dom.querySelector("var")?.textContent).toBe("rendered:x^2");
  });

  it("gives unmarked renderers a hidden TeX equivalent for assistive technology", () => {
    const [spec] = specsFor(FORMULA, {
      render: (expression: string) => {
        const element = document.createElement("var");
        element.textContent = `rendered:${expression}`;
        return element;
      },
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM();

    expect(dom.getAttribute("role")).toBe("math");
    expect(dom.querySelector(".mbox-scrapbox-formula-source")?.textContent).toBe("x^2");
  });

  it("does not add the TeX fallback when a renderer declares its accessible equivalent", () => {
    const renderer = Object.assign((expression: string) => {
      const element = document.createElement("var");
      element.textContent = `rendered:${expression}`;
      return element;
    }, { providesAccessibleMath: true });
    const [spec] = specsFor(FORMULA, { render: renderer });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxFormulaWidget).toDOM();

    expect(dom.getAttribute("role")).toBe("math");
    expect(dom.querySelector(".mbox-scrapbox-formula-source")).toBeNull();
  });
});

describe("scrapboxFormulaPlugin", () => {
  it("firewalls host point widgets out of an inactive formula block body", () => {
    const source = "code:tex\n x^2";
    class ProbeWidget extends WidgetType {
      eq(other: WidgetType): boolean { return other instanceof ProbeWidget; }
      toDOM(): HTMLElement {
        const element = document.createElement("span");
        element.className = "formula-block-probe";
        return element;
      }
    }
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [createMboxExtension({ plugins: [
          scrapboxFormulaPlugin(),
          { decorations: () => [{ type: "widget", from: 0, widget: new ProbeWidget(), side: -1 }] },
        ] })],
      }),
    });

    expect(parent.querySelector(".formula-block-probe")).toBeNull();
    view.destroy();
  });

  it("contains a throwing renderer and leaves its source and other decorations available", () => {
    const parent = document.createElement("div");
    const thrown = new Error("renderer failed");
    const otherPlugin: MboxPlugin = {
      decorations: ({ state }) => [{ type: "mark", from: state.doc.length - 5, to: state.doc.length, className: "still-rendered" }],
    };

    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: `${FORMULA} other`,
        extensions: [
          createMboxExtension({
            plugins: [scrapboxFormulaPlugin({ render: () => { throw thrown; } }), otherPlugin],
          }),
        ],
      }),
    });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)?.textContent).toBe("x^2");
    expect(parent.querySelector(".still-rendered")?.textContent).toBe("other");

    view.destroy();
  });

  it("restores the raw formula source on its active line", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: FORMULA,
        selection: EditorSelection.cursor(3),
        extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(3) });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe(FORMULA);

    view.destroy();
  });

  it("renders the formula in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: FORMULA,
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxFormulaPlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)?.textContent).toBe("x^2");

    view.destroy();
  });
});
