import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { parseMboxDocument } from "./parser.js";
import {
  codeBlockHighlightClassNames,
  codeBlockHighlightPlugin,
  codeBlockClassNames,
  codeBlockPlugin,
  CodeBlockCopyButtonWidget,
  getCodeBlockLanguageId,
} from "./code-block.js";
import { createTestContext } from "../../editor/test-context.js";

const codeBlockDecorations = (doc: string, activeLines: Iterable<number> = []) =>
  codeBlockPlugin().decorations!(createTestContext(doc, { activeLines }));
const codeBlockSpecs = (doc: string, activeLines: Iterable<number> = []) =>
  codeBlockDecorations(doc, activeLines).filter((spec) => spec.type !== "replace");
const fenceMarkerHideSpecs = (doc: string, activeLines: Iterable<number>) =>
  codeBlockDecorations(doc, activeLines).filter((spec) => spec.type === "replace");
const codeBlockHighlightSpecs = (doc: string) =>
  codeBlockHighlightPlugin().decorations!(createTestContext(doc));

describe("createCodeBlockSpecs", () => {
  it("normalizes the code block info string to a language id", () => {
    expect(getCodeBlockLanguageId(parseMboxDocument("```ts\nconst x = 1\n```").blocks[0])).toBe("ts");
    expect(getCodeBlockLanguageId(parseMboxDocument("```typescript title=\"demo\"\nconst x = 1\n```").blocks[0])).toBe(
      "typescript",
    );
    expect(getCodeBlockLanguageId(parseMboxDocument("```\nconst x = 1\n```").blocks[0])).toBeNull();
    // A lone CR is source text rather than a parser terminator. The kit's
    // boundary contract must still refuse it instead of repairing it here.
    expect(getCodeBlockLanguageId(parseMboxDocument("```ts\r").blocks[0])).toBeNull();
  });

  it("creates line specs for each fenced code block line", () => {
    const input = "```ts\nconst x = 1\n```";

    expect(codeBlockSpecs(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "line",
        from: 0,
        className: `mbox-code-block-line ${codeBlockClassNames.block} ${codeBlockClassNames.fenceLine} ${codeBlockClassNames.openingFenceLine} ${codeBlockClassNames.headerLine}`,
      }),
      expect.objectContaining({
        type: "line",
        from: 6,
        className: `mbox-code-block-line ${codeBlockClassNames.block} ${codeBlockClassNames.contentLine}`,
      }),
      expect.objectContaining({
        type: "line",
        from: 18,
        className: `mbox-code-block-line ${codeBlockClassNames.block} ${codeBlockClassNames.fenceLine} ${codeBlockClassNames.closingFenceLine}`,
      }),
    ]));
  });

  it("creates marker, info, and code text specs for fenced code blocks", () => {
    const specs = codeBlockSpecs("```ts\nconst x = 1\n```");

    expect(specs).toEqual(
      expect.arrayContaining([
        { from: 0, to: 5, className: "mbox-code-opening-fence" },
        { from: 3, to: 5, className: codeBlockClassNames.info },
        { from: 3, to: 5, className: codeBlockClassNames.languageLabel },
        { from: 6, to: 18, className: codeBlockClassNames.text },
        { from: 18, to: 21, className: "mbox-code-closing-fence" },
      ]),
    );
  });

  it("uses only the first info string token as the code block language label", () => {
    const specs = codeBlockSpecs("```typescript title=\"demo\"\nconst x = 1\n```");

    expect(specs).toEqual(
      expect.arrayContaining([
        { from: 3, to: 13, className: codeBlockClassNames.languageLabel },
        { from: 3, to: 26, className: codeBlockClassNames.info },
      ]),
    );
  });

  it("keeps a filename info token as the code block language label", () => {
    const specs = codeBlockSpecs("```sample.ts\nconst x = 1\n```");

    expect(specs).toEqual(
      expect.arrayContaining([
        { from: 3, to: 12, className: codeBlockClassNames.languageLabel },
        { from: 3, to: 12, className: codeBlockClassNames.info },
      ]),
    );
  });

  it("does not add header presentation classes to active raw opening fence lines", () => {
    const specs = codeBlockSpecs("```ts\nconst x = 1\n```", [1]);

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "line",
          from: 0,
          className: `mbox-code-block-line ${codeBlockClassNames.block} ${codeBlockClassNames.fenceLine} ${codeBlockClassNames.openingFenceLine}`,
        }),
        { from: 3, to: 5, className: codeBlockClassNames.info },
      ]),
    );
    expect(specs).not.toEqual(expect.arrayContaining([{ from: 3, to: 5, className: codeBlockClassNames.languageLabel }]));
  });

  it("creates a copy button widget on inactive opening fence lines", () => {
    const specs = codeBlockSpecs("```ts\nconst x = 1\n```", []);

    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "widget",
          from: 5,
          widget: expect.any(CodeBlockCopyButtonWidget),
        }),
      ]),
    );
  });

  it("does not create a copy button widget on active raw opening fence lines", () => {
    const specs = codeBlockSpecs("```ts\nconst x = 1\n```", [1]);

    expect(specs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "widget",
        }),
      ]),
    );
  });

  it("does not create language syntax highlight specs in the core code block plugin", () => {
    const specs = codeBlockSpecs("```ts\nconst x = 1\n```");

    expect(specs.map((spec) => ("className" in spec ? spec.className : ""))).not.toContain("mbox-code-token");
    expect(specs.every((spec) => !("className" in spec) || !spec.className.includes("keyword"))).toBe(true);
  });

  it("creates code text specs for each content line", () => {
    const specs = codeBlockSpecs("```\nfirst\nsecond\n```");

    expect(specs).toEqual(
      expect.arrayContaining([
        { from: 4, to: 10, className: codeBlockClassNames.text },
        { from: 10, to: 17, className: codeBlockClassNames.text },
      ]),
    );
  });
});

