import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import {
  HatenaSuperPreLangWidget,
  hatenaSuperPreHighlightPlugin,
  hatenaSuperPrePlugin,
  hatenaSuperPreTokenClassName,
} from "./super-pre.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = hatenaSuperPrePlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("hatenaSuperPrePlugin", () => {
  it("wraps the whole block in one line range and hides the >|| and ||< markers when inactive", () => {
    // ">||"=0..3, "code"=4..8, "||<"=9..12
    expect(specsFor(">||\ncode\n||<")).toEqual([
      { type: "lineRange", from: 0, to: 12, className: "mbox-hatena-superpre" },
      { type: "replace", from: 0, to: 3 },
      { type: "replace", from: 9, to: 12 },
    ]);
  });

  it("reveals the opener marker when its line is active", () => {
    // Line 1 (opener) active reveals its marker; line 3 (closer) stays hidden.
    expect(specsFor(">||\ncode\n||<", [1])).toMatchObject([
      { type: "lineRange", from: 0, to: 12, className: "mbox-hatena-superpre" },
      { type: "replace", from: 9, to: 12 },
    ]);
  });

  it("replaces a `>|lang|` opener with a language-label widget when inactive", () => {
    // ">|python|"=0..9, "code"=10..14, "||<"=15..18
    const specs = specsFor(">|python|\ncode\n||<");
    const openerReplace = specs.find((spec) => spec.type === "replace" && spec.from === 0) as unknown as {
      to: number;
      widget?: HatenaSuperPreLangWidget;
    };
    expect(openerReplace.to).toBe(9);
    expect(openerReplace.widget).toBeInstanceOf(HatenaSuperPreLangWidget);
    expect(openerReplace.widget?.language).toBe("python");
  });

  it("creates no specs when there is no super-pre block", () => {
    expect(specsFor("*heading\n-item")).toEqual([]);
  });
});

describe("hatenaSuperPreHighlightPlugin", () => {
  function highlightSpecsFor(input: string) {
    const context = createTestContext(input);
    const specs = hatenaSuperPreHighlightPlugin().decorations!(context);
    validateDecorationSpecs(context, specs);
    return specs;
  }

  it("highlights a body line against the opener's language id", () => {
    // ">|js|"=0..5, "const x = 1;"=6..18, "||<"=19..22 -- "const" is 6..11.
    const specs = highlightSpecsFor(">|js|\nconst x = 1;\n||<");

    expect(specs).toContainEqual({ from: 6, to: 11, className: `${hatenaSuperPreTokenClassName} tok-keyword` });
  });

  it("splits a token spanning two body lines into one mark per line", () => {
    // One JS block comment across two body lines: "/* start"=6..14, "end */"=15..21.
    const specs = highlightSpecsFor(">|js|\n/* start\nend */\n||<");

    expect(specs).toContainEqual({ from: 6, to: 14, className: `${hatenaSuperPreTokenClassName} tok-comment` });
    expect(specs).toContainEqual({ from: 15, to: 21, className: `${hatenaSuperPreTokenClassName} tok-comment` });
  });

  it("never marks the opener or closer line", () => {
    const specs = highlightSpecsFor(">|js|\nconst x = 1;\n||<");

    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((spec) => spec.from >= 6 && "to" in spec && spec.to <= 18)).toBe(true);
  });

  it("emits nothing for a language outside the JS/TS sync default", () => {
    expect(highlightSpecsFor(">|python|\nx = 1\n||<")).toEqual([]);
  });

  it("emits nothing for a bare `>||` opener with no language", () => {
    expect(highlightSpecsFor(">||\nconst x = 1;\n||<")).toEqual([]);
  });

  it("emits nothing for the `>|??|` auto-detect opener", () => {
    expect(highlightSpecsFor(">|??|\nconst x = 1;\n||<")).toEqual([]);
  });

  it("resolves a language token with trailing text by its first word, leniently", () => {
    // The parser accepts any `[^|]*` between the pipes and the opener widget
    // shows it verbatim; highlighting deliberately stays permissive and reads
    // the first whitespace-separated word, like a fenced block's info string.
    // ">|js title|"=0..11, "const"=12..17.
    const specs = highlightSpecsFor(">|js title|\nconst x = 1;\n||<");

    expect(specs).toContainEqual({ from: 12, to: 17, className: `${hatenaSuperPreTokenClassName} tok-keyword` });
  });

  it("highlights each block against its own language when several blocks coexist", () => {
    // Second block's "const" sits after ">|js|\nx\n||<\n>|ts|\n" = 5+1+1+1+3+1+5+1 -- verified: 18..23.
    const specs = highlightSpecsFor(">|js|\nx\n||<\n>|ts|\nconst y = 2;\n||<");

    expect(specs).toContainEqual({ from: 18, to: 23, className: `${hatenaSuperPreTokenClassName} tok-keyword` });
  });
});
