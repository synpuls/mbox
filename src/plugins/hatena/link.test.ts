import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { HatenaLinkWidget, hatenaLinkPlugin } from "./link.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaLinkPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaLinkPlugin", () => {
  it("replaces a titled bracket link with a widget on an inactive line", () => {
    const specs = specsFor("see [http://example.com/:title=foo] end");
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "replace", from: 4, to: 35 });
    expect(specs[0]).not.toHaveProperty("className");
    expect((specs[0] as { widget: unknown }).widget).toBeInstanceOf(HatenaLinkWidget);
  });

  it("replaces bare URLs and id: notation on inactive lines", () => {
    const specs = specsFor("go http://a.example/ and id:bob");
    expect(specs).toMatchObject([
      { type: "replace", from: 3, to: 20 },
      { type: "replace", from: 25, to: 31 },
    ]);
  });

  it("leaves raw link text on an active line", () => {
    expect(specsFor("see [http://example.com/]", [1])).toEqual([]);
  });

  it("creates no specs inside a super-pre body", () => {
    expect(specsFor(">||\n[http://example.com/]\n||<")).toEqual([]);
  });
});

describe("HatenaLinkWidget", () => {
  it("compares equal only when href, label and kind all match", () => {
    const base = new HatenaLinkWidget("http://a/", "a", "url");
    expect(base.eq(new HatenaLinkWidget("http://a/", "a", "url"))).toBe(true);
    expect(base.eq(new HatenaLinkWidget("http://b/", "a", "url"))).toBe(false);
    expect(base.eq(new HatenaLinkWidget("http://a/", "b", "url"))).toBe(false);
    expect(base.eq(new HatenaLinkWidget("http://a/", "a", "bracket"))).toBe(false);
  });
});
