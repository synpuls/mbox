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

    // A focused quote line keeps its left border and colour: the line is still
    // a quote while you edit it, and dropping the styling would make the line
    // jump between focus states. The `>` marker is hidden with visibility
    // rather than removed from layout, so its width stays reserved and the
    // quote body's x-position never shifts either (mirroring mbox/list.ts's
    // own listSyntaxHideClassName pattern).
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
