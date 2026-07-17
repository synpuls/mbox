import type { ScrapboxInlineNode } from "./inline.js";

export function collectScrapboxInlineNodeResults<T>(
  nodes: ScrapboxInlineNode[],
  visitor: (node: ScrapboxInlineNode) => T[],
): T[] {
  // Scrapbox inline children currently belong only to decoration/strong nodes.
  // We always walk them after visiting the parent so parent styling specs and
  // nested child specs keep parser order. If a future parent node replaces its
  // whole range as a widget, this walker will need an explicit "skip children"
  // option to avoid duplicate specs.
  return nodes.flatMap((node) => [
    ...visitor(node),
    ...(node.type === "decoration" || node.type === "strong"
      ? collectScrapboxInlineNodeResults(node.children, visitor)
      : []),
  ]);
}
