import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const paragraphClassNames = {
  paragraph: "mbox-paragraph",
  emptyLine: "mbox-empty-line",
};

function createParagraphLineSpecs(document: MboxDocument): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) => {
    if (block.type !== "paragraph") {
      return [];
    }

    const isEmptyLine = block.content.from === block.content.to;

    return [
      {
        type: "line",
        from: block.from,
        className: isEmptyLine
          ? `${paragraphClassNames.paragraph} ${paragraphClassNames.emptyLine}`
          : paragraphClassNames.paragraph,
      },
    ];
  });
}

export function paragraphPlugin(): MboxPlugin {
  return {
    name: "mbox/paragraph",
    decorations: (context) => createParagraphLineSpecs(getMboxDocumentFromState(context.state)),
  };
}
