import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { GfmLinkWidget, gfmLinkPlugin } from "./link.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options: Parameters<typeof gfmLinkPlugin>[0] = {}, activeLines: Iterable<number> = noActiveLines) {
  return gfmLinkPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("gfmLinkPlugin", () => {
  it("replaces a bracketed link with an anchor widget resolved through the host linkUrl", () => {
    const specs = specsFor("[label](path)", { linkUrl: (url) => `https://host/${url}` });
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ type: "replace", from: 0, to: 13 });
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    expect(widget).toBeInstanceOf(GfmLinkWidget);
    expect(widget.text).toBe("label");
    expect(widget.href).toBe("https://host/path");
  });

  it("defaults the resolver to identity and reveals raw syntax on an active line", () => {
    const specs = specsFor("[label](path)");
    expect((specs[0] as unknown as { widget: GfmLinkWidget }).widget.href).toBe("path");
    expect(specsFor("[label](path)", {}, [1])).toEqual([]);
  });

  it("uses the recursively projected label text rather than literal inline markers", () => {
    const specs = specsFor("[*em* label](url)");

    expect((specs[0] as unknown as { widget: GfmLinkWidget }).widget.text).toBe("em label");
  });
});
