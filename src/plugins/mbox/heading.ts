import { type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDocument } from "./types.js";
import { moveCursorToPreviousBlockStart } from "./vertical-motion.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

const headingLineClassName = "mbox-heading-line";
const headingLevelProperty = "--mbox-heading-level";
export const headingClassNames = {
  h1: "mbox-h1",
  h2: "mbox-h2",
  h3: "mbox-h3",
  h4: "mbox-h4",
  h5: "mbox-h5",
  h6: "mbox-h6",
};

function getHeadingPublicClassName(level: number): string {
  return headingClassNames[`h${level}` as keyof typeof headingClassNames];
}

function createHeadingSyntaxHideSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "heading" && !activeLines.has(block.line) && block.content.from !== block.content.to
      ? [{ type: "replace", from: block.syntax.from, to: block.syntax.to }]
      : [],
  );
}

function createHeadingLineSpecs(document: MboxDocument, className: string): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "heading"
      ? [
          {
            type: "line",
            from: block.from,
            className: `${className} ${getHeadingPublicClassName(block.level)}`,
            attributes: {
              style: `${headingLevelProperty}: ${block.level}`,
            },
          },
        ]
      : [],
  );
}

export function headingPlugin(): MboxPlugin {
  return {
    keymap: [
      {
        key: "ArrowUp",
        run: (view) => moveCursorToPreviousBlockStart(view, ["heading"]),
      },
    ],
    name: "mbox/heading",
    decorations: (context) => {
      const document = getMboxDocumentFromState(context.state);
      return [
        ...createHeadingLineSpecs(document, headingLineClassName),
        ...createHeadingSyntaxHideSpecs(document, context.activeLineNumbers),
      ];
    },
  };
}
