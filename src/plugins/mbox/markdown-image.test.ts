import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { markdownImagePlugin } from "./markdown-image.js";

import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const markdownImageSpecs = (doc: string, activeLines: Iterable<number> = []) =>
  markdownImagePlugin().decorations!(createTestContext(doc, { activeLines }));

describe("createMarkdownImageSpecs", () => {
  it("creates replace specs for Markdown images outside active raw syntax lines", () => {
    const input = "![Alt](image.png)";

    const [spec] = markdownImageSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 17,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeDefined();
  });

  it("does not create replace specs for Markdown images on active raw syntax lines", () => {
    const input = "![Alt](image.png)";

    expect(markdownImageSpecs(input, [1])).toEqual([]);
  });

  it("creates replace specs only for Markdown images outside selected lines", () => {
    const input = "![One](one.png)\n![Two](two.png)";

    const [spec] = markdownImageSpecs(input, [1]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 16,
      to: 31,
    });
  });

  it("does not create replace specs for Markdown images inside fenced code blocks", () => {
    const input = "```\n![Alt](image.png)\n```\n![Logo](logo.png)";

    expect(markdownImageSpecs(input, [])).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 26,
        to: 43,
      }),
    ]);
  });
});

describe("markdownImagePlugin", () => {
  it("provides image specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "![Alt](image.png)\n![Focused](focused.png)",
      selection: EditorSelection.cursor(19),
      extensions: [
        createMboxExtension({
          plugins: [markdownImagePlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("![Alt](image.png)\n![Focused](focused.png)", { selection: 19 }))).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 17,
      }),
    ]);
  });
});
