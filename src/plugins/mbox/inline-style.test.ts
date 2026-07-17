import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  inlineStyleClassNames,
  inlineStylePlugin,
} from "./inline-style.js";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";

function inlineStyleSpecs(doc: string, activeLines: Iterable<number> = []) {
  const context = createTestContext(doc, { activeLines });
  const specs = inlineStylePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("createInlineStyleSpecs", () => {
  it("creates content mark and marker replace specs for emphasis outside active raw syntax lines", () => {
    const input = "Use *em* here";

    expect(inlineStyleSpecs(input, [])).toEqual([
      { type: "mark", from:5, to: 7, className: inlineStyleClassNames.em, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 5 },
      { type: "replace", from: 7, to: 8 },
    ]);
  });

  it("creates content mark and marker replace specs for strong outside active raw syntax lines", () => {
    const input = "Use **strong** here";

    expect(inlineStyleSpecs(input, [])).toEqual([
      { type: "mark", from:6, to: 12, className: inlineStyleClassNames.strong, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 6 },
      { type: "replace", from: 12, to: 14 },
    ]);
  });

  it("creates content mark and marker replace specs for strikethrough outside active raw syntax lines", () => {
    const input = "Use ~~strike~~ here";

    expect(inlineStyleSpecs(input, [])).toEqual([
      { type: "mark", from:6, to: 12, className: inlineStyleClassNames.strike, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 6 },
      { type: "replace", from: 12, to: 14 },
    ]);
  });

  it("does not create specs on active raw syntax lines", () => {
    const input = "Use *em* here";

    expect(inlineStyleSpecs(input, [1])).toEqual([]);
  });

  it("does not create specs for style syntax inside inline code or fenced code blocks", () => {
    const input = "`*em* ~~strike~~`\n```\n**strong**\n~~strike~~\n```\n*ok*";

    expect(inlineStyleSpecs(input, [])).toEqual([
      { type: "mark", from:49, to: 51, className: inlineStyleClassNames.em, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 48, to: 49 },
      { type: "replace", from: 51, to: 52 },
    ]);
  });
});

describe("inlineStylePlugin", () => {
  it("provides inline style decorations from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "*em* **strong** ~~strike~~",
      extensions: [
        createMboxExtension({
          plugins: [inlineStylePlugin()],
        }),
      ],
    });
    const providers = state.facet(mboxDecorationProviders);

    expect(providers.flatMap(({ provider }) => provider(createTestContext("*em* **strong** ~~strike~~")))).toEqual([
      { type: "mark", from:1, to: 3, className: inlineStyleClassNames.em, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 3, to: 4 },
      { type: "mark", from:7, to: 13, className: inlineStyleClassNames.strong, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 5, to: 7 },
      { type: "replace", from: 13, to: 15 },
      { type: "mark", from:18, to: 24, className: inlineStyleClassNames.strike, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 16, to: 18 },
      { type: "replace", from: 24, to: 26 },
    ]);
  });
});
