import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  inlineCodeClassName,
  inlineCodeClassNames,
  inlineCodePlugin,
} from "./inline-code.js";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";

function inlineCodeSpecs(doc: string, activeLines: Iterable<number> = []) {
  const context = createTestContext(doc, { activeLines });
  const specs = inlineCodePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("createInlineCodeSpecs", () => {
  it("creates content mark and marker replace specs outside active raw syntax lines", () => {
    const input = "Use `code` here";

    expect(inlineCodeSpecs(input, [])).toEqual([
      { type: "mark", from:5, to: 9, className: inlineCodeClassName, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 5 },
      { type: "replace", from: 9, to: 10 },
    ]);
  });

  it("does not create specs on active raw syntax lines", () => {
    const input = "Use `code` here";

    expect(inlineCodeSpecs(input, [1])).toEqual([]);
  });

  it("does not create specs for inline code inside fenced code blocks", () => {
    const input = "```\n`code`\n```\n`ok`";

    expect(inlineCodeSpecs(input, [])).toEqual([
      { type: "mark", from:16, to: 18, className: inlineCodeClassName, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 15, to: 16 },
      { type: "replace", from: 18, to: 19 },
    ]);
  });
});

describe("inlineCodePlugin", () => {
  it("provides inline code decorations from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "Use `code` here",
      extensions: [
        createMboxExtension({
          plugins: [inlineCodePlugin()],
        }),
      ],
    });
    const providers = state.facet(mboxDecorationProviders);

    expect(providers.flatMap(({ provider }) => provider(createTestContext("Use `code` here")))).toEqual([
      { type: "mark", from:5, to: 9, className: inlineCodeClassName, inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 4, to: 5 },
      { type: "replace", from: 9, to: 10 },
    ]);
  });
});
