import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { GfmFootnoteRefWidget, gfmFootnotePlugin } from "./footnote.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return gfmFootnotePlugin().decorations!(createTestContext(input, { activeLines }));
}

const doc = "text[^1] more\n\n[^1]: the note";

describe("gfmFootnotePlugin", () => {
  it("replaces an idle reference with a chip widget carrying label and note text", () => {
    const specs = specsFor(doc);
    const ref = specs.find((spec) => spec.type === "replace");
    expect(ref).toMatchObject({ from: 4, to: 8 });
    const widget = (ref as unknown as { widget: GfmFootnoteRefWidget }).widget;
    expect(widget).toBeInstanceOf(GfmFootnoteRefWidget);
    expect(widget.label).toBe("1");
    expect(widget.note).toBe("the note");
  });

  it("reveals the raw reference on its active line", () => {
    const specs = specsFor(doc, [1]);
    expect(specs.filter((spec) => spec.type === "replace")).toEqual([]);
  });

  it("styles the definition as a container with a marked `[^1]:` prefix, focused or not", () => {
    // The definition dressing is styling, not marker hiding, so it applies on
    // active lines too (like heading line classes) — heights stay focus-stable.
    for (const activeLines of [noActiveLines, [3]]) {
      const specs = specsFor(doc, activeLines);
      expect(specs).toContainEqual(expect.objectContaining({
        type: "lineRange",
        from: 15,
        to: 29,
        className: "mbox-gfm-footnote",
      }));
      expect(specs).toContainEqual(expect.objectContaining({
        type: "mark",
        from: 15,
        to: 20,
        className: "mbox-gfm-footnote-marker",
      }));
    }
  });

  it("links an idle resolved reference to its idle definition and exposes footnote roles", () => {
    const specs = specsFor(doc);
    const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: GfmFootnoteRefWidget }).widget;
    expect(widget.targetId).toBe("gfm-footnote-15");
    expect(specs).toContainEqual(expect.objectContaining({
      type: "line",
      from: 15,
      attributes: { id: "gfm-footnote-15", role: "doc-footnote", "aria-label": "Footnote 1" },
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      type: "mark",
      from: 15,
      to: 20,
      attributes: { "aria-hidden": "true" },
    }));
  });

  it("does not give a reference link semantics while any definition line is active", () => {
    const input = "text[^1]\n\n[^1]: first\n  second";
    const specs = specsFor(input, [4]);
    const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: GfmFootnoteRefWidget }).widget;
    expect(widget.targetId).toBeUndefined();
    expect(specs.some((spec) => spec.type === "line" && "attributes" in spec && spec.attributes?.role === "doc-footnote")).toBe(false);
    expect(specs.some((spec) => spec.type === "line" && "attributes" in spec && spec.attributes?.id?.startsWith("gfm-footnote-"))).toBe(false);
    expect(specs.some((spec) => spec.type === "mark" && "attributes" in spec && spec.attributes?.["aria-hidden"] === "true")).toBe(false);
  });

  it("owns every inactive continuation line from the definition target", () => {
    const input = "text[^1]\n\n[^1]: first\n  second";
    const specs = specsFor(input);
    expect(specs).toContainEqual(expect.objectContaining({
      type: "line",
      from: 10,
      attributes: expect.objectContaining({
        id: "gfm-footnote-10",
        role: "doc-footnote",
        "aria-owns": "gfm-footnote-10-line-22",
      }),
    }));
    expect(specs).toContainEqual(expect.objectContaining({
      type: "line",
      from: 22,
      attributes: { id: "gfm-footnote-10-line-22" },
    }));
  });

  it("uses the last duplicate definition as the resolved target", () => {
    const input = "text[^x]\n\n[^x]: first\n\n[^x]: last";
    const specs = specsFor(input);
    const widget = (specs.find((spec) => spec.type === "replace") as unknown as { widget: GfmFootnoteRefWidget }).widget;
    expect(widget.targetId).toBe("gfm-footnote-23");
  });
});
