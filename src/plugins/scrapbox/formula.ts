import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxSkippedLineNumbers } from "./visible-lines.js";

export const scrapboxFormulaClassName = "mbox-scrapbox-formula";

export const scrapboxFormulaClassNames = {
  formula: scrapboxFormulaClassName,
};

/** Render a KaTeX/MathJax-style expression into a DOM node (pluggable). */
export type ScrapboxFormulaRenderer = (expression: string) => HTMLElement;

export interface ScrapboxFormulaPluginOptions {
  render?: ScrapboxFormulaRenderer;
}

export class ScrapboxFormulaWidget extends WidgetType {
  constructor(
    private readonly expression: string,
    private readonly render: ScrapboxFormulaRenderer | undefined,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof ScrapboxFormulaWidget && this.expression === other.expression && this.render === other.render;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = scrapboxFormulaClassName;
    if (this.render) {
      element.appendChild(this.render(this.expression));
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
  activeLines: MboxActiveLineNumbers,
  options: ScrapboxFormulaPluginOptions = {},
): MboxDecorationSpec[] {
  const skippedLineNumbers = scrapboxSkippedLineNumbers(document, activeLines);

  return document.lines.flatMap((line) =>
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
}

export function scrapboxFormulaPlugin(options: ScrapboxFormulaPluginOptions = {}): MboxPlugin {
  return {
    name: "scrapbox/formula",
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      return createScrapboxFormulaSpecs(document, context.activeLineNumbers, options);
    },
  };
}
