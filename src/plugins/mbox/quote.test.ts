import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  quoteClassNames,
  quotePlugin,
} from "./quote.js";

import { createTestContext } from "../../editor/test-context.js";

const quoteDecorations = (doc: string, activeLines: Iterable<number> = []) =>
  quotePlugin().decorations!(createTestContext(doc, { activeLines }));
const quoteLineSpecs = (doc: string) =>
  quoteDecorations(doc).filter((spec) => spec.type === "line");
const quoteHideSpecs = (doc: string, activeLines: Iterable<number>) =>
  quoteDecorations(doc, activeLines).filter((spec) => spec.type === "replace");

describe("createQuoteSyntaxHideSpecs", () => {
  it("creates hide specs for quote syntax outside active raw syntax lines", () => {
    const input = "> quote\n> active";
    const activeLines = new Set([2]);

    expect(quoteHideSpecs(input, activeLines)).toEqual([
      { type: "replace", from: 0, to: 2 },
    ]);
  });

  it("does not create hide specs for quotes on active raw syntax lines", () => {
    const input = "> quote";
    const activeLines = new Set([1]);

    expect(quoteHideSpecs(input, activeLines)).toEqual([]);
  });
});

describe("createQuoteLineSpecs", () => {
  it("creates quote line specs with public quote class names", () => {
    expect(quoteLineSpecs("> quote")).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: `mbox-quote-line ${quoteClassNames.quote}`,
      },
    ]);
  });
});

describe("quotePlugin", () => {
  it("provides quote decorations from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "> quote\nplain",
      selection: EditorSelection.cursor(9),
      extensions: [
        createMboxExtension({
          plugins: [quotePlugin()],
        }),
      ],
    });
    const providers = state.facet(mboxDecorationProviders);

    expect(providers.flatMap(({ provider }) => provider(createTestContext("> quote\nplain", { selection: 9 })))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "line", from: 0, className: `mbox-quote-line ${quoteClassNames.quote}` }),
        expect.objectContaining({ type: "replace", from: 0, to: 2 }),
      ]),
    );
  });
});
