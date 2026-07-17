import { describe, expect, it } from "vitest";
import { createAnchorElement } from "./inline-notation-kit.js";

describe("createAnchorElement", () => {
  it("creates an anchor with the given href, text, and class", () => {
    const anchor = createAnchorElement({ href: "https://example.com", text: "Example", className: "test-link" });
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBe("https://example.com");
    expect(anchor.textContent).toBe("Example");
    expect(anchor.className).toBe("test-link");
  });

  it("sets any extra attributes given", () => {
    const anchor = createAnchorElement({
      href: "https://example.com",
      text: "Example",
      className: "test-link",
      attributes: { target: "_blank", rel: "noreferrer" },
    });
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noreferrer");
  });

  it("skips an extra attribute whose value is undefined", () => {
    const anchor = createAnchorElement({
      href: "https://example.com",
      text: "Example",
      className: "test-link",
      attributes: { target: undefined },
    });
    expect(anchor.hasAttribute("target")).toBe(false);
  });
});
