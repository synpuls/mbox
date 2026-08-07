import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension, type MboxPlugin } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";
import { GfmMathWidget, gfmMathClassName } from "./math.js";
import { parseGfmDocument } from "./parser.js";

const MATH_FENCE = "```math\nx^2\n```";
const MATH_RENDERER = (expression: string) => {
  const element = document.createElement("var");
  element.textContent = `rendered:${expression}`;
  return element;
};

function createMathView(doc: string, selection?: number) {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: selection === undefined ? undefined : EditorSelection.cursor(selection),
      extensions: [createMboxExtension({ plugins: gfmPlugins({ math: { render: MATH_RENDERER } }) })],
    }),
  });
  return { parent, view };
}

describe("gfm math fences", () => {
  it("renders bare inline math and keeps the raw source on its active line", () => {
    const doc = "before $x^2$ after";
    const { parent, view } = createMathView(doc);

    expect(parent.querySelector(`.${gfmMathClassName}`)?.textContent).toBe("rendered:x^2x^2");
    view.destroy();

    const active = createMathView(doc, doc.indexOf("x^2"));
    Object.defineProperty(active.view, "hasFocus", { value: true });
    active.view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("x^2")) });
    expect(active.parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect(active.parent.querySelector(".cm-line")?.textContent).toBe(doc);
    active.view.destroy();
  });

  // `eq` is CodeMirror's permission to keep an element it has already built,
  // so it has to account for everything that decides what that element is.
  // Asserting the contract directly rather than through a stale-DOM sequence:
  // two candidate sequences were measured and both rebuilt the DOM anyway, so
  // an end-to-end test would pass with or without the `inline` comparison.
  it("does not treat inline and block math widgets as interchangeable", () => {
    const inline = new GfmMathWidget("x", MATH_RENDERER, true);
    const block = new GfmMathWidget("x", MATH_RENDERER, false);

    expect(inline.toDOM().tagName).not.toBe(block.toDOM().tagName);
    expect(inline.eq(block)).toBe(false);
    expect(block.eq(inline)).toBe(false);
    expect(inline.eq(new GfmMathWidget("x", MATH_RENDERER, true))).toBe(true);
  });

  it("displays inline math placed within a sentence as inline-block", () => {
    const { parent, view } = createMathView("before $x^2$ after");
    const math = parent.querySelector<HTMLElement>(`.${gfmMathClassName}`);
    document.body.appendChild(parent);

    expect(getComputedStyle(math!).display).toBe("inline-block");
    expect(parent.querySelector(".cm-line")?.textContent).toBe("before rendered:x^2x^2 after");

    view.destroy();
    parent.remove();
  });

  it.each(["$$\nx^2\n$$", "```math\nx^2\n```"])("keeps block math (%s) displayed as block", (doc) => {
    const { parent, view } = createMathView(doc);
    const math = parent.querySelector<HTMLElement>(`.${gfmMathClassName}`);
    document.body.appendChild(parent);

    expect(getComputedStyle(math!).display).toBe("block");

    view.destroy();
    parent.remove();
  });

  it("displays inline math in a table cell as inline-block", () => {
    const { parent, view } = createMathView("| before $x^2$ after | b |\n| --- | --- |");
    const cell = parent.querySelector<HTMLElement>(".mbox-gfm-table-cell");
    const math = cell?.querySelector<HTMLElement>(`.${gfmMathClassName}`);
    document.body.appendChild(parent);

    expect(getComputedStyle(math!).display).toBe("inline-block");

    view.destroy();
    parent.remove();
  });

  it("renders multi-line double-dollar math without leaving source lines behind", () => {
    const { parent, view } = createMathView("$$\nx^2\n$$\nplain");

    expect(parent.querySelector(`.${gfmMathClassName}`)?.textContent).toBe("rendered:x^2x^2");
    expect([...parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(["rendered:x^2x^2", "", "", "plain"]);
    view.destroy();
  });

  it("uses a double-dollar expression for its hidden TeX fallback", () => {
    const doc = "$$\nx^2\n$$";
    const { parent, view } = createMathView(doc);
    const expression = parseGfmDocument(doc).inlineMath[0]?.expression;

    expect(expression).toBe("x^2");
    expect(parent.querySelector(`.${gfmMathClassName} .mbox-gfm-math-source`)?.textContent).toBe(expression);
    view.destroy();
  });

  it("keeps a full table cell around bare inline math and measures the expression", () => {
    const { parent, view } = createMathView("| $x^2$ | b |\n| --- | --- |");
    const cell = parent.querySelector<HTMLElement>(".mbox-gfm-table-cell");

    expect(cell?.querySelector(`.${gfmMathClassName}`)).not.toBeNull();
    expect(cell?.style.getPropertyValue("--mbox-table-kit-column-width")).toBe("3ch");
    view.destroy();
  });

  it.each([
    ["two equal 7B expressions", "| $x$ $x$ | b |", "x x", "3ch"],
    ["three equal 7B expressions", "| $x$ $x$ $x$ | b |", "x x x", "5ch"],
    ["adjacent equal 7B expressions", "| $x$$x$ | b |", "xx", "2ch"],
    ["mixed equal 7A and 7B expressions", "| $`x`$ $x$ $`x`$ | b |", "x x x", "5ch"],
  ])("uses its projected displayValue to size a table cell with %s", (_description, row, _display, width) => {
    const { parent, view } = createMathView(`${row}\n| --- | --- |`);
    const cell = parent.querySelector<HTMLElement>(".mbox-gfm-table-cell");

    expect(cell?.querySelectorAll(`.${gfmMathClassName}`)).toHaveLength((row.match(/\$/g) ?? []).length / 2);
    expect(cell?.style.getPropertyValue("--mbox-table-kit-column-width")).toBe(width);
    view.destroy();
  });

  it("gives math fences and multiline dollar blocks identical CRLF decoration behavior", () => {
    const fence = "```math\r\nx^2\r\n```";
    const dollars = "$$\r\nx^2\r\n$$";
    for (const doc of [fence, dollars]) {
      const idle = createMathView(doc);
      expect([...idle.parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(["rendered:x^2x^2", "", ""]);
      idle.view.destroy();

      const active = createMathView(doc, doc.indexOf("x^2"));
      Object.defineProperty(active.view, "hasFocus", { value: true });
      active.view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("x^2")) });
      expect(active.parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
      // CodeMirror normalizes its document storage to LF, while this input
      // still exercises the parser's CRLF source offsets before the view is made.
      const parsed = parseGfmDocument(doc);
      expect((parsed.inlineMath[0]?.expression ?? parsed.codeBlocks[0]?.value)).toBe("x^2");
      expect(active.view.state.doc.toString()).toBe(doc.replaceAll("\r\n", "\n"));
      expect([...active.parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(
        doc.split("\r\n"),
      );
      active.view.destroy();
    }
  });

  it("renders backtick-delimited inline math once rather than decorating it as code", () => {
    const { parent, view } = createMathView("before $`x^2`$ after");

    const math = parent.querySelector(`.${gfmMathClassName}`);
    expect(math?.textContent).toBe("rendered:x^2x^2");
    expect(parent.querySelector(".mbox-gfm-code")).toBeNull();
    expect(math?.getAttribute("role")).toBe("math");
    expect(math?.querySelector(".mbox-gfm-math-source")?.textContent).toBe("x^2");

    view.destroy();
  });

  it("keeps a backtick-delimited span as inline code without a renderer", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc: "$`x^2`$", extensions: [createMboxExtension({ plugins: gfmPlugins() })] }),
    });

    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect(parent.querySelector(".mbox-gfm-code")?.textContent).toBe("x^2");

    view.destroy();
  });

  it.each([
    ["on its own", "$`a\nb`$"],
    ["with surrounding text", "before $`a\nb`$ after"],
  ])("does not replace a multiline dollar-wrapped code span %s", (_description, doc) => {
    // Constructing a real EditorView is the regression check: CodeMirror
    // rejects plugin replace decorations whose range contains a line break.
    const { parent, view } = createMathView(doc);

    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect([...parent.querySelectorAll(".mbox-gfm-code")].map((code) => code.textContent)).toEqual(["a", "b"]);

    view.destroy();
  });

  it("preserves a full-cell table element around inline math", () => {
    const { parent, view } = createMathView("| $`x^2`$ | b |\n| --- | --- |");

    const cell = parent.querySelector<HTMLElement>(".mbox-gfm-table-cell");
    expect(cell?.textContent).toBe("rendered:x^2x^2");
    expect(cell?.getAttribute("role")).toBe("columnheader");
    expect(cell?.style.getPropertyValue("--mbox-table-kit-column-width")).toBe("3ch");
    expect(cell?.querySelector(`.${gfmMathClassName}`)).not.toBeNull();

    view.destroy();
  });

  it("keeps tall inline-math table columns sized from their source projection", () => {
    const { parent, view } = createMathView("| $`tall`$ | x |\n| --- | --- |\n| y | z |\n\nplain");

    const headerCells = [...parent.querySelectorAll<HTMLElement>('[role="columnheader"]')];
    // The renderer's DOM is not the width source: table-kit measures the
    // projected math expression (`tall`) and the literal `x` instead.
    expect(headerCells.map((cell) => cell.style.getPropertyValue("--mbox-table-kit-column-width"))).toEqual(["4ch", "1ch"]);

    view.destroy();
  });

  it("restores the complete inline source on an active line", () => {
    const { parent, view } = createMathView("$`x^2`$", 3);

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(3) });

    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe("$`x^2`$");

    view.destroy();
  });

  it("falls back to the ordinary code-block card when no renderer is injected", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc: MATH_FENCE, extensions: [createMboxExtension({ plugins: gfmPlugins() })] }),
    });

    expect(parent.querySelector(".mbox-gfm-code-block")).not.toBeNull();
    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();

    view.destroy();
  });

  it("uses the injected renderer instead of the code-block card when math has metadata", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "```math foo\nx^2\n```",
        extensions: [
          createMboxExtension({
            plugins: gfmPlugins({
              math: {
                render: (expression) => {
                  const element = document.createElement("var");
                  element.textContent = `rendered:${expression}`;
                  return element;
                },
              },
            }),
          }),
        ],
      }),
    });

    expect(parent.querySelector(`.${gfmMathClassName} var`)?.textContent).toBe("rendered:x^2");
    expect(parent.querySelector(".mbox-gfm-code-block")).toBeNull();

    view.destroy();
  });

  it("contains a throwing renderer and leaves its TeX source and other decorations available", () => {
    const parent = document.createElement("div");
    const thrown = new Error("renderer failed");
    const otherPlugin: MboxPlugin = {
      decorations: ({ state }) => [{ type: "mark", from: state.doc.length - 5, to: state.doc.length, className: "still-rendered" }],
    };

    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: `${MATH_FENCE}\nother`,
        extensions: [createMboxExtension({ plugins: [...gfmPlugins({ math: { render: () => { throw thrown; } } }), otherPlugin] })],
      }),
    });

    expect(parent.querySelector(".cm-editor")).not.toBeNull();
    expect(parent.querySelector(`.${gfmMathClassName}`)?.textContent).toBe("x^2");
    expect(parent.querySelector(".still-rendered")?.textContent).toBe("other");

    view.destroy();
  });

  it("gives unmarked renderers a hidden TeX equivalent for assistive technology", () => {
    const { parent, view } = createMathView(MATH_FENCE);
    const math = parent.querySelector(`.${gfmMathClassName}`);

    expect(math?.getAttribute("role")).toBe("math");
    expect(math?.querySelector(".mbox-gfm-math-source")?.textContent).toBe("x^2");

    view.destroy();
  });

  it("does not add the TeX fallback when a renderer declares its accessible equivalent", () => {
    const renderer = Object.assign((expression: string) => {
      const element = document.createElement("var");
      element.textContent = `rendered:${expression}`;
      return element;
    }, { providesAccessibleMath: true });
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc: MATH_FENCE, extensions: [createMboxExtension({ plugins: gfmPlugins({ math: { render: renderer } }) })] }),
    });

    expect(parent.querySelector(`.${gfmMathClassName}`)?.getAttribute("role")).toBe("math");
    expect(parent.querySelector(".mbox-gfm-math-source")).toBeNull();

    view.destroy();
  });

  it("restores raw source while an interior line is active", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: MATH_FENCE,
        selection: EditorSelection.cursor(8),
        extensions: [createMboxExtension({ plugins: gfmPlugins({ math: { render: () => document.createElement("span") } }) })],
      }),
    });

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(8) });

    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect([...parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual(["```math", "x^2", "```"]);

    view.destroy();
  });

  it.each([
    ["a list item", "- item\n\n  ```math\n  x^2\n  ```", "rendered:x^2"],
    ["leading spaces", "  ```math\n  x^2\n  ```", "rendered:x^2"],
    ["a tab-indented list item", "- item\n\n\t```math\n\tx^2\n\t```", "rendered:x^2"],
    ["an unterminated fence", "  ```math\n  x^2", "rendered:x^2"],
  ])("hides every source line for %s", (_description, doc, expectedExpression) => {
    const { parent, view } = createMathView(doc);

    expect(parent.querySelector(`.${gfmMathClassName} var`)?.textContent).toBe(expectedExpression);
    const widgetLine = parent.querySelector(`.${gfmMathClassName}`)?.closest(".cm-line");
    expect(widgetLine?.querySelector("var")?.textContent).toBe(expectedExpression);
    const visibleSource = [...parent.querySelectorAll(".cm-line")]
      .filter((line) => line !== widgetLine && getComputedStyle(line).display !== "none")
      .map((line) => line.textContent)
      .join("\n");
    expect(visibleSource).not.toMatch(/```|x\^2/);
    expect(
      [...parent.querySelectorAll(".cm-line")]
        .filter((line) => line !== widgetLine)
        .map((line) => line.textContent)
        .join("\n"),
    ).not.toMatch(/```|x\^2|\^2/);

    view.destroy();
  });

  it("restores every raw line for an active indented math fence", () => {
    const doc = "- item\n\n  ```math\n  x^2\n  ```";
    const { parent, view } = createMathView(doc, doc.indexOf("x^2"));

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("x^2")) });

    expect(parent.querySelector(`.${gfmMathClassName}`)).toBeNull();
    expect([...parent.querySelectorAll(".cm-line")].map((line) => line.textContent)).toEqual([
      "•item",
      "",
      "  ```math",
      "  x^2",
      "  ```",
    ]);

    view.destroy();
  });
});
