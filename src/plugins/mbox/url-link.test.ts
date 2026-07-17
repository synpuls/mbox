import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { urlLinkPlugin } from "./url-link.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const urlLinkSpecs = (doc: string, activeLines: Iterable<number> = []) =>
  urlLinkPlugin().decorations!(createTestContext(doc, { activeLines }));

describe("createURLLinkSpecs", () => {
  it("creates replace specs for Markdown links outside active raw syntax lines", () => {
    const input = "[Label](https://example.com)";

    const [spec] = urlLinkSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 28,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeDefined();
  });

  it("creates replace specs for bare URL autoLink nodes outside active raw syntax lines", () => {
    const input = "https://example.com";

    const [spec] = urlLinkSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 19,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeDefined();
  });

  it("does not create replace specs on active raw syntax lines", () => {
    const input = "[Label](https://example.com)\nhttps://example.com";

    expect(urlLinkSpecs(input, [1, 2])).toEqual([]);
  });

  it("does not create replace specs inside fenced code blocks", () => {
    const input = "```\n[Label](https://example.com)\nhttps://example.com\n```\nhttps://example.org";

    expect(urlLinkSpecs(input, [])).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 57,
        to: 76,
      }),
    ]);
  });

  it("does not create replace specs for unsupported URL schemes", () => {
    const input = "[Bad](javascript:alert(1))";

    expect(urlLinkSpecs(input, [])).toEqual([]);
  });
});

describe("urlLinkPlugin", () => {
  it("provides URL link specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "[Label](https://example.com)\n[Focused](https://example.org)",
      selection: EditorSelection.cursor(30),
      extensions: [
        createMboxExtension({
          plugins: [urlLinkPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("[Label](https://example.com)\n[Focused](https://example.org)", { selection: 30 }))).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 28,
      }),
    ]);
  });
});
