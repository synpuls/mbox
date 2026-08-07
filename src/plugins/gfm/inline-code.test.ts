import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmInlineCodePlugin, gfmInlineCodePluginExcludingMath } from "./inline-code.js";
import * as parserCache from "./parser-cache.js";
import { parseGfmDocument } from "./parser.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmInlineCodePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gfmInlineCodePlugin", () => {
  it("marks the code content and hides its backticks while inactive", () => {
    expect(specsFor("x `a` y")).toEqual([
      { type: "mark", from:3, to: 4, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 2, to: 3 },
      { type: "replace", from: 4, to: 5 },
    ]);
  });

  it("keeps the mark but reveals the backticks on an active line", () => {
    expect(specsFor("x `a` y", [1])).toEqual([{ type: "mark", from:3, to: 4, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("hides single-line padding with its fences while idle, then reveals the raw source when active", () => {
    expect(specsFor("` a `")).toEqual([
      { type: "mark", from: 2, to: 3, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 2 },
      { type: "replace", from: 3, to: 5 },
    ]);
    expect(specsFor("` a `", [1])).toEqual([
      { type: "mark", from: 2, to: 3, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("does not strip an all-space span or create an empty content mark", () => {
    expect(specsFor("`   `")).toEqual([
      { type: "mark", from: 1, to: 4, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 4, to: 5 },
    ]);
  });

  it("hides multi-backtick fences of their true width", () => {
    expect(specsFor("``a`b``")).toEqual([
      { type: "mark", from:2, to: 5, className: "mbox-gfm-code", tagName: "code", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 2 },
      { type: "replace", from: 5, to: 7 },
    ]);
  });

  it("does not exclude a code span for a dollar-form math record without its source range", () => {
    const input = "a$`x`$";
    const context = createTestContext(input);
    const document = parseGfmDocument(input);
    document.inlineMath = [{
      from: 1, to: 6, expression: "x", delimiter: "dollar", display: "inline",
      startLine: 1, endLine: 1, inTableCell: false,
    }];
    vi.spyOn(parserCache, "getGfmDocumentFromState").mockReturnValue(document);

    const specs = gfmInlineCodePluginExcludingMath().decorations!(context);
    validateDecorationSpecs(context, specs);

    expect(specs).toHaveLength(3);
  });
});
