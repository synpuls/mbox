import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { parseScrapboxDocument } from "./parser.js";
import {
  scrapboxCodeClassName,
  scrapboxDecorationPlugin,
  scrapboxEmphasisClassName,
  scrapboxStrikethroughClassName,
  scrapboxStrongClassName,
  scrapboxStrongLevelClassNamePrefix,
  scrapboxUnderlineClassName,
} from "./decoration.js";
import { createTestContext } from "../../editor/test-context.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxDecorationPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxDecorationSpecs", () => {
  it("hides bold decoration markers and marks the content", () => {
    expect(specsFor("[* bold]")).toEqual([
      { type: "replace", from: 0, to: 3 },
      { type: "replace", from: 7, to: 8 },
      expect.objectContaining({ type: "mark", from: 3, to: 7 }),
    ]);
    expect(("className" in specsFor("[* bold]")[2] ? (specsFor("[* bold]")[2] as { className: string }).className : "")).toContain(scrapboxStrongClassName);
  });

  it("maps decoration characters to italic and strikethrough classes", () => {
    expect(("className" in specsFor("[/ i]")[2] ? (specsFor("[/ i]")[2] as { className: string }).className : "")).toContain(scrapboxEmphasisClassName);
    expect(("className" in specsFor("[- s]")[2] ? (specsFor("[- s]")[2] as { className: string }).className : "")).toContain(scrapboxStrikethroughClassName);
  });

  it("reflects the asterisk level so bigger headings can be sized", () => {
    expect(("className" in specsFor("[* a]")[2] ? (specsFor("[* a]")[2] as { className: string }).className : "")).toContain(`${scrapboxStrongLevelClassNamePrefix}-1`);
    expect(("className" in specsFor("[**** a]")[2] ? (specsFor("[**** a]")[2] as { className: string }).className : "")).toContain(`${scrapboxStrongLevelClassNamePrefix}-4`);
  });

  it("hides inline code markers and marks the content", () => {
    expect(specsFor("`x`")).toEqual([
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 2, to: 3 },
      { type: "mark", from: 1, to: 2, className: scrapboxCodeClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("hides strong markers built from double brackets", () => {
    const specs = specsFor("[[s]]");

    expect(specs).toEqual([
      { type: "replace", from: 0, to: 2 },
      { type: "replace", from: 3, to: 5 },
      { type: "mark", from: 2, to: 3, className: scrapboxStrongClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("resolves offsets inside a number list line", () => {
    const specs = specsFor("1. `x`");

    expect(specs).toEqual([
      { type: "replace", from: 3, to: 4 },
      { type: "replace", from: 5, to: 6 },
      { type: "mark", from: 4, to: 5, className: scrapboxCodeClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("returns no specs for plain text", () => {
    expect(specsFor("just text")).toEqual([]);
  });

  it("reveals raw syntax by skipping specs on active lines", () => {
    const document = parseScrapboxDocument("`a`\n`b`");

    // Inline code stays literal on its active line (1), so it emits no specs at
    // all — every remaining spec belongs to line 2.
    expect(specsFor("`a`\n`b`", [1]).every((spec) => spec.from >= 4)).toBe(
      true,
    );
  });

  it("keeps the strong size and weight on an active line while revealing the markers", () => {
    const input = "[** big]";
    const specs = specsFor(input, [1]);

    // Real Scrapbox keeps big text big AND bold while you edit it; dropping the
    // size or weight on focus would reflow the line. So the active line reveals
    // the raw markers (no hide/replace specs) yet keeps a mark that carries both
    // the strong weight and the font-size on the content.
    expect(specs).toEqual([expect.objectContaining({ type: "mark", from: 4, to: 7 })]);
    expect(("className" in specs[0] ? specs[0].className : "")).toContain(scrapboxStrongClassName);
    expect(("className" in specs[0] ? specs[0].className : "")).toContain(`${scrapboxStrongLevelClassNamePrefix}-2`);
  });

  it("keeps double-bracket strong bold on an active line while revealing the markers", () => {
    const input = "[[y]]";
    const specs = specsFor(input, [1]);

    // `[[y]]` is bold with no size change; the weight must survive onto the
    // revealed line so it does not un-bold under the cursor.
    expect(specs).toEqual([{ type: "mark", from: 2, to: 3, className: scrapboxStrongClassName, inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("keeps italic on an active line while revealing the markers", () => {
    const input = "[/ italic]";
    const specs = specsFor(input, [1]);

    // Italic must survive onto the revealed line so it does not un-italicise
    // under the cursor; the raw markers still show (no hide/replace specs).
    expect(specs).toEqual([{ type: "mark", from: 3, to: 9, className: scrapboxEmphasisClassName, inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("keeps strikethrough on an active line while revealing the markers", () => {
    const input = "[- struck]";
    const specs = specsFor(input, [1]);

    expect(specs).toEqual([{ type: "mark", from: 3, to: 9, className: scrapboxStrikethroughClassName, inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("keeps underline on an active line while revealing the markers", () => {
    const input = "[_ under]";
    const specs = specsFor(input, [1]);

    expect(specs).toEqual([{ type: "mark", from: 3, to: 8, className: scrapboxUnderlineClassName, inclusiveStart: true, inclusiveEnd: true }]);
  });

  it("leaves inline code literal on an active line", () => {
    const input = "`x`";
    expect(specsFor(input, [1])).toEqual([]);
  });
});

describe("scrapboxDecorationPlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "[* bold]",
      extensions: [createMboxExtension({ plugins: [scrapboxDecorationPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]).length).toBe(3);
  });
});
