import { describe, expect, it } from "vitest";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxInlineNode } from "./inline.js";

describe("collectScrapboxInlineNodeResults", () => {
  it("visits top-level and nested inline nodes depth-first", () => {
    const nodes: ScrapboxInlineNode[] = [
      {
        type: "decoration",
        from: 0,
        to: 21,
        rawDecos: "*",
        decos: ["*-1"],
        openingMarker: { from: 0, to: 3 },
        closingMarker: { from: 20, to: 21 },
        content: { from: 3, to: 20 },
        children: [
          {
            type: "internalLink",
            from: 3,
            to: 9,
            pathType: "relative",
            href: "Page",
            openingMarker: { from: 3, to: 4 },
            closingMarker: { from: 8, to: 9 },
            target: { from: 4, to: 8 },
          },
          { type: "text", from: 9, to: 14, value: " and " },
          {
            type: "code",
            from: 14,
            to: 20,
            openingMarker: { from: 14, to: 15 },
            closingMarker: { from: 19, to: 20 },
            content: { from: 15, to: 19 },
            value: "code",
          },
        ],
      },
    ];

    expect(collectScrapboxInlineNodeResults(nodes, (node: ScrapboxInlineNode) => [node.type])).toEqual([
      "decoration",
      "internalLink",
      "text",
      "code",
    ]);
  });

  it("collects only visitor results and ignores empty returns", () => {
    const nodes: ScrapboxInlineNode[] = [
      { type: "formula", from: 0, to: 6, expression: "x", content: { from: 3, to: 4 } },
      { type: "text", from: 6, to: 7, value: " " },
      {
        type: "internalLink",
        from: 7,
        to: 13,
        pathType: "relative",
        href: "Page",
        openingMarker: { from: 7, to: 8 },
        closingMarker: { from: 12, to: 13 },
        target: { from: 8, to: 12 },
      },
    ];

    expect(
      collectScrapboxInlineNodeResults(nodes, (node) =>
        node.type === "formula" || node.type === "internalLink" ? [{ type: node.type, from: node.from, to: node.to }] : [],
      ),
    ).toEqual([
      { type: "formula", from: 0, to: 6 },
      { type: "internalLink", from: 7, to: 13 },
    ]);
  });
});
