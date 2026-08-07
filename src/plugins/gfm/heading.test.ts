import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { gfmHeadingPlugin } from "./heading.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmHeadingPlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("gfmHeadingPlugin", () => {
  it("styles a heading line and hides its marker without reserving its width", () => {
    // No width is reserved for the hidden `## ` — the content moves flush left,
    // and the sideways shift when focus reveals the raw marker is accepted (see
    // the module comment).
    expect(specsFor("## Title")).toEqual([
      {
        type: "line",
        from: 0,
        className: "mbox-gfm-heading mbox-gfm-h2",
      },
      { type: "replace", from: 0, to: 3 },
    ]);
  });

  it("keeps the line style and reveals the marker on an active line", () => {
    expect(specsFor("## Title", [1])).toEqual([
      { type: "line", from: 0, className: "mbox-gfm-heading mbox-gfm-h2" },
    ]);
  });

  it("creates no specs for a plain paragraph", () => {
    expect(specsFor("plain")).toEqual([]);
  });

  it("resolves the marker offset on a later line and picks the right level class", () => {
    expect(specsFor("plain\n###### Deep")).toEqual([
      {
        type: "line",
        from: 6,
        className: "mbox-gfm-heading mbox-gfm-h6",
      },
      { type: "replace", from: 6, to: 13 },
    ]);
  });

  it("styles a setext heading's text line without a marker replace or width reservation", () => {
    // `Title` / `=====` — mdast reports a zero-width marker, so we style the
    // text line and hide the physical underline with a line decoration only.
    expect(specsFor("Title\n=====")).toEqual([
      { type: "line", from: 0, className: "mbox-gfm-heading mbox-gfm-h1" },
      { type: "line", from: 6, className: "mbox-gfm-heading-setext-underline" },
    ]);
  });

  it.each([
    ["the text line", 1],
    ["the underline itself", 2],
  ])("reveals a setext underline while %s is active", (_label, activeLine) => {
    // Both lines count, the rule Section 0 measured for multiline structures.
    // Without the underline half, a caret moved down into `=====` would land on
    // a line that stays hidden.
    expect(specsFor("Title\n=====", [activeLine])).toEqual([
      { type: "line", from: 0, className: "mbox-gfm-heading mbox-gfm-h1" },
    ]);
  });

  it("ships only the structural theme needed to hide an inactive setext underline", () => {
    expect(gfmHeadingPlugin().theme).toEqual({
      ".mbox-gfm-heading-setext-underline": { display: "none" },
    });
  });
});
