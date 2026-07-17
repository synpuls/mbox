import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  scrapboxBulletClassName,
  scrapboxListClassNames,
  scrapboxListLineClassName,
  scrapboxListPlugin,
  scrapboxNumberClassName,
} from "./list.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const classNames = {
  line: scrapboxListLineClassName,
  bullet: scrapboxBulletClassName,
  number: scrapboxNumberClassName,
};

const listSpecs = (doc: string) =>
  scrapboxListPlugin().decorations!(createTestContext(doc));

describe("createScrapboxListSpecs", () => {
  it("renders each indent level as a replace widget, not raw whitespace text", () => {
    // The leading indent spaces must be replaced by CodeMirror decorations
    // (fixed-width widgets), so they never appear as editable/selectable raw
    // text. One widget per level keeps a caret stop between levels.
    const specs = listSpecs("  nested");

    const indentSpecs = specs.filter((spec) => spec.type === "replace");
    expect(indentSpecs).toEqual([
      { type: "replace", from: 0, to: 1, widget: expect.any(Object) },
      { type: "replace", from: 1, to: 2, widget: expect.any(Object) },
    ]);
    // no plain mark is used for the indent any more
    expect(specs.some((spec) => spec.type === "mark" && spec.className === scrapboxBulletClassName)).toBe(false);
  });

  it("creates a line spec and an indent bullet widget for a bullet line", () => {
    const input = " item";

    const specs = listSpecs(input);

    expect(specs).toEqual([
      {
        type: "line",
        from: 0,
        className: scrapboxListLineClassName,
        attributes: { "data-mbox-scrapbox-indent": "1", style: "--mbox-scrapbox-list-hang: 1.5em" },
      },
      {
        // the indent space [0, 1) is replaced by the innermost bullet-slot widget
        type: "replace",
        from: 0,
        to: 1,
        widget: expect.any(Object),
      },
    ]);
  });

  it("renders each level as a fixed-width widget so half- and full-width spaces align", () => {
    const oneHalf = listSpecs(" a");
    const oneFull = listSpecs("　a");
    const two = listSpecs("  a");
    const indentOf = (specs: ReturnType<typeof listSpecs>) =>
      specs.filter((spec) => spec.type === "replace");

    // A half- and a full-width single indent produce the exact same bullet-slot
    // widget — the box width is fixed by CSS class, not by the raw space — so
    // they indent identically.
    const singleBulletSlot = [
      { type: "replace", from: 0, to: 1, widget: expect.any(Object) },
    ];
    expect(indentOf(oneHalf)).toEqual(singleBulletSlot);
    expect(indentOf(oneFull)).toEqual(singleBulletSlot);
    // Two levels: a full-width outer indent box, then the innermost bullet slot.
    expect(indentOf(two)).toEqual([
      { type: "replace", from: 0, to: 1, widget: expect.any(Object) },
      { type: "replace", from: 1, to: 2, widget: expect.any(Object) },
    ]);
  });

  it("hosts the bullet dot on the indent whitespace, not the content", () => {
    // A page link at the start of the content must not be able to split or
    // move the dot: the bullet slot covers only the leading indent whitespace.
    const input = " [ページ] は内部リンク";

    const specs = listSpecs(input);

    const indentSpecs = specs.filter((spec) => spec.type === "replace");
    expect(indentSpecs).toEqual([
      {
        type: "replace",
        from: 0,
        to: 1,
        widget: expect.any(Object),
      },
    ]);
  });

  it("replaces only the indent whitespace, never the content, so the content cannot shift", () => {
    // The indent is replaced by fixed-width widgets, but only over the leading
    // whitespace [0, 2); the content range ("deep" at [2, 6)) is never decorated
    // here, so a link/image in the content cannot be split or shifted.
    const input = "  deep";

    const specs = listSpecs(input);

    const replaces = specs.filter((spec) => spec.type === "replace");
    expect(replaces).toHaveLength(2);
    expect(replaces.every((spec) => (spec as MboxReplaceDecorationSpec).widget != null && spec.to <= 2)).toBe(true);
    // nothing is decorated past the indent (content starts at offset 2)
    expect(specs.every((spec) => spec.from <= 2)).toBe(true);
  });

  it("creates a line spec and a number mark for a number list line", () => {
    const input = "1. first";

    const specs = listSpecs(input);

    expect(specs).toEqual([
      {
        type: "line",
        from: 0,
        className: scrapboxListLineClassName,
        attributes: { "data-mbox-scrapbox-indent": "0" },
      },
      {
        type: "mark",
        from: 0,
        to: 3,
        className: scrapboxNumberClassName,
      },
    ]);
  });

  it("creates no specs for a non-indented plain line", () => {
    expect(listSpecs("plain")).toEqual([]);
  });

  it("creates a bullet for a whitespace-only indented line", () => {
    // a leading space alone is a list item (empty content)
    const specs = listSpecs("  ");

    expect(specs).toEqual([
      {
        type: "line",
        from: 0,
        className: scrapboxListLineClassName,
        attributes: { "data-mbox-scrapbox-indent": "2", style: "--mbox-scrapbox-list-hang: 3em" },
      },
      // the two indent spaces are replaced by an outer indent box then the
      // innermost bullet slot
      {
        type: "replace",
        from: 0,
        to: 1,
        widget: expect.any(Object),
      },
      {
        type: "replace",
        from: 1,
        to: 2,
        widget: expect.any(Object),
      },
      // An empty list line also gets a zero-width caret anchor just after the
      // indent box, so the caret / IME preedit text lands outside the box.
      {
        type: "widget",
        from: 2,
        widget: expect.any(Object),
        side: 1,
      },
    ]);
  });

  it("adds no caret anchor to a bullet line that already has content", () => {
    // content gives the caret its own text node; the anchor is only for the
    // empty case, so a normal item must not carry the widget.
    const specs = listSpecs(" item");

    expect(specs.some((spec) => spec.type === "widget" && (spec.widget as unknown as { toDOM(): HTMLElement }).toDOM().className === "mbox-scrapbox-caret-anchor")).toBe(false);
  });

  it("skips code and table block lines so their content stays literal", () => {
    const input = "code:a.js\n const x = 1";

    const specs = listSpecs(input);

    // the indented block body must not become a bullet
    expect(specs).toEqual([]);
  });
});

describe("scrapboxListPlugin", () => {
  it("provides list specs from the document through a decoration provider", () => {
    const state = EditorState.create({
      doc: " item\n1. first",
      extensions: [createMboxExtension({ plugins: [scrapboxListPlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    const specs = provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]);

    expect(specs).toMatchObject([
      { type: "line", from: 0, className: scrapboxListLineClassName },
      { type: "replace"},
      { type: "line", from: 6, className: scrapboxListLineClassName },
      { type: "mark", className: scrapboxNumberClassName },
    ]);
  });
});
