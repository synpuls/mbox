import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument, MboxInlineNode, MboxInlineStyleNode } from "./types.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { createInlineStyleKitSpecs } from "../inline-style-kit.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const inlineStyleClassNames = {
  em: "mbox-em",
  strong: "mbox-strong",
  strike: "mbox-strike",
};

function createInlineStyleSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  classNames: typeof inlineStyleClassNames,
): MboxDecorationSpec[] {
  return createInactiveInlineNodeSpecs(document, activeLines, (node) => createInlineStyleSpecsForNode(node, classNames));
}

function createInlineStyleSpecsForNode(
  node: MboxInlineNode,
  classNames: typeof inlineStyleClassNames,
): MboxDecorationSpec[] {
  if (!isInlineStyleNode(node)) {
    return [];
  }
  const className = getInlineStyleClassName(node, classNames);

  return createInlineStyleKitSpecs(
    { openMarker: node.openingMarker, content: node.content, closeMarker: node.closingMarker, className },
    true,
  );
}

function isInlineStyleNode(node: MboxInlineNode): node is MboxInlineStyleNode {
  return node.type === "emphasis" || node.type === "strong" || node.type === "strikethrough";
}

function getInlineStyleClassName(node: MboxInlineStyleNode, classNames: typeof inlineStyleClassNames): string {
  if (node.type === "emphasis") {
    return classNames.em;
  }

  if (node.type === "strong") {
    return classNames.strong;
  }

  if (node.type === "strikethrough") {
    return classNames.strike;
  }

  return classNames.em;
}

export function inlineStylePlugin(): MboxPlugin {
  return {
    name: "mbox/inline-style",
    decorations: (context) =>
      createInlineStyleSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers, inlineStyleClassNames),
  };
}
