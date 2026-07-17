import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { createInlineStyleKitSpecs } from "../inline-style-kit.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const inlineCodeClassName = "mbox-inline-code";
export const inlineCodeClassNames = {
  code: inlineCodeClassName,
};

function createInlineCodeSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
): MboxDecorationSpec[] {
  return createInactiveInlineNodeSpecs(document, activeLines, (node) =>
    node.type === "inlineCode"
      ? createInlineStyleKitSpecs(
          { openMarker: node.openingMarker, content: node.content, closeMarker: node.closingMarker, className },
          true,
        )
      : [],
  );
}

export function inlineCodePlugin(): MboxPlugin {
  return {
    name: "mbox/inline-code",
    decorations: (context) =>
      createInlineCodeSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers, inlineCodeClassName),
  };
}
