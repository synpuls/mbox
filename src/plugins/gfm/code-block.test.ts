import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { GfmCodeBlockCopyButtonWidget, gfmCodeBlockHighlightPlugin, gfmCodeBlockPlugin } from "./code-block.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return gfmCodeBlockPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("gfmCodeBlockPlugin", () => {
  it("carries a monospace theme by default, overridable through the same shared CSS variable as every other code block", () => {
    expect(gfmCodeBlockPlugin().theme).toMatchObject({
      ".mbox-gfm-code-block": {
        fontFamily: expect.stringMatching(/^var\(--mbox-code-block-font-family, .*monospace\)$/),
      },
    });
  });

  it("draws a lineRange container spanning the whole block", () => {
    const container = specsFor("```js\ncode\n```").find((spec) => spec.type === "lineRange");
    expect(container).toEqual({ type: "lineRange", from: 0, to: 14, className: "mbox-gfm-code-block" });
  });

  it("turns the inactive opening fence into a header line: hidden fence, language label, Copy button", () => {
    const specs = specsFor("```js\ncode\n```");
    const headerLine = specs.find((spec) => spec.type === "line" && spec.className.includes("mbox-gfm-code-opening-fence-line"))! as { className: string };
    expect(headerLine.className).toContain("mbox-gfm-code-header-line");
    expect(specs).toContainEqual({ type: "replace", from: 0, to: 3 });
    expect(specs).toContainEqual({ type: "mark", from: 3, to: 5, className: "mbox-gfm-code-language-label" });
    const copy = specs.find((spec) => spec.type === "widget");
    expect((copy as unknown as { widget: unknown }).widget).toBeInstanceOf(GfmCodeBlockCopyButtonWidget);
  });

  it("tags each interior line with the content-line class and hides the closing fence", () => {
    const specs = specsFor("```js\ncode\n```");
    expect(specs).toContainEqual({ type: "line", from: 6, className: "mbox-gfm-code-content-line" });
    expect(specs).toContainEqual({ type: "replace", from: 11, to: 14 });
  });

  it("reveals the raw opening fence and drops the header dressing on the active line", () => {
    const specs = specsFor("```js\ncode\n```", [1]);
    expect(specs.some((spec) => spec.type === "replace" && spec.from === 0)).toBe(false);
    expect(specs.some((spec) => spec.type === "widget")).toBe(false);
    const headerLine = specs.find((spec) => spec.type === "line" && spec.className.includes("mbox-gfm-code-opening-fence-line"))! as { className: string };
    expect(headerLine.className).not.toContain("mbox-gfm-code-header-line");
  });

  it("treats an indented code block as a bare container with content lines only", () => {
    const specs = specsFor("    indented");
    expect(specs.some((spec) => spec.type === "lineRange")).toBe(true);
    expect(specs.some((spec) => spec.type === "replace")).toBe(false);
  });
});

describe("gfmCodeBlockHighlightPlugin", () => {
  function highlightSpecsFor(input: string) {
    return gfmCodeBlockHighlightPlugin().decorations!(createTestContext(input));
  }

  it("emits token marks offset into the code interior for a JS block", () => {
    const specs = highlightSpecsFor("```js\nconst x = 1;\n```");
    expect(specs.length).toBeGreaterThan(0);
    // Token specs follow the mbox convention of omitting `type` (defaulting to mark).
    expect(specs.every((spec) => spec.type === undefined && spec.className.includes("mbox-gfm-code-token"))).toBe(true);
    // The `const` keyword sits at the very start of the interior (offset 6).
    expect(specs[0]).toMatchObject({ from: 6 });
  });

  it("emits nothing for a language it does not highlight", () => {
    expect(highlightSpecsFor("```text\nhello\n```")).toEqual([]);
  });

  it("highlights a fenced block whose info string is a filename with a supported extension", () => {
    const specs = highlightSpecsFor("```sample.ts\nconst x: number = 1;\n```");
    expect(specs.length).toBeGreaterThan(0);
  });
});
