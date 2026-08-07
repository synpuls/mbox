import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxCodeBlock, ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxSkippedLineNumbers } from "./visible-lines.js";

export const scrapboxFormulaClassName = "mbox-scrapbox-formula";
const scrapboxFormulaBlockClassName = "mbox-scrapbox-formula-block";
const scrapboxFormulaHiddenLineClassName = "mbox-scrapbox-formula-hidden-line";
const scrapboxFormulaSourceClassName = "mbox-scrapbox-formula-source";

export const scrapboxFormulaClassNames = {
  formula: scrapboxFormulaClassName,
  block: scrapboxFormulaBlockClassName,
};

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
export interface ScrapboxFormulaRenderer {
  (expression: string): HTMLElement;
  providesAccessibleMath?: boolean;
}

export interface ScrapboxFormulaPluginOptions {
  render?: ScrapboxFormulaRenderer;
}

export class ScrapboxFormulaWidget extends WidgetType {
  constructor(
    private readonly expression: string,
    private readonly render: ScrapboxFormulaRenderer | undefined,
    private readonly block = false,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ScrapboxFormulaWidget &&
      this.expression === other.expression &&
      this.render === other.render &&
      this.block === other.block
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = `${scrapboxFormulaClassName}${this.block ? ` ${scrapboxFormulaBlockClassName}` : ""}`;
    element.setAttribute("role", "math");
    if (this.render) {
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

      // This deliberately stays local rather than sharing GFM's widget code:
      // Scrapbox owns a single inline replacement, while GFM coordinates both
      // inline and multi-line block replacements. The renderer contract itself
      // uses the same names and wording in both namespaces.
      if (!this.render.providesAccessibleMath) {
        const source = document.createElement("span");
        source.className = scrapboxFormulaSourceClassName;
        source.textContent = this.expression;
        element.appendChild(source);
      }
    } else {
      element.textContent = this.expression;
    }
    return element;
  }
}

function collectFormulas(node: ScrapboxInlineNode): { from: number; to: number; expression: string }[] {
  switch (node.type) {
    case "formula":
      return [{ from: node.from, to: node.to, expression: node.expression }];
    default:
      return [];
  }
}

function createScrapboxFormulaSpecs(
  document: ScrapboxDocument,
  input: string,
  activeLines: MboxActiveLineNumbers,
  options: ScrapboxFormulaPluginOptions = {},
): MboxDecorationSpec[] {
  const skippedLineNumbers = scrapboxSkippedLineNumbers(document, activeLines);

  const inlineSpecs = document.lines.flatMap((line) =>
    skippedLineNumbers.has(line.line)
      ? []
      : collectScrapboxInlineNodeResults(line.inline, collectFormulas)
          .map((formula) => ({
            type: "replace" as const,
            from: formula.from,
            to: formula.to,
            widget: new ScrapboxFormulaWidget(formula.expression, options.render),
          })),
  );
  const blockSpecs = document.codeBlocks.flatMap((block) =>
    block.kind === "formula" && !hasActiveFormulaBlockLine(block, activeLines)
      ? createFormulaBlockSpecs(block, input, options.render)
      : [],
  );
  return [...blockSpecs, ...inlineSpecs];
}

function hasActiveFormulaBlockLine(block: ScrapboxCodeBlock, activeLines: MboxActiveLineNumbers): boolean {
  return activeLines.has(block.openerLine.line) || block.bodyLines.some((line) => activeLines.has(line.line));
}

/** Matches the code-block segment rule: remove the opener indent plus the
 * body's one required indent marker, preserving any deeper indentation. */
function getFormulaBlockExpression(block: ScrapboxCodeBlock, input: string): string {
  return block.bodyLines
    .map((body) => input.slice(body.from + block.indent + 1, body.logicalTo))
    .join("\n");
}

function createFormulaBlockSpecs(
  block: ScrapboxCodeBlock,
  input: string,
  render: ScrapboxFormulaRenderer | undefined,
): MboxDecorationSpec[] {
  const specs: MboxDecorationSpec[] = [{
    type: "replace",
    from: block.openerLine.from,
    to: block.openerLine.logicalTo,
    widget: new ScrapboxFormulaWidget(getFormulaBlockExpression(block, input), render, true),
  }];
  for (const body of block.bodyLines) {
    if (body.from < body.logicalTo) {
      specs.push({ type: "replace", from: body.from, to: body.logicalTo });
    }
    specs.push({ type: "line", from: body.from, className: scrapboxFormulaHiddenLineClassName });
  }
  return specs;
}

/** A block formula replaces its opener and hides every body line. Point
 * widgets from host plugins can otherwise survive inside the opener replace,
 * so inactive formula blocks claim the entire physical source range. */
function createFormulaBlockFirewallRanges(
  document: ScrapboxDocument,
  activeLines: MboxActiveLineNumbers,
): { from: number; to: number }[] {
  return document.codeBlocks.flatMap((block) => {
    if (block.kind !== "formula" || hasActiveFormulaBlockLine(block, activeLines)) return [];
    const lastLine = block.bodyLines.at(-1) ?? block.openerLine;
    return [{ from: block.openerLine.from, to: lastLine.logicalTo }];
  });
}

export function scrapboxFormulaPlugin(options: ScrapboxFormulaPluginOptions = {}): MboxPlugin {
  return {
    name: "scrapbox/formula",
    theme: {
      [`.${scrapboxFormulaBlockClassName}`]: {
        display: "block",
      },
      [`.${scrapboxFormulaHiddenLineClassName}`]: {
        display: "none",
      },
      [`.${scrapboxFormulaSourceClassName}`]: {
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
    },
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      return createScrapboxFormulaSpecs(document, context.state.doc.toString(), context.activeLineNumbers, options);
    },
    decorationFirewallRanges: (context) =>
      createFormulaBlockFirewallRanges(getScrapboxDocumentFromState(context.state), context.activeLineNumbers),
  };
}
