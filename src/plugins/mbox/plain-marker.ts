import { type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

const plainMarkerClassName = "mbox-plain-marker";
const plainMarkerHideClassName = "mbox-plain-marker-hide";

function createMarkerSpecs(document: MboxDocument): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    "marker" in block ? [{ ...block.marker, className: plainMarkerClassName }] : [],
  );
}

function createSyntaxHideSpecs(document: MboxDocument, activeLineNumbers: Set<number>): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    "syntax" in block && !activeLineNumbers.has(block.line)
      ? [{ type: "mark", from: block.syntax.from, to: block.syntax.to, className: plainMarkerHideClassName }]
      : [],
  );
}

export function plainMarkerPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${plainMarkerHideClassName}`]: {
        display: "none",
      },
    },
    name: "mbox/plain-marker",
    decorations: (context) => {
      const document = getMboxDocumentFromState(context.state);
      return [...createMarkerSpecs(document), ...createSyntaxHideSpecs(document, context.activeLineNumbers)];
    },
  };
}
