import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { HatenaLinkWidget, hatenaLinkPlugin } from "./link.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return hatenaLinkPlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("hatenaLinkPlugin", () => {
  it("resolves id: links through an injected idUrl instead of the default /username", () => {
    const context = createTestContext("id:bob");
    const specs = hatenaLinkPlugin({ idUrl: (name) => `/users/${name}` }).decorations!(context);
    const widget = (specs[0] as { widget: unknown }).widget as HatenaLinkWidget;
    expect(widget.toDOM().getAttribute("href")).toBe("/users/bob");
  });

  it("defaults id: link resolution to /username when no idUrl is given", () => {
    const specs = specsFor("id:bob");
    const widget = (specs[0] as { widget: unknown }).widget as HatenaLinkWidget;
    expect(widget.toDOM().getAttribute("href")).toBe("/bob");
  });
});

describe("HatenaLinkWidget", () => {
  it("renders an anchor carrying the mbox class, the href, and the label", () => {
    const element = new HatenaLinkWidget("http://example.com/", "foo", "bracket").toDOM();
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("href")).toBe("http://example.com/");
    expect(element.textContent).toBe("foo");
    expect(element.className).toContain("mbox-hatena-link");
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("renders a bare URL link as an external anchor", () => {
    const element = new HatenaLinkWidget("http://example.com/", "http://example.com/", "url").toDOM();
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("renders an id: link to /username", () => {
    const element = new HatenaLinkWidget("/bob", "id:bob", "id").toDOM();
    expect(element.getAttribute("href")).toBe("/bob");
    expect(element.textContent).toBe("id:bob");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("keeps an id: link internal even when idUrl resolves it to an absolute URL", () => {
    const context = createTestContext("id:bob");
    const specs = hatenaLinkPlugin({ idUrl: (name) => `https://example.com/users/${name}` }).decorations!(context);
    const widget = (specs[0] as { widget: unknown }).widget as HatenaLinkWidget;
    const element = widget.toDOM();
    expect(element.getAttribute("href")).toBe("https://example.com/users/bob");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });
});
