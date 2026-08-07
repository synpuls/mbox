import { WidgetType } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import { isGfmMathFence, type GfmCodeBlock, type GfmDocument, type GfmInlineMath } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { isLineSpanActive } from "./active-lines.js";

export const gfmMathClassName = "mbox-gfm-math";
const gfmMathInlineClassName = "mbox-gfm-math-inline";
const gfmMathBlockClassName = "mbox-gfm-math-block";
const gfmMathHiddenLineClassName = "mbox-gfm-math-hidden-line";
const gfmMathSourceClassName = "mbox-gfm-math-source";

/**
 * Render a KaTeX/MathJax-style expression into a DOM node (pluggable).
 *
 * Returned DOM is trusted input: it must be created from trusted content or
 * sanitized by the renderer. mbox deliberately does not apply a generic HTML
 * sanitizer, because that could break legitimate MathML/HTML from renderers
 * such as KaTeX.
 *
 * By default, mbox adds a visually hidden TeX source fallback so assistive
 * technology always has an equivalent representation. Set
 * `providesAccessibleMath` when every DOM node this renderer returns already
 * exposes an accessible mathematical equivalent (for example, KaTeX's MathML).
 * That declaration suppresses the fallback and avoids duplicate announcements.
 *
 * If rendering throws, mbox displays the TeX source as visible text instead.
 */
export interface GfmMathRenderer {
  (expression: string): HTMLElement;
  providesAccessibleMath?: boolean;
}

export interface GfmMathPluginOptions {
  render?: GfmMathRenderer;
}

export class GfmMathWidget extends WidgetType {
  constructor(
    private readonly expression: string,
    private readonly render: GfmMathRenderer,
    private readonly inline = false,
  ) {
    super();
  }

  // `eq` promises that two widgets produce the same DOM, which is how
  // CodeMirror decides it may keep the element it already built. `inline`
  // picks the tag and the presentation class, so it belongs here. Two
  // proposed sequences for observing a stale element -- turning `$x$` into
  // `$$x$$` in one transaction, and deleting the leading `x ` from
  // `x $$x$$` so an inline range becomes a block range of the same length --
  // were both measured and both rebuilt the DOM correctly. The clause is here
  // because the contract requires it, not because a reuse was observed.
  eq(other: WidgetType): boolean {
    return (
      other instanceof GfmMathWidget &&
      this.expression === other.expression &&
      this.render === other.render &&
      this.inline === other.inline
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.inline ? "span" : "div");
    // Keep the exported base class for host CSS compatibility, while the
    // presentation class distinguishes inline and block widgets.
    element.className = `${gfmMathClassName} ${this.inline ? gfmMathInlineClassName : gfmMathBlockClassName}`;
    element.setAttribute("role", "math");

    try {
      element.appendChild(this.render(this.expression));
    } catch {
      // `onDecorationError` only receives failures while providers create or
      // lower specs. CodeMirror invokes WidgetType.toDOM() later, outside that
      // path, so reporting here would require a separate public error channel.
      // Keep this failure contained and make the source visible instead.
      element.textContent = this.expression;
      return element;
    }

    // Do not inspect renderer output to guess whether it contains MathML: that
    // is brittle. An unconditional hidden source would make capable renderers
    // announce the equation twice. The renderer declares the capability above;
    // unmarked renderers receive this fallback, so AT is never left with no
    // mathematical equivalent.
    if (!this.render.providesAccessibleMath) {
      const source = document.createElement("span");
      source.className = gfmMathSourceClassName;
      source.textContent = this.expression;
      element.appendChild(source);
    }
    return element;
  }
}

function hasActiveLine(block: GfmCodeBlock, activeLines: Set<number>): boolean {
  for (let line = block.firstLine; line <= block.lastLine; line += 1) {
    if (activeLines.has(line)) {
      return true;
    }
  }
  return false;
}

