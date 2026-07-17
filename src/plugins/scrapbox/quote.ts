import { type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { scrapboxIndentAttribute } from "./list.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentCacheEntryFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxQuoteLineClassName = "mbox-scrapbox-quote-line";
export const scrapboxQuoteMarkerHiddenClassName = "mbox-scrapbox-quote-marker-hidden";

export const scrapboxQuoteClassNames = {
  line: scrapboxQuoteLineClassName,
};

function createScrapboxQuoteSpecs(
  input: string,
  document: ScrapboxDocument,
  activeLines: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  const blockLineNumbers = scrapboxBlockLineNumbers(document);

  return document.lines.flatMap((line) => {
    const isQuote = line.content.to > line.content.from && input[line.content.from] === ">";
    if (!isQuote || blockLineNumbers.has(line.line)) {
      return [];
    }

    // Real Scrapbox keeps a quote's left border/color while its line is
    // focused, and hides the `>` marker with visibility rather than removing
    // it from layout -- so the marker's width stays reserved and the quote
    // body's x-position never shifts between focus states (mirroring
    // mbox/list.ts's own listSyntaxHideClassName pattern).
    const active = activeLines.has(line.line);
    return [
      {
        type: "line",
        from: line.from,
        className: scrapboxQuoteLineClassName,
        attributes: { [scrapboxIndentAttribute]: String(line.indent) },
      },
      ...(active
        ? []
        : [{ type: "mark" as const, from: line.content.from, to: line.content.from + 1, className: scrapboxQuoteMarkerHiddenClassName }]),
    ];
  });
}

export function scrapboxQuotePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${scrapboxQuoteMarkerHiddenClassName}`]: {
        visibility: "hidden",
      },
    },
    name: "scrapbox/quote",
    decorations: (context) => {
      const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
      return createScrapboxQuoteSpecs(input, document, context.activeLineNumbers);
    },
  };
}
