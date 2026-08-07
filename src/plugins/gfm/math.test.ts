import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { GfmMathWidget, gfmMathPlugin } from "./math.js";
import {
  collectRawHtmlElementRanges,
  intersectsProtected,
  lineAtOffset,
  isGfmMathFence,
  parseGfmDocument,
  type ProtectedRange,
} from "./parser.js";
import { gfmInlineCodePlugin, gfmInlineCodePluginExcludingMath } from "./inline-code.js";
import { gfmPlugins } from "./index.js";

function specsFor(input: string) {
  return gfmMathPlugin({
    render: (expression) => {
      const element = document.createElement("span");
      element.textContent = expression;
      return element;
    },
  }).decorations!(createTestContext(input));
}

const PERFORMANCE_SAMPLES = 5;

function doubledSizeRatio(run: (count: number) => void, count: number): { smaller: number; larger: number; ratio: number } {
  // Warm both measured sizes so JIT compilation does not skew either side of
  // a sample pair.
  run(count);
  run(count * 2);
  // Alternate the order to distribute time-direction effects between sizes,
  // then use the paired-ratio median rather than its most favorable sample.
  const samples = Array.from({ length: PERFORMANCE_SAMPLES }, (_, sample) => {
    const sizes = sample % 2 === 0 ? [count, count * 2] : [count * 2, count];
    const durations = new Map<number, number>();
    for (const size of sizes) {
      const started = performance.now();
      run(size);
      durations.set(size, performance.now() - started);
    }
    const smaller = durations.get(count)!;
    const larger = durations.get(count * 2)!;
    return { smaller, larger, ratio: larger / Math.max(smaller, 0.01) };
  }).sort((left, right) => left.ratio - right.ratio);
  return samples[Math.floor(samples.length / 2)]!;
}

