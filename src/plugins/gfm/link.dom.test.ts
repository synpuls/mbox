import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import { GfmLinkWidget, gfmLinkPlugin, gfmUnsafeLinkClassName } from "./link.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options: Parameters<typeof gfmLinkPlugin>[0] = {}, activeLines: Iterable<number> = noActiveLines) {
  return gfmLinkPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

function elementFor(input: string, options: Parameters<typeof gfmLinkPlugin>[0] = {}): HTMLElement {
  const specs = specsFor(input, options);
  return (specs[0] as unknown as { widget: { toDOM(): HTMLElement } }).widget.toDOM();
}

describe("gfmLinkPlugin", () => {
  it("renders a javascript destination as an unsafe span instead of an anchor", () => {
    const specs = specsFor("[x](javascript:alert(1))");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.tagName).toBe("SPAN");
    expect(element.className).toBe(gfmUnsafeLinkClassName);
    expect(element.textContent).toBe("x");
  });

  it("validates the final href returned by linkUrl", () => {
    expect(elementFor("[x](./safe)", { linkUrl: () => "javascript:alert(1)" }).tagName).toBe("SPAN");
  });

  it.each([
    ["JaVaScRiPt:alert(1)", undefined],
    ["javascript&#58;alert(1)", undefined],
    ["./safe", "\u0001 javascript:alert(1)"],
    ["./safe", "java\tscript:alert(1)"],
    ["./safe", "java\nscript:alert(1)"],
    ["./safe", "java\rscript:alert(1)"],
  ])("rejects normalized javascript destination %j", (url, resolvedUrl) => {
    const options = resolvedUrl === undefined ? {} : { linkUrl: () => resolvedUrl };
    expect(elementFor(`[x](${url})`, options).tagName).toBe("SPAN");
  });

  it.each(["vbscript:msgbox(1)", "data:text/html,x", "file:///tmp/x", "blob:https://example.com/id"])(
    "rejects permanently blocked destination %j",
    (url) => {
      expect(elementFor(`[x](${url})`).tagName).toBe("SPAN");
    },
  );

  it("rejects an unknown custom scheme by default", () => {
    expect(elementFor("[x](obsidian://open?vault=notes)").tagName).toBe("SPAN");
  });

  it("allows a validated additional protocol case-insensitively", () => {
    const element = elementFor("[x](obsidian://open?vault=notes)", {
      additionalAllowedProtocols: ["Obsidian"],
    });
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("href")).toBe("obsidian://open?vault=notes");
  });

  it.each([
    ["obsidian:", "obsidian://open"],
    ["1custom", "obsidian://open"],
    ["custom name", "custom://open"],
    ["", "obsidian://open"],
    ["javascript", "javascript:alert(1)"],
    ["VBScript", "vbscript:msgbox(1)"],
    ["DATA", "data:text/plain,x"],
    ["file", "file:///tmp/x"],
    ["blob", "blob:https://example.com/id"],
  ])(
    "ignores invalid or permanently blocked additional protocol %j",
    (protocol, destination) => {
      expect(
        elementFor(`[x](${destination})`, { additionalAllowedProtocols: [protocol] }).tagName,
      ).toBe("SPAN");
    },
  );

  it.each([
    "http://example.com",
    "https://example.com",
    "mailto:user@example.com",
    "tel:+15555550123",
    "foo",
    "./foo",
    "../foo",
    "/foo",
    "?q=1",
    "#section",
    "//example.com/path",
    "javascript%3Aalert(1)",
    "%6aavascript:alert(1)",
  ])("allows safe destination %j without rewriting its href", (url) => {
    const element = elementFor(`[x](${url})`);
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("href")).toBe(url);
  });

  it("renders an unsafe span with only the unsafe class, no link attributes, and the original label", () => {
    const element = elementFor("[visible label](javascript:alert(1))");
    expect(element.outerHTML).toBe(`<span class="${gfmUnsafeLinkClassName}">visible label</span>`);
    expect(element.getAttribute("href")).toBeNull();
    expect(element.getAttribute("target")).toBeNull();
    expect(element.classList.contains("mbox-gfm-link")).toBe(false);
  });

  it("keeps an empty-label unsafe destination visible", () => {
    const element = elementFor("[](javascript:alert(1))");
    expect(element.tagName).toBe("SPAN");
    expect(element.textContent).toBe("[](javascript:alert(1))");
  });

  it("marks a bracketed absolute URL as external", () => {
    const specs = specsFor("[label](https://example.com)");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("does not mark a bracketed relative URL as external", () => {
    const specs = specsFor("[label](./other)");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("marks a final absolute HTTP href as external even when the source URL was relative", () => {
    const specs = specsFor("[label](./other)", { linkUrl: (url) => `https://host/${url}` });
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("href")).toBe("https://host/./other");
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("does not mark a final relative href as external when the source URL was absolute", () => {
    const element = elementFor("[label](https://example.com)", { linkUrl: () => "./internal" });
    expect(element.getAttribute("href")).toBe("./internal");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("does not mark a protocol-relative href as external", () => {
    const element = elementFor("[label](//example.com/path)");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("renders a GFM autolink as an anchor over its own text", () => {
    const specs = specsFor("www.example.com", { linkUrl: (url) => `${url}?via=mbox` });
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    expect(widget.text).toBe("www.example.com");
    // The autolink url is already normalized to http(s) by the parser, then run
    // through the host resolver like any other link.
    expect(widget.href).toBe("http://www.example.com?via=mbox");
    expect(widget.autolink).toBe(true);
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });
});
