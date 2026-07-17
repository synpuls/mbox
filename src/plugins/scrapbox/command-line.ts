import { createContentMarkSpec, type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentCacheEntryFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxCommandLineClassName = "mbox-scrapbox-command-line";
export const scrapboxCommandPromptClassName = "mbox-scrapbox-command-prompt";
export const scrapboxCommandClassName = "mbox-scrapbox-command";

export const scrapboxCommandLineClassNames = {
  line: scrapboxCommandLineClassName,
  command: scrapboxCommandClassName,
};

const promptChars = new Set(["$", "%"]);

function createScrapboxCommandLineSpecs(
  input: string,
  document: ScrapboxDocument,
  _activeLineNumbers: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  // A command line hides no syntax: the `$ `/`% ` prompt stays literal and only
  // gains a class, so the style is safe to show as soon as the prompt is typed —
  // regardless of focus. Hence we skip only code/table blocks (whose content
  // must stay literal), not the active line. `_activeLineNumbers` is kept for
  // signature parity with the other scrapbox spec builders.
  const skippedLineNumbers = scrapboxBlockLineNumbers(document);

  return document.lines.flatMap((line) => {
    const isCommand = promptChars.has(input[line.content.from]) && input[line.content.from + 1] === " ";
    if (!isCommand || skippedLineNumbers.has(line.line)) {
      return [];
    }

    const commandFrom = line.content.from + 2;
    return [
      { type: "line", from: line.from, className: scrapboxCommandLineClassName },
      { type: "mark", from: line.content.from, to: line.content.from + 1, className: scrapboxCommandPromptClassName },
      ...(commandFrom < line.to ? [createContentMarkSpec(commandFrom, line.to, scrapboxCommandClassName)] : []),
    ];
  });
}

export function scrapboxCommandLinePlugin(): MboxPlugin {
  return {
    name: "scrapbox/command-line",
    decorations: (context) => {
      const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
      return createScrapboxCommandLineSpecs(input, document, context.activeLineNumbers);
    },
  };
}
