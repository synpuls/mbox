import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { HatenaQuoteCiteWidget, hatenaBlockquotePlugin } from "./blockquote.js";
import { parseHatenaDocument } from "./parser.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaBlockquotePlugin().decorations!(createTestContext(input, { activeLines }));
}

// The repeating gradient paints one bar per 0.9em. Its finite background size
// makes it stop at the displayed nesting depth; the translucent tint remains
// the final background layer so selections stay visible.
const DEPTH1_STYLE =
  "padding-left:calc(1 * 0.9em + 0.5em);background:repeating-linear-gradient(to right, #cbd5e1 0 3px, transparent 3px 0.9em) 0 0/calc(1 * 0.9em) 100% no-repeat,rgba(148, 163, 184, 0.06);";
const DEPTH2_STYLE =
  "padding-left:calc(2 * 0.9em + 0.5em);background:repeating-linear-gradient(to right, #cbd5e1 0 3px, transparent 3px 0.9em) 0 0/calc(2 * 0.9em) 100% no-repeat,rgba(148, 163, 184, 0.06);";

describe("hatenaBlockquotePlugin", () => {
  it("styles each quote line at its depth and hides the >> and << markers", () => {
    // ">>"=0..2, "q"=3..4, "<<"=5..7
    expect(specsFor(">>\nq\n<<")).toEqual([
      { type: "lineRange", from: 0, to: 7, className: "mbox-hatena-quote-block" },
      { type: "line", from: 0, className: "mbox-hatena-quote", attributes: { style: DEPTH1_STYLE } },
      { type: "replace", from: 0, to: 2 },
      { type: "line", from: 3, className: "mbox-hatena-quote", attributes: { style: DEPTH1_STYLE } },
      { type: "line", from: 5, className: "mbox-hatena-quote", attributes: { style: DEPTH1_STYLE } },
      { type: "replace", from: 5, to: 7 },
    ]);
  });

  it("carries increasing depth through nested blockquotes", () => {
    const depths = specsFor(">>\nouter\n>>\ninner\n<<\n<<")
      .filter((spec) => spec.type === "line")
      .map((spec) => (spec as { attributes?: Record<string, string> }).attributes?.style);
    expect(depths).toEqual([DEPTH1_STYLE, DEPTH1_STYLE, DEPTH2_STYLE, DEPTH2_STYLE, DEPTH2_STYLE, DEPTH1_STYLE]);
  });

  it("uses one repeating gradient plus the tint for every rendered depth", () => {
    const styles = specsFor(">>\n>>")
      .filter((spec) => spec.type === "line")
      .map((spec) => (spec as { attributes?: Record<string, string> }).attributes?.style ?? "");

    expect(styles).toHaveLength(2);
    for (const style of styles) {
      expect(style.match(/gradient\(/g)).toHaveLength(1);
      expect(style).toMatch(/,rgba\(148, 163, 184, 0\.06\);$/);
    }
  });

  it("clamps the rendered quote depth at 16", () => {
    const styles = specsFor(Array.from({ length: 17 }, () => ">>").join("\n"))
      .filter((spec) => spec.type === "line")
      .map((spec) => (spec as { attributes?: Record<string, string> }).attributes?.style);

    expect(styles[14]).toContain("calc(15 * 0.9em)");
    expect(styles[15]).toContain("calc(16 * 0.9em)");
    expect(styles[16]).toBe(styles[15]);
  });

  it("keeps deeply nested quote styles within a constant size bound", () => {
    const styles = specsFor(Array.from({ length: 300 }, () => ">>").join("\n"))
      .filter((spec) => spec.type === "line")
      .map((spec) => (spec as { attributes?: Record<string, string> }).attributes?.style ?? "");

    expect(Math.max(...styles.map((style) => style.length))).toBeLessThanOrEqual(200);
    expect(styles.at(-1)).toBe(styles[15]);
  });

  it("keeps parser quote roles and depths beyond the rendering clamp", () => {
    const doc = parseHatenaDocument([...Array(17).fill(">>"), ...Array(17).fill("<<")].join("\n"));

    expect(doc.lines.map((line) => line.quote?.role)).toEqual([...Array(17).fill("open"), ...Array(17).fill("close")]);
    expect(doc.lines.map((line) => line.quote?.depth)).toEqual([
      ...Array.from({ length: 17 }, (_, index) => index + 1),
      ...Array.from({ length: 17 }, (_, index) => 17 - index),
    ]);
  });

  it("reveals the marker on an active marker line", () => {
    expect(specsFor(">>\nq\n<<", [1])).toMatchObject([
      { type: "lineRange", from: 0, to: 7 },
      { type: "line", from: 0 },
      { type: "line", from: 3 },
      { type: "line", from: 5 },
      { type: "replace", from: 5, to: 7 },
    ]);
  });

  it("replaces a `>URL>` cite opener with a cite-label widget when inactive", () => {
    const specs = specsFor(">http://example.com/>\nq\n<<");
    const openerReplace = specs.find((spec) => spec.type === "replace" && spec.from === 0) as unknown as {
      widget?: HatenaQuoteCiteWidget;
    };
    expect(openerReplace.widget).toBeInstanceOf(HatenaQuoteCiteWidget);
    expect(openerReplace.widget?.url).toBe("http://example.com/");
  });

  it("creates no specs outside a blockquote", () => {
    expect(specsFor("plain")).toEqual([]);
  });
});
