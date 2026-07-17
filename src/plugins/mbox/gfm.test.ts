import { describe, expect, it } from "vitest";
import { parseGfmMarkdown } from "./gfm.js";

describe("parseGfmMarkdown", () => {
  it("parses GFM strikethrough inline syntax with positional offsets", () => {
    const tree = parseGfmMarkdown("~~done~~");
    const paragraph = tree.children[0];
    const node = "children" in paragraph ? paragraph.children[0] : undefined;

    expect(node).toMatchObject({
      type: "delete",
      position: {
        start: { offset: 0 },
        end: { offset: 8 },
      },
    });
  });

  it("parses representative inline syntax that mbox depends on", () => {
    const tree = parseGfmMarkdown("*em* **strong** `code` [label](https://example.com)");
    const paragraph = tree.children[0];
    const children = "children" in paragraph ? paragraph.children : [];

    expect(children.map((node) => node.type)).toEqual(["emphasis", "text", "strong", "text", "inlineCode", "text", "link"]);
    expect(children[0]).toMatchObject({
      type: "emphasis",
      position: {
        start: { offset: 0 },
        end: { offset: 4 },
      },
    });
    expect(children[6]).toMatchObject({
      type: "link",
      url: "https://example.com",
      position: {
        start: { offset: 23 },
        end: { offset: 51 },
      },
    });
  });
});
