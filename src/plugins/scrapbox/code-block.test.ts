import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders, type MboxWidgetDecorationSpec } from "../../editor/plugin.js";
import {
  scrapboxCodeBlockBodyClassName,
  scrapboxCodeBlockClassName,
  scrapboxCodeBlockClassNames,
  scrapboxCodeBlockCopyButtonClassName,
  scrapboxCodeBlockFileNameClassName,
  scrapboxCodeBlockHighlightPlugin,
  scrapboxCodeBlockKeywordClassName,
  scrapboxCodeBlockLanguageLabelClassName,
  scrapboxCodeBlockOpenerClassName,
  scrapboxCodeBlockPlugin,
  ScrapboxCodeBlockCopyButtonWidget,
} from "./code-block.js";
import { createTestContext } from "../../editor/test-context.js";

function specsFor(input: string) {
  return scrapboxCodeBlockPlugin().decorations!(createTestContext(input));
}

describe("createScrapboxCodeBlockSpecs", () => {
  it("decorates the opener line, its keyword and file name and the body lines", () => {
    expect(specsFor("code:a.js\n body\n more")).toEqual([
      {
        type: "line",
        from: 0,
        className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockOpenerClassName}`,
      },
      { type: "mark", from: 0, to: 5, className: scrapboxCodeBlockKeywordClassName },
      { type: "mark", from: 5, to: 9, className: `${scrapboxCodeBlockFileNameClassName} ${scrapboxCodeBlockLanguageLabelClassName}` },
      {
        type: "widget",
        from: 9,
        widget: new ScrapboxCodeBlockCopyButtonWidget("body\nmore", scrapboxCodeBlockCopyButtonClassName),
        side: 1,
      },
      { type: "line", from: 10, className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockBodyClassName}` },
      { type: "line", from: 16, className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockBodyClassName}` },
    ]);
  });

  it("omits the file name and language label marks when the opener has no file name, but still shows the Copy button", () => {
    expect(specsFor("code:\n body")).toEqual([
      {
        type: "line",
        from: 0,
        className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockOpenerClassName}`,
      },
      { type: "mark", from: 0, to: 5, className: scrapboxCodeBlockKeywordClassName },
      {
        type: "widget",
        from: 5,
        widget: new ScrapboxCodeBlockCopyButtonWidget("body", scrapboxCodeBlockCopyButtonClassName),
        side: 1,
      },
      { type: "line", from: 6, className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockBodyClassName}` },
    ]);
  });

  it("preserves a body line that is only the required indent (no content after it) as a blank line in the Copy button's text", () => {
    // A genuinely blank line (no indent at all) ends the code block per
    // scrapbox's own indent-based block rules -- this is the block-internal
    // equivalent: a line with only the minimum indent marker and nothing else.
    const specs = specsFor("code:a.js\n one\n \n two");
    const copyWidget = specs.find((spec) => spec.type === "widget") as MboxWidgetDecorationSpec;

    expect(copyWidget.widget).toEqual(new ScrapboxCodeBlockCopyButtonWidget("one\n\ntwo", scrapboxCodeBlockCopyButtonClassName));
  });

  it("creates no specs without a code block", () => {
    expect(specsFor("just text\n more")).toEqual([]);
  });
});

describe("scrapboxCodeBlockHighlightPlugin", () => {
  function highlightSpecsFor(input: string) {
    return scrapboxCodeBlockHighlightPlugin().decorations!(createTestContext(input));
  }

  it("highlights a single-line body against the file name's language", () => {
    const specs = highlightSpecsFor("code:a.js\n const x = 1;");

    expect(specs).toContainEqual({ from: 11, to: 16, className: `${scrapboxCodeBlockClassNames.token} tok-keyword` });
  });

  it("resolves a file name containing spaces by its extension", () => {
    // "code:my file.js" is 15 chars, body content starts right after the
    // opener's "\n" and the one required indent marker -- content from 17.
    const specs = highlightSpecsFor("code:my file.js\n const x = 1;");

    expect(specs).toContainEqual({ from: 17, to: 22, className: `${scrapboxCodeBlockClassNames.token} tok-keyword` });
  });

  it("strips only the block's own required marker when the whole block is itself indented, keeping any deeper body indent as code", () => {
    // The opener sits one indent level deep (block.indent = 1); the body line
    // carries one extra level of indent beyond that. getCodeBlockSegments
    // strips exactly block.indent + 1 characters, so only the block's own
    // required marker is removed -- the body's extra indent stays as part of
    // the highlighted (and copied) code, not stripped away as if it were more
    // marker. Verified against the actual parser: content range [13, 25).
    const specs = highlightSpecsFor(" code:a.js\n  const x = 1;");

    expect(specs).toContainEqual({ from: 13, to: 18, className: `${scrapboxCodeBlockClassNames.token} tok-keyword` });
  });

  it("splits a token spanning two body lines into one mark per line, mapped to each line's own document offsets", () => {
    // A single JS block comment written across two scrapbox body lines --
    // verified against the actual parser/Lezer output: content ranges
    // [11,19) and [21,27), one tok-comment token spanning the whole
    // "/* start\nend */".
    const specs = highlightSpecsFor("code:a.js\n /* start\n end */");

    expect(specs).toContainEqual({ from: 11, to: 19, className: `${scrapboxCodeBlockClassNames.token} tok-comment` });
    expect(specs).toContainEqual({ from: 21, to: 27, className: `${scrapboxCodeBlockClassNames.token} tok-comment` });
  });

  it("keeps highlighting the lines after a blank (indent-only) body line", () => {
    const specs = highlightSpecsFor("code:a.js\n const a = 1;\n \n const b = 2;");

    expect(specs.filter((spec) => "className" in spec && spec.className.includes("tok-keyword"))).toHaveLength(2);
  });

  it("emits nothing for an unsupported language", () => {
    expect(highlightSpecsFor("code:a.py\n const x = 1;")).toEqual([]);
  });

  it("emits nothing for a code block with no file name", () => {
    expect(highlightSpecsFor("code:\n const x = 1;")).toEqual([]);
  });

  it("never marks the opener line, file name, or the body lines' required indent marker", () => {
    const specs = highlightSpecsFor("code:a.js\n const x = 1;");

    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((spec) => "from" in spec && spec.from >= 11)).toBe(true);
  });
});

describe("scrapboxCodeBlockPlugin", () => {
  it("carries a monospace theme by default, to keep the existing look a bare scrapboxCodeBlockPlugin() has always had", () => {
    expect(scrapboxCodeBlockPlugin().theme).toMatchObject({
      [`.${scrapboxCodeBlockClassName}`]: { fontFamily: expect.stringContaining("monospace") },
    });
  });

  it("lets a host override the monospace font through the same shared CSS variable as every other code block", () => {
    expect(scrapboxCodeBlockPlugin().theme).toMatchObject({
      [`.${scrapboxCodeBlockClassName}`]: {
        fontFamily: expect.stringMatching(/^var\(--mbox-code-block-font-family, .*monospace\)$/),
      },
    });
  });

  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "code:a\n body",
      extensions: [createMboxExtension({ plugins: [scrapboxCodeBlockPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]).length).toBe(5);
  });
});