function createGfmMathSpecs(
  document: GfmDocument,
  source: Text,
  activeLines: Set<number>,
  render: GfmMathRenderer | undefined,
): MboxDecorationSpec[] {
  if (!render) {
    return [];
  }
  return document.codeBlocks.flatMap((block) =>
    isGfmMathFence(block) && !hasActiveLine(block, activeLines)
      ? createSpecsForMathBlock(block, source, render)
      : [],
  );
}

function createGfmInlineMathSpecs(
  document: GfmDocument,
  source: Text,
  activeLines: Set<number>,
  render: GfmMathRenderer | undefined,
): MboxDecorationSpec[] {
  if (!render) {
    return [];
  }
  return document.inlineMath.flatMap((math) =>
    isLineSpanActive(math, activeLines)
      ? []
      : math.display === "block"
        ? createSpecsForDollarMathBlock(math, source, render)
        : createSpecsForInlineMath(math, render),
  );
}

function createSpecsForMathBlock(block: GfmCodeBlock, source: Text, render: GfmMathRenderer): MboxDecorationSpec[] {
  // Do not derive document offsets from `content` plus offsets in `value`.
  // mdast removes fence indentation from `value`, while the parser's existing
  // `content` range still includes it. Physical document lines are the source
  // of truth here, so every interior (and closing-fence) line is hidden whole.
  return createSpecsForMultilineMath(block.from, block.info.to, block.firstLine, block.lastLine, block.value, source, render);
}

/**
 * CodeMirror cannot replace a range containing line breaks. Every multiline
 * math form therefore owns its first source line with the widget and replaces
 * plus hides every following line. Keep that invariant in one place.
 */
function createSpecsForMultilineMath(
  firstReplaceFrom: number,
  firstReplaceTo: number,
  startLine: number,
  endLine: number,
  expression: string,
  source: Text,
  render: GfmMathRenderer,
): MboxDecorationSpec[] {
  const specs: MboxDecorationSpec[] = [
    { type: "replace", from: firstReplaceFrom, to: firstReplaceTo, widget: new GfmMathWidget(expression, render) },
  ];
  for (let lineNumber = startLine + 1; lineNumber <= endLine; lineNumber += 1) {
    const line = source.line(lineNumber);
    if (line.from < line.to) {
      specs.push({ type: "replace", from: line.from, to: line.to });
    }
    specs.push({ type: "line", from: line.from, className: gfmMathHiddenLineClassName });
  }
  return specs;
}

function createSpecsForInlineMath(math: GfmInlineMath, render: GfmMathRenderer): MboxDecorationSpec[] {
  return [{ type: "replace", from: math.from, to: math.to, widget: new GfmMathWidget(math.expression, render, true) }];
}

function createSpecsForDollarMathBlock(math: GfmInlineMath, source: Text, render: GfmMathRenderer): MboxDecorationSpec[] {
  return createSpecsForMultilineMath(
    math.from,
    source.line(math.startLine).to,
    math.startLine,
    math.endLine,
    math.expression,
    source,
    render,
  );
}

const gfmMathTheme: MboxThemeSpec = {
  [`.${gfmMathInlineClassName}`]: {
    display: "inline-block",
    verticalAlign: "baseline",
  },
  [`.${gfmMathBlockClassName}`]: {
    display: "block",
  },
  [`.${gfmMathHiddenLineClassName}`]: {
    display: "none",
  },
  [`.${gfmMathSourceClassName}`]: {
    border: "0",
    clip: "rect(0 0 0 0)",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    padding: "0",
    position: "absolute",
    whiteSpace: "nowrap",
    width: "1px",
  },
};

export function gfmMathPlugin(options: GfmMathPluginOptions = {}): MboxPlugin {
  return {
    theme: gfmMathTheme,
    name: "gfm/math",
    decorations: (context) =>
      [
        ...createGfmMathSpecs(getGfmDocumentFromState(context.state), context.state.doc, context.activeLineNumbers, options.render),
        ...createGfmInlineMathSpecs(getGfmDocumentFromState(context.state), context.state.doc, context.activeLineNumbers, options.render),
      ],
  };
}
