import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { emojiPlugin } from "./emoji.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const emojiSpecs = (doc: string, activeLines: Iterable<number> = []) =>
  emojiPlugin().decorations!(createTestContext(doc, { activeLines }));

describe("createEmojiSpecs", () => {
  it("creates replace specs for emoji nodes outside active raw syntax lines", () => {
    const input = ":smile:";

    const [spec] = emojiSpecs(input, [2]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 0,
      to: 7,
    });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeDefined();
  });

  it("does not create replace specs for emoji nodes on active raw syntax lines", () => {
    const input = ":smile:";

    expect(emojiSpecs(input, [1])).toEqual([]);
  });

  it("creates replace specs only for emoji nodes outside selected lines", () => {
    const input = ":one:\n:two:";

    const [spec] = emojiSpecs(input, [1]);

    expect(spec).toMatchObject({
      type: "replace",
      from: 6,
      to: 11,
    });
  });

  it("does not create replace specs for emoji syntax inside fenced code blocks", () => {
    const input = "```\n:smile:\n```\n:ok:";

    expect(emojiSpecs(input, [])).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 16,
        to: 20,
      }),
    ]);
  });
});

describe("emojiPlugin", () => {
  it("provides emoji specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: ":smile:\n:focused:",
      selection: EditorSelection.cursor(9),
      extensions: [
        createMboxExtension({
          plugins: [emojiPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext(":smile:\n:focused:", { selection: 9 }))).toEqual([
      expect.objectContaining({
        type: "replace",
        from: 0,
        to: 7,
      }),
    ]);
  });
});
