import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { createTestContext } from "../../editor/test-context.js";
import {
  scrapboxDocumentHasInlineCode,
  scrapboxInlineCodeHighlightPlugin,
} from "./inline-code-highlight.js";
import { parseScrapboxDocument } from "./parser.js";

describe("scrapboxDocumentHasInlineCode", () => {
  it("is false for a document with no inline code", () => {
    expect(scrapboxDocumentHasInlineCode(parseScrapboxDocument("just plain text"))).toBe(false);
  });

  it("is true once an inline code span appears outside a block", () => {
    expect(scrapboxDocumentHasInlineCode(parseScrapboxDocument("a `code` b"))).toBe(true);
  });

  it("ignores backtick-like text inside a code block", () => {
    // The parser doesn't even produce a `code` inline node for a code
    // block's own lines, but this guards the intent regardless.
    expect(scrapboxDocumentHasInlineCode(parseScrapboxDocument("code:x\n `not inline code`"))).toBe(false);
  });
});

describe("scrapboxInlineCodeHighlightPlugin", () => {
  it("produces no specs before Ruby has finished loading", () => {
    const specs = scrapboxInlineCodeHighlightPlugin().decorations!(
      createTestContext("`describe User do`", { activeLines: new Set() }),
    );
    expect(specs).toEqual([]);
  });

  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "`x`",
      extensions: [createMboxExtension({ plugins: [scrapboxInlineCodeHighlightPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(
      provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<
        typeof provider
      >[0]),
    ).toEqual([]);
  });
});
