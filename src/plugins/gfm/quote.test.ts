import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { gfmQuotePlugin } from "./quote.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return gfmQuotePlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("gfmQuotePlugin", () => {
  it("wraps a quote in a lineRange container and hides its `> ` flush-left", () => {
    const specs = specsFor("> hi");
    expect(specs[0]).toEqual({
      type: "lineRange",
      from: 0,
      to: 4,
      className: "mbox-gfm-quote",
      attributes: { style: "--mbox-gfm-quote-depth: 1" },
    });
    // A plain replace, no spacer: the quoted text sits flush against the
    // container like the mbox notation's quotes (the focus shift is accepted).
    expect(specs[1]).toEqual({ type: "replace", from: 0, to: 2 });
  });

  it("reveals the raw marker on an active line, keeping only the container", () => {
    const specs = specsFor("> hi", [1]);
    expect(specs).toEqual([
      {
        type: "lineRange",
        from: 0,
        to: 4,
        className: "mbox-gfm-quote",
        attributes: { style: "--mbox-gfm-quote-depth: 1" },
      },
    ]);
  });

  it("nests `>>` as two containers and two per-line spacers on the inner line", () => {
    const specs = specsFor("> a\n>> b");
    const containers = specs.filter((spec) => spec.type === "lineRange");
    expect(containers.map((spec) => (spec as unknown as { attributes: { style: string } }).attributes.style)).toEqual([
      "--mbox-gfm-quote-depth: 1",
      "--mbox-gfm-quote-depth: 2",
    ]);
    const replaces = specs.filter((spec) => spec.type === "replace");
    expect(replaces).toMatchObject([
      { from: 0, to: 2 },
      { from: 4, to: 5 },
      { from: 5, to: 7 },
    ]);
  });

  it("keeps a lazy-continuation line inside the container with no spacer of its own", () => {
    const specs = specsFor("> a\nb");
    const container = specs.find((spec) => spec.type === "lineRange");
    // The container spans BOTH lines (offset 5 is the end of the lazy line `b`).
    expect(container).toMatchObject({ from: 0, to: 5 });
    const replaces = specs.filter((spec) => spec.type === "replace");
    expect(replaces).toMatchObject([{ from: 0, to: 2 }]);
  });
});
