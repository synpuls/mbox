import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  scrapboxQuoteLineClassName,
  scrapboxQuoteMarkerHiddenClassName,
  scrapboxQuotePlugin,
} from "./quote.js";
import { createTestContext } from "../../editor/test-context.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxQuotePlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxQuoteSpecs", () => {
  it("marks a quote line and hides its marker with visibility, keeping its layout width", () => {
    expect(specsFor(">quoted")).toEqual([
      {
        type: "line",
        from: 0,
        className: scrapboxQuoteLineClassName,
        attributes: { "data-mbox-scrapbox-indent": "0" },
      },
      { type: "mark", from: 0, to: 1, className: scrapboxQuoteMarkerHiddenClassName },
    ]);
  });

  it("resolves the marker offset for an indented quote", () => {
    expect(specsFor("  >deep")).toMatchObject([
      { type: "line", from: 0, attributes: { "data-mbox-scrapbox-indent": "2" } },
      { type: "mark", from: 2, to: 3, className: scrapboxQuoteMarkerHiddenClassName },
    ]);
  });

  it("creates no specs for non-quote lines", () => {
    expect(specsFor("plain")).toEqual([]);
    expect(specsFor("1. item")).toEqual([]);
  });

  it("does not treat a `>`-leading code block line as a quote, even when active", () => {
    // Regression: quote used to rely on scrapboxSkippedLineNumbers (blocks +
    // active lines combined) to stay out of code blocks; switching to
    // scrapboxBlockLineNumbers alone (so quote can style active lines) must
    // still keep code/table block lines fully out of scope.
    const doc = "code:x\n >inside a code block";
    expect(specsFor(doc)).toEqual([]);
    expect(specsFor(doc, [2])).toEqual([]);
  });

  it("reveals the raw marker on an active line but keeps the quote-line style", () => {
    const specs = specsFor(">one\n>two", [1]);

    // Line 1 (">one") is active: no marker-hiding mark at all -- the `>` is
    // plain, literal text -- but the line class (border/color styling)
    // still applies, since real Scrapbox keeps a quote's left border and
    // color while its line is focused.
    expect(specs).toContainEqual({
      type: "line",
      from: 0,
      className: scrapboxQuoteLineClassName,
      attributes: { "data-mbox-scrapbox-indent": "0" },
    });
    expect(specs.some((spec) => spec.type === "mark" && spec.from === 0)).toBe(false);
    // Line 2 (">two") is inactive: both the line class and the hidden marker.
    expect(specs).toContainEqual({
      type: "line",
      from: 5,
      className: scrapboxQuoteLineClassName,
      attributes: { "data-mbox-scrapbox-indent": "0" },
    });
    expect(specs).toContainEqual({ type: "mark", from: 5, to: 6, className: scrapboxQuoteMarkerHiddenClassName });
  });
});

describe("scrapboxQuotePlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: ">quoted",
      extensions: [createMboxExtension({ plugins: [scrapboxQuotePlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0])).toMatchObject([
      { type: "line", className: scrapboxQuoteLineClassName },
      { type: "mark", className: scrapboxQuoteMarkerHiddenClassName },
    ]);
  });
});
