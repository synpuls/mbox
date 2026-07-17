import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDocument } from "./types.js";
import { moveCursorToPreviousBlockStart } from "./vertical-motion.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

const quoteLineClassName = "mbox-quote-line";
export const quoteClassNames = {
  quote: "mbox-quote",
};

function createQuoteSyntaxHideSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "quote" && !activeLines.has(block.line) ? [{ ...block.syntax, type: "replace" }] : [],
  );
}

function createQuoteLineSpecs(document: MboxDocument, className: string): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "quote"
      ? [
          {
            type: "line",
            from: block.from,
            className: `${className} ${quoteClassNames.quote}`,
          },
        ]
      : [],
  );
}

export function quotePlugin(): MboxPlugin {
  return {
    keymap: [
      {
        key: "ArrowUp",
        run: (view) => moveCursorToPreviousBlockStart(view, ["quote"]),
      },
    ],
    name: "mbox/quote",
    decorations: (context) => {
      const document = getMboxDocumentFromState(context.state);
      return [
        ...createQuoteLineSpecs(document, quoteLineClassName),
        ...createQuoteSyntaxHideSpecs(document, context.activeLineNumbers),
      ];
    },
  };
}