describe("gfmMathPlugin", () => {
  it("checks protected-range intersections without a candidate × range scan", () => {
    const result = doubledSizeRatio((count) => {
      const ranges: ProtectedRange[] = Array.from({ length: count }, (_, index) => ({ from: index * 3, to: index * 3 + 1 }));
      let intersections = 0;
      for (let index = 0; index < count; index += 1) {
        if (intersectsProtected(ranges, count * 3 + index, count * 3 + index + 1)) intersections += 1;
      }
      expect(intersections).toBe(0);
    }, 40_000);

    // The ratio is the regression guard. This post-completion cap records an
    // abnormally slow completed measurement; it cannot interrupt synchronous
    // work that is still running.
    expect(result.ratio).toBeLessThan(3);
    expect(result.larger).toBeLessThan(1_000);
  }, 15_000);

  it("finds line offsets without rescanning from the document start", () => {
    const result = doubledSizeRatio((count) => {
      const lineStarts = Array.from({ length: count }, (_, index) => index * 2);
      let lineTotal = 0;
      for (let index = 0; index < count; index += 1) {
        lineTotal += lineAtOffset(lineStarts, index * 2);
      }
      expect(lineTotal).toBe(count * (count + 1) / 2);
    }, 20_000);

    expect(result.ratio).toBeLessThan(3);
    expect(result.larger).toBeLessThan(1_000);
  }, 15_000);

  it("collects crossed raw-HTML ranges without splice removal", () => {
    const inputFor = (count: number) =>
      `${Array.from({ length: count }, (_, index) => `<x${index}>`).join("")}${Array.from({ length: count }, (_, index) => `</x${index}>`).join("")}`;
    // 16k → 32k makes the splice-removal mutation take tens of milliseconds,
    // so the quadratic regression is robust against timer noise while the
    // linear implementation remains comfortably below the coarse time cap.
    // Input construction is deliberately outside the timed region: this test
    // measures range collection, not Array#from or string concatenation.
    const inputs = new Map([100, 16_000, 32_000].map((count) => [count, inputFor(count)]));
    const result = doubledSizeRatio((count) => {
      expect(collectRawHtmlElementRanges(inputs.get(count)!)).toHaveLength(count);
    }, 16_000);

    expect(result.ratio).toBeLessThan(3);
    expect(result.larger).toBeLessThan(1_000);
  }, 15_000);

  it("derives entity-decoded GFM info-string spans in linear time", () => {
    // 6k → 12k keeps the normal parse comfortably measurable while a rejected
    // prefix-redecode span search completes as a clean ratio failure instead
    // of hanging the synchronous Vitest worker. Input construction stays out
    // of the timed region; this measures the parser's info-string walk.
    const inputs = new Map([6_000, 12_000].map((count) => {
      const infoValue = "&#116;".repeat(count);
      return [count, `\`\`\`${infoValue}\nx\n\`\`\``];
    }));
    const result = doubledSizeRatio((count) => {
      const block = parseGfmDocument(inputs.get(count)!).codeBlocks[0]!;
      expect(block.language).toMatchObject({ id: expect.any(String), span: { from: 3, to: count * 6 + 3 } });
      expect(block.language?.id).toHaveLength(count);
    }, 6_000);

    expect(result.ratio).toBeLessThan(3);
    expect(result.larger).toBeLessThan(5_000);
  }, 15_000);

  it("recognizes bare single-dollar inline math", () => {
    const input = "before $x^2$ after";
    const [spec] = specsFor(input);

    expect(parseGfmDocument(input).inlineMath).toContainEqual(expect.objectContaining({
      from: 7,
      to: 12,
      expression: "x^2",
      delimiter: "dollar",
      display: "inline",
    }));
    expect(spec).toMatchObject({ type: "replace", from: 7, to: 12 });
  });

  it("promotes a dollar-wrapped code span to inline math", () => {
    const [spec] = specsFor("$`x^2`$");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 7 });
    expect((spec as { widget: unknown }).widget).toBeInstanceOf(GfmMathWidget);
  });

  it("records the exact code span promoted by backtick-form math", () => {
    expect(parseGfmDocument("$`x^2`$").inlineMath).toContainEqual(expect.objectContaining({
      delimiter: "backtick",
      sourceCodeSpan: { from: 1, to: 6 },
    }));
  });

  it("keeps padded backtick math on mdast's normalized value instead of stripping it again", () => {
    expect(parseGfmDocument("$` x^2 `$").inlineMath).toContainEqual(expect.objectContaining({
      expression: "x^2",
      sourceCodeSpan: { from: 1, to: 8 },
    }));
  });

  it("does not give dollar-form math a source code span", () => {
    expect(parseGfmDocument("$x^2$").inlineMath[0]).toMatchObject({ delimiter: "dollar" });
    expect(parseGfmDocument("$x^2$").inlineMath[0]?.sourceCodeSpan).toBeUndefined();
  });

  it("keeps source code spans distinct for adjacent and repeated math on one line", () => {
    expect(parseGfmDocument("$`a`$$`b`$ $`c`$").inlineMath.map((math) => math.sourceCodeSpan)).toEqual([
      { from: 1, to: 4 },
      { from: 6, to: 9 },
      { from: 12, to: 15 },
    ]);
  });

  it.each([
    ["closing dollar only", "`x`$"],
    ["ordinary code", "`x^2`"],
    ["opening dollar only", "$`x`"],
    ["escaped opening dollar", "\\$`x`$"],
    ["space beside a delimiter", "$ `x` $"],
  ])("leaves %s as inline code", (_description, input) => {
    expect(specsFor(input)).toEqual([]);
  });

  it.each([
    ["closing dollar only", "`x`$"],
    ["escaped opening dollar", "\\$`x`$"],
  ])("does not exclude %s from the inline-code plugin", (_description, input) => {
    const context = createTestContext(input);
    expect(gfmInlineCodePluginExcludingMath().decorations!(context)).toHaveLength(3);
  });

  it("recognizes a multi-backtick math code span", () => {
    const [spec] = specsFor("$``x`y``$");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 9 });
    expect((spec as { widget: unknown }).widget).toBeInstanceOf(GfmMathWidget);
  });

  it("recognizes bare double-dollar display math, including multiple lines", () => {
    const input = "$$\nx^2\n$$";
    const document = parseGfmDocument(input);

    expect(document.inlineMath).toContainEqual(expect.objectContaining({
      from: 0, to: input.length, expression: "x^2", delimiter: "dollar", display: "block", startLine: 1, endLine: 3,
    }));
    expect(specsFor(input).filter((spec) => spec.type === "replace")).toHaveLength(3);
  });

  it.each([
    ["single-line", "$$x^2$$", "x^2"],
    ["multiple interior lines", "$$\n\\frac{a}{b}\n\\sum\n$$", "\\frac{a}{b}\n\\sum"],
    ["blank boundary lines", "$$\n\nx\n\n$$", "\nx\n"],
    ["only a boundary newline", "$$\n$$", ""],
  ])("removes one delimiter-adjacent newline from double-dollar %s", (_description, input, expression) => {
    expect(parseGfmDocument(input).inlineMath[0]?.expression).toBe(expression);
  });

  it("uses the same expression for a double-dollar block and a math fence", () => {
    const dollarExpression = parseGfmDocument("$$\nx^2\n$$").inlineMath[0]?.expression;
    const fenceExpression = parseGfmDocument("```math\nx^2\n```").codeBlocks[0]?.value;

    expect(dollarExpression).toBe(fenceExpression);
  });

  it("matches GitHub by recognizing display math in a blockquote but not a list item", () => {
    const quote = parseGfmDocument("> $$\n> x^2\n> $$");
    const list = parseGfmDocument("- $$\n  x^2\n  $$");

    expect(quote.inlineMath).toContainEqual(expect.objectContaining({ delimiter: "dollar", display: "block", inTableCell: false }));
    expect(list.inlineMath).toEqual([]);
  });

  it.each(["\\$x$", "$5 and $10", "$ x $", "foo$x$bar", "$x$y"])("leaves ambiguous or escaped dollars literal: %s", (input) => {
    expect(parseGfmDocument(input).inlineMath).toEqual([]);
    expect(specsFor(input)).toEqual([]);
  });

  it("matches GitHub's emphasis collision by leaving a paired emphasis run literal", () => {
    expect(parseGfmDocument("$a*b*c$").inlineMath).toEqual([]);
  });

  it.each(["`$x$`", "```text\n$x$\n```"])("does not scan dollars in protected code: %s", (input) => {
    expect(parseGfmDocument(input).inlineMath).toEqual([]);
  });

  it.each([
    ["footnote definition body", "[^n]: footnote $x$"],
    ["footnote reference and definition markers", "ref[^$x$]\n\n[^$x$]: note"],
    ["link reference destination", "[id]: https://example.test/$x$"],
    ["raw HTML element", "<span>$x$</span>"],
    ["raw HTML comment", "<!-- $x$ -->"],
  ])("does not scan dollars in protected %s", (_description, input) => {
    expect(parseGfmDocument(input).inlineMath).toEqual([]);
  });

  it("keeps bare dollar math literal inside a footnote definition", () => {
    // The definition remains in the walker's protectedRanges even though its
    // paragraph phrasing is now traversed for ordinary inline decorations.
    expect(parseGfmDocument("[^n]: $x^2$ is literal here").inlineMath).toEqual([]);
  });

  it("promotes backtick math in a paragraph but not backtick or bare-dollar math in a footnote definition", () => {
    const input = "Para $`y^2`$ here.[^a]\n\n[^a]: note with $`x^2`$ and $z^2$ inside";

    expect(parseGfmDocument(input).inlineMath).toEqual([
      expect.objectContaining({ expression: "y^2", delimiter: "backtick" }),
    ]);
  });

  it("does not overlap bare math with links, images, escapes, or 7A math", () => {
    const input = "[ $x$ ](u) ![$y$](i) \\$z$ $`a`$ $b$";
    const document = parseGfmDocument(input);

    expect(document.inlineMath).toEqual([
      expect.objectContaining({ from: input.indexOf("$`a`$"), delimiter: "backtick" }),
      expect.objectContaining({ from: input.lastIndexOf("$b$"), delimiter: "dollar" }),
    ]);
  });

  it.each([
    ["on its own", "$`a\nb`$"],
    ["with surrounding text", "before $`a\nb`$ after"],
  ])("keeps a multiline dollar-wrapped code span as inline code %s", (_description, input) => {
    const context = createTestContext(input);

    expect(parseGfmDocument(input).inlineMath).toEqual([]);
    expect(specsFor(input)).toEqual([]);
    expect(gfmInlineCodePluginExcludingMath().decorations!(context)).toHaveLength(3);
  });

  it("excludes recognized math spans from the independently-switched inline-code plugin", () => {
    const context = createTestContext("$`x^2`$");
    const specs = gfmInlineCodePluginExcludingMath().decorations!(context);
    validateDecorationSpecs(context, specs);

    expect(specs).toEqual([]);
    expect(gfmInlineCodePlugin().decorations!(context)).toHaveLength(3);
  });

  it("has the bundle exclude recognized math from its inline-code plugin", () => {
    const context = createTestContext("$`x^2`$");
    const inlineCode = gfmPlugins({ math: { render: () => document.createElement("span") } }).find(
      (plugin) => plugin.name === "gfm/inline-code",
    );

    expect(inlineCode?.decorations!(context)).toEqual([]);
  });

  it("keeps raw source while the math span is active", () => {
    expect(gfmMathPlugin({ render: () => document.createElement("span") })
      .decorations!(createTestContext("$`x^2`$", { activeLines: [1] }))).toEqual([]);
  });

  it("records table math with the widget's exact display value", () => {
    const document = parseGfmDocument("| $`x^2`$ | b |\n| --- | --- |");

    expect(document.inlineMath).toEqual([
      {
        from: 2, to: 9, expression: "x^2", delimiter: "backtick", display: "inline",
        sourceCodeSpan: { from: 3, to: 8 }, startLine: 1, endLine: 1, inTableCell: true,
      },
    ]);
    expect(document.tables[0].header.cells[0].displayValue).toBe("x^2");
  });

  it.each([
    ["one surrounding space", "$` x^2 `$", "x^2"],
    ["two surrounding spaces", "$`  x  `$", " x "],
    ["all spaces", "$`   `$", "   "],
  ])("normalizes %s through mdast's code-span value", (_description, input, expression) => {
    expect(parseGfmDocument(input).inlineMath[0]?.expression).toBe(expression);
  });

  it("uses normalized math text for table displayValue and width", () => {
    const document = parseGfmDocument("| $`  x  `$ | b |\n| --- | --- |");

    expect(document.inlineMath[0]?.expression).toBe(" x ");
    expect(document.tables[0].header.cells[0].displayValue).toBe(" x ");
    expect(document.tables[0].header.cells[0].displayValue).toHaveLength(3);
  });

  it.each([
    ["two equal bare expressions", "| $x$ $x$ | b |", "x x"],
    ["three equal bare expressions", "| $x$ $x$ $x$ | b |", "x x x"],
    ["adjacent equal bare expressions", "| $x$$x$ | b |", "xx"],
    ["two equal 7A expressions", "| $`x`$ $`x`$ | b |", "x x"],
    ["mixed 7A and 7B equal expressions", "| $x$ $`x`$ $x$ | b |", "x x x"],
    ["different expressions", "| $x$ $y$ | b |", "x y"],
  ])("projects %s by source range rather than string occurrence", (_description, input, displayValue) => {
    const document = parseGfmDocument(`${input}\n| --- | --- |`);

    expect(document.tables[0].header.cells[0].displayValue).toBe(displayValue);
  });

  it("projects bare inline math in a table from the shared math range", () => {
    const document = parseGfmDocument("| $x^2$ | b |\n| --- | --- |");

    expect(document.inlineMath[0]).toMatchObject({ delimiter: "dollar", inTableCell: true });
    expect(document.tables[0].header.cells[0].displayValue).toBe("x^2");
  });

  it("uses a double-dollar expression as the table cell displayValue", () => {
    const document = parseGfmDocument("| $$x^2$$ | b |\n| --- | --- |");
    const expression = document.inlineMath[0]?.expression;

    expect(expression).toBe("x^2");
    expect(document.tables[0].header.cells[0].displayValue).toBe(expression);
  });

  it("uses the math range rather than an identical escaped dollar literal in a table", () => {
    const document = parseGfmDocument("| \\$x$ $x$ | b |\n| --- | --- |");

    expect(document.tables[0].header.cells[0].displayValue).toBe("$x$ x");
  });

  it("recognizes only a math fence", () => {
    const [spec] = specsFor("```math\nx^2\n```");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 7 });
    expect((spec as { widget: unknown }).widget).toBeInstanceOf(GfmMathWidget);
    expect(specsFor("```typescript\nx^2\n```")).toEqual([]);
  });

  it("recognizes a lowercase math first info token and permits metadata", () => {
    for (const info of ["math   ", "math foo", "math foo bar", "  math  "]) {
      expect(specsFor(`\`\`\`${info}\nx\n\`\`\``).some((spec) => spec.type === "replace" && "widget" in spec)).toBe(true);
    }
  });

  it("recognizes math after an entity-decoded line-feed separator", () => {
    const [spec] = specsFor("```&#10;math\nx^2\n```");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 12 });
    expect((spec as { widget: unknown }).widget).toBeInstanceOf(GfmMathWidget);
  });

  it("renders a blockquoted math fence as math", () => {
    const [spec] = specsFor("> ```math\n> x^2\n> ```");

    expect(spec).toMatchObject({ type: "replace", from: 2, to: 9 });
    expect((spec as { widget: unknown }).widget).toBeInstanceOf(GfmMathWidget);
  });

  it("requires an exact, lowercase math first info token", () => {
    for (const info of ["mathematics", "MATH", "Math"]) {
      expect(specsFor(`\`\`\`${info}\nx\n\`\`\``)).toEqual([]);
    }
  });

  it("does not treat vertical tab or form feed as math-info whitespace", () => {
    // CommonMark trims and separates an info string with spaces and tabs only;
    // unlike JavaScript's \s, that excludes vertical tab and form feed.
    for (const info of ["\vmath foo", "\fmath"]) {
      const [block] = parseGfmDocument(`\`\`\`${info}\nx\n\`\`\``).codeBlocks;

      expect(isGfmMathFence(block)).toBe(false);
      expect(specsFor(`\`\`\`${info}\nx\n\`\`\``)).toEqual([]);
    }
  });

  it("does not match math as an info-token prefix", () => {
    const [block] = parseGfmDocument("```mathematics\nx\n```").codeBlocks;

    expect(isGfmMathFence(block)).toBe(false);
  });

  it("reveals the raw fence and source when any line in the fence is active", () => {
    const input = "```math\nx^2\n```";
    const specs = gfmMathPlugin({ render: () => document.createElement("span") })
      .decorations!(createTestContext(input, { activeLines: [2] }));

    expect(specs).toEqual([]);
  });
});

