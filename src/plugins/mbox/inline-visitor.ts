import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec } from "../../editor/plugin.js";
import type { MboxBlock, MboxDocument, MboxInlineNode } from "./types.js";

type InlineBlock = MboxBlock & { inline: MboxInlineNode[] };

export function createInactiveInlineNodeSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  createSpecs: (node: MboxInlineNode, block: InlineBlock) => MboxDecorationSpec[],
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    activeLines.has(block.line) || !("inline" in block) ? [] : block.inline.flatMap((node) => createSpecs(node, block)),
  );
}
