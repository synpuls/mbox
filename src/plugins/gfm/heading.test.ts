import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { gfmHeadingPlugin } from "./heading.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return gfmHeadingPlugin().decorations!(createTestContext(input, { activeLines }));
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
        to: 0,
        className: "mbox-gfm-heading mbox-gfm-h2",
      },
      { type: "replace", from: 0, to: 3 },
    ]);
  });

  it("keeps the line style and reveals the marker on an active line", () => {
    expect(specsFor("## Title", [1])).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-gfm-heading mbox-gfm-h2" },
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
        to: 6,
        className: "mbox-gfm-heading mbox-gfm-h6",
      },
      { type: "replace", from: 6, to: 13 },
    ]);
  });

  it("styles a setext heading's text line without a marker replace or width reservation", () => {
    // `Title` / `=====` — mdast reports a zero-width marker, so we only style the
    // text line (level from the underline) and never emit a zero-length replace.
    expect(specsFor("Title\n=====")).toEqual([
      { type: "line", from: 0, to: 0, className: "mbox-gfm-heading mbox-gfm-h1" },
    ]);
  });

  it("does not ship a presentation theme (font-size/weight is visual, not structural)", () => {
    expect(gfmHeadingPlugin().theme).toBeUndefined();
  });
});