// Which emphasis lets a `$…$` run stay math.
//
// The rule is structural, and was measured against GitHub's public Markdown
// API over more than thirty inputs: an `<em>` anywhere in the ancestry stops
// the math; `<strong>` and `<del>` do not, at any depth. See the comment at
// the call site in parser.ts, and the oracle fixture for the recorded
// responses these mirror.
describe("dollar math inside emphasis", () => {
  function isMath(doc: string): boolean {
    return parseGfmDocument(doc).inlineMath.some((math) => math.delimiter === "dollar" && math.display === "inline");
  }

  it.each([
    ["**$K$**", "strong, asterisks"],
    ["__$K$__", "strong, underscores"],
    ["~~$K$~~", "strikethrough"],
    ["****$K$****", "strong inside strong"],
    ["~~**$K$**~~", "strong inside strikethrough"],
    ["*x* $K$", "an em earlier on the line is a sibling, not an ancestor"],
    ["*x* and $K$ and *y*", "ems on both sides, still siblings"],
    ["$a_b_c$", "an intraword underscore is not emphasis at all"],
  ])("keeps %s as math (%s)", (doc) => {
    expect(isMath(doc)).toBe(true);
  });

  it.each([
    ["*$K$*", "em, asterisks"],
    ["_$K$_", "em, underscores"],
    ["***$K$***", "em wrapping strong"],
    ["*a **$K$** b*", "the em is outside the strong"],
    ["**a *$M$* b**", "the em is inside the strong"],
    ["$a*b*c$", "the style is inside the run, not around it"],
    ["$a**b**c$", "same, with strong"],
    ["$a~~b~~c$", "same, with strikethrough"],
    ["**a$K$a**", "alphanumerics either side -- a different rule"],
    ["**`$K$`**", "code"],
  ])("leaves %s as plain text (%s)", (doc) => {
    expect(isMath(doc)).toBe(false);
  });

  it("does not let a style that merely crosses the run through", () => {
    // The strong starts inside the math and ends after it, so it contains
    // neither and is contained by neither.
    expect(isMath("$a **b$ c**")).toBe(false);
  });

  it.each(["*$$K$$*", "**$$K$$**", "a *$$K$$* b"])("leaves the `$$` form out of this rule: %s", (doc) => {
    // The rule above applies to `$…$` only. `$$` combined with emphasis is
    // deliberately not matched to GitHub, which is not self-consistent there:
    // `*$$K$$*` emits a symbol the input does not carry, `a *$$K$$* b` drops
    // the math and keeps the emphasis, and `**$$K$$**` loses the emphasis.
    // mbox keeps the math in all three. This is the implementer's call, not the
    // owner's, and it is listed in the namespace's own divergences.
    expect(parseGfmDocument(doc).inlineMath).toHaveLength(1);
  });
});
