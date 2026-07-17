import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { hatenaListPlugin } from "./list.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaListPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaListPlugin", () => {
  it("styles a depth-1 item and replaces its marker with a collapsed marker widget", () => {
    expect(specsFor("-a")).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: "mbox-hatena-list mbox-hatena-list-collapsed",
        attributes: { style: "--mbox-hatena-list-depth:1; --mbox-hatena-list-hang: 1em" },
      },
      { type: "replace", from: 0, to: 1, widget: expect.any(Object) },
    ]);
  });

  it("carries deeper depth and hides the whole hyphen run plus one space", () => {
    expect(specsFor("-- b")).toMatchObject([
      { type: "line", attributes: { style: "--mbox-hatena-list-depth:2; --mbox-hatena-list-hang: 2.2em" } },
      { type: "replace", from: 0, to: 3, widget: expect.any(Object) },
    ]);
  });

  it("keeps the same depth and replaces the marker with an active marker widget on active lines", () => {
    expect(specsFor("-a", [1])).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: "mbox-hatena-list mbox-hatena-list-active",
        attributes: { style: "--mbox-hatena-list-depth:1; --mbox-hatena-list-hang: 1em" },
      },
      { type: "replace", from: 0, to: 1, widget: expect.any(Object) },
    ]);
  });

  it("creates no specs for a plain line", () => {
    expect(specsFor("plain")).toEqual([]);
  });
});
