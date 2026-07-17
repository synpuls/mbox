import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { MboxFootnoteRefWidget, mboxFootnotePlugin } from "./footnote.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return mboxFootnotePlugin().decorations!(createTestContext(input, { activeLines }));
}

const doc = "text[^1] more\n\n[^1]: the note";

describe("mboxFootnotePlugin", () => {
  it("replaces an idle reference with a chip widget carrying label and note text", () => {
    const specs = specsFor(doc);
    const ref = specs.find((spec) => spec.type === "replace");
    expect(ref).toMatchObject({ from: 4, to: 8 });
    const widget = (ref as unknown as { widget: MboxFootnoteRefWidget }).widget;
    expect(widget).toBeInstanceOf(MboxFootnoteRefWidget);
    expect(widget.label).toBe("1");
    expect(widget.note).toBe("the note");
  });

  it("reveals the raw reference on its active line", () => {
    const specs = specsFor(doc, [1]);
    expect(specs.filter((spec) => spec.type === "replace")).toEqual([]);
  });

  it("styles the definition as a container with a marked `[^1]:` prefix, focused or not", () => {
    for (const activeLines of [noActiveLines, [3]]) {
      const specs = specsFor(doc, activeLines);
      expect(specs).toContainEqual(expect.objectContaining({
        type: "lineRange",
        from: 15,
        to: 29,
        className: "mbox-footnote",
      }));
      expect(specs).toContainEqual(expect.objectContaining({
        type: "mark",
        from: 15,
        to: 20,
        className: "mbox-footnote-marker",
      }));
    }
  });

  it("matches references and definitions case-insensitively", () => {
    const specs = specsFor("text[^Label]\n[^label]: mixed case");
    const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: MboxFootnoteRefWidget }).widget;
    expect(widget.label).toBe("Label");
    expect(widget.note).toBe("mixed case");
  });

  it("links an idle resolved reference to its idle definition and exposes footnote roles", () => {
    const specs = specsFor(doc);
    const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: MboxFootnoteRefWidget }).widget;
    expect(widget.targetId).toBe("mbox-footnote-15");
    expect(specs).toContainEqual(expect.objectContaining({
      type: "lineRange",
      from: 15,
      attributes: { id: "mbox-footnote-15", role: "doc-footnote", "aria-label": "Footnote 1" },
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      type: "mark",
      from: 15,
      to: 20,
      attributes: { "aria-hidden": "true" },
    }));
  });

  it("keeps unresolved or active-definition references as non-link chips", () => {
    for (const [input, activeLines] of [["text[^x]", noActiveLines], [doc, [3]]] as const) {
      const specs = specsFor(input, activeLines);
      const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: MboxFootnoteRefWidget }).widget;
      expect(widget.targetId).toBeUndefined();
    }
  });

  it("keeps a standalone idle definition as a footnote target", () => {
    const specs = specsFor("[^solo]: note");
    expect(specs).toContainEqual(expect.objectContaining({
      type: "lineRange",
      attributes: { id: "mbox-footnote-0", role: "doc-footnote", "aria-label": "Footnote solo" },
    }));
  });
});
