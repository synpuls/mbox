import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { MboxIconWidget, pageLinkClassName, pageLinkPlugin } from "./page-link.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";
import type { PageLinkPluginOptions } from "./page-link.js";

const pageLinkSpecs = (doc: string, activeLines: Iterable<number> = [], options: PageLinkPluginOptions = {}) =>
  pageLinkPlugin(options).decorations!(createTestContext(doc, { activeLines }));

describe("createPageLinkSpecs", () => {
  it("creates replace specs for wiki link nodes outside active raw syntax lines", () => {
    const input = "[Page]";

    const [spec] = pageLinkSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 6,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeDefined();
  });

  it("marks the whole wiki link on active raw syntax lines without replacing it", () => {
    const input = "[Page]";

    expect(pageLinkSpecs(input, [1])).toEqual([
      {
        type: "mark",
        from: 0,
        to: 6,
        className: pageLinkClassName,
      },
    ]);
  });

  it("marks selected wiki links and replaces only wiki links outside selected lines", () => {
    const input = "[One]\n[Two]";

    expect(pageLinkSpecs(input, [1])).toEqual([
      {
        type: "mark",
        from: 0,
        to: 5,
        className: pageLinkClassName,
      },
      expect.objectContaining({
        type: "replace",
        from: 6,
        to: 11,
      }),
    ]);
  });

  it("does not create replace specs for bracket syntax inside fenced code blocks", () => {
    const input = "```\nextensions: [basicSetup, markdown()]\n```\n[Page]";

    expect(pageLinkSpecs(input, [])).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 45,
        to: 51,
      }),
    ]);
  });

  it("creates replace specs for icon nodes outside active raw syntax lines", () => {
    const input = "[name.icon]";

    const [spec] = pageLinkSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 11,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(MboxIconWidget);
  });

  it("intentionally leaves icon nodes undecorated on active raw syntax lines", () => {
    const input = "[name.icon]";

    expect(pageLinkSpecs(input, [1])).toEqual([]);
  });

  it("skips icon specs when icons are disabled without affecting wiki links", () => {
    const specs = pageLinkSpecs("[Page] [name.icon]", [3], { icons: false });

    expect(specs).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 6,
      }),
    ]);
  });

  it("creates specs for wiki links and icons in the same document", () => {
    const specs = pageLinkSpecs("[Page] [name.icon]", [3]);

    expect(specs).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 6,
      }),
      expect.objectContaining({
        type: "replace",
        from: 7,
        to: 18,
      }),
    ]);
    expect((specs[0] as MboxReplaceDecorationSpec).widget).toBeDefined();
    expect((specs[1] as MboxReplaceDecorationSpec).widget).toBeInstanceOf(MboxIconWidget);
  });
});

describe("pageLinkPlugin", () => {
  it("provides page link specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "[Page]\n[Focused]",
      selection: EditorSelection.cursor(8),
      extensions: [
        createMboxExtension({
          plugins: [pageLinkPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("[Page]\n[Focused]", { selection: 8 }))).toEqual([
      {
        type: "mark",
        from: 7,
        to: 16,
        className: pageLinkClassName,
      },
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 6,
      }),
    ]);
  });
});
