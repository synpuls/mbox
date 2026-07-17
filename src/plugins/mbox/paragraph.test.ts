import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { paragraphClassNames, paragraphPlugin } from "./paragraph.js";
import { createTestContext } from "../../editor/test-context.js";

const paragraphSpecs = (doc: string) =>
  paragraphPlugin().decorations!(createTestContext(doc));

describe("createParagraphLineSpecs", () => {
  it("creates paragraph line specs for normal paragraph blocks", () => {
    const input = "plain\n# heading";

    expect(paragraphSpecs(input)).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: paragraphClassNames.paragraph,
      },
    ]);
  });

  it("adds an empty line class to empty paragraph blocks", () => {
    const input = "plain\n\nnext";

    expect(paragraphSpecs(input)).toContainEqual({
      type: "line",
      from: 6,
      to: 6,
      className: `${paragraphClassNames.paragraph} ${paragraphClassNames.emptyLine}`,
    });
  });

  it("does not create paragraph specs for structural block types", () => {
    const input = "# h\n- item\n- [ ] task\n> quote\n```\ncode\n```";

    expect(paragraphSpecs(input)).toEqual([]);
  });
});

describe("paragraphPlugin", () => {
  it("provides paragraph decorations from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "plain",
      extensions: [
        createMboxExtension({
          plugins: [paragraphPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("plain", { selection: 0 }))).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: paragraphClassNames.paragraph,
      },
    ]);
  });
});