describe("createCodeBlockFenceMarkerHideSpecs", () => {
  it("hides opening and closing fence markers outside active raw syntax lines", () => {
    const input = "```ts\nconst x = 1\n```";
    const activeLines = new Set([2]);

    expect(fenceMarkerHideSpecs(input, activeLines)).toEqual([
      { type: "replace", from: 0, to: 3 },
      { type: "replace", from: 18, to: 21 },
    ]);
  });

  it("keeps fence markers raw on active raw syntax lines", () => {
    const input = "```ts\nconst x = 1\n```";
    const activeLines = new Set([1]);

    expect(fenceMarkerHideSpecs(input, activeLines)).toEqual([
      { type: "replace", from: 18, to: 21 },
    ]);
  });
});

describe("codeBlockHighlightPlugin", () => {
  it("creates JavaScript token specs inside a fenced code block when opted in", () => {
    const state = EditorState.create({
      doc: "```ts\nconst x = 1\n```",
      extensions: [
        createMboxExtension({
          plugins: [codeBlockHighlightPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("```ts\nconst x = 1\n```", { selection: 0 }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 6,
          to: 11,
          className: expect.stringContaining(codeBlockHighlightClassNames.token),
        }),
      ]),
    );
  });

  it("creates TypeScript token specs when the info string is a TypeScript filename", () => {
    const state = EditorState.create({
      doc: "```sample.ts\nconst x: number = 1\n```",
      extensions: [
        createMboxExtension({
          plugins: [codeBlockHighlightPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("```sample.ts\nconst x: number = 1\n```", { selection: 0 }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 13,
          to: 18,
          className: expect.stringContaining(codeBlockHighlightClassNames.token),
        }),
      ]),
    );
  });

  it("does not create token specs for code blocks without a supported language id", () => {
    const state = EditorState.create({
      doc: "```\nconst x = 1\n```",
      extensions: [
        createMboxExtension({
          plugins: [codeBlockHighlightPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("```\nconst x = 1\n```", { selection: 0 }))).toEqual([]);
  });
});

describe("codeBlockPlugin", () => {
  it("carries a monospace theme by default, to keep the existing look a bare codeBlockPlugin() has always had", () => {
    expect(codeBlockPlugin().theme).toMatchObject({
      [`.${codeBlockClassNames.block}`]: { fontFamily: expect.stringContaining("monospace") },
    });
  });

  it("lets a host override the monospace font through the same shared CSS variable as every other code block", () => {
    expect(codeBlockPlugin().theme).toMatchObject({
      [`.${codeBlockClassNames.block}`]: {
        fontFamily: expect.stringMatching(/^var\(--mbox-code-block-font-family, .*monospace\)$/),
      },
    });
  });

  it("provides code block specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "```ts\nconst x = 1\n```",
      extensions: [
        createMboxExtension({
          plugins: [codeBlockPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("```ts\nconst x = 1\n```", { selection: 0 }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "line", from: 0 }),
        expect.objectContaining({ from: 3, to: 5, className: codeBlockClassNames.info }),
        expect.objectContaining({ from: 6, to: 18, className: codeBlockClassNames.text }),
      ]),
    );
  });
});
