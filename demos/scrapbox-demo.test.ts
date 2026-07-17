// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import katex from "katex";
import { createEditorView } from "mbox";
import { createScrapboxDemoEditorState, demoRenderFormula, initialScrapboxDocument } from "./scrapbox-demo";

describe("createScrapboxDemoEditorState", () => {
  it("keeps the demo document as a scrapbox syntax catalog", () => {
    expect(initialScrapboxDocument).toContain("Click a line to reveal its raw syntax");
    expect(initialScrapboxDocument).toContain(" A space-indented bullet");
    expect(initialScrapboxDocument).toContain("1. ");
    expect(initialScrapboxDocument).toContain("[* bold]");
    expect(initialScrapboxDocument).toContain("[** bigger]");
    expect(initialScrapboxDocument).toContain("[**** biggest]");
    expect(initialScrapboxDocument).toContain("[/ italic]");
    expect(initialScrapboxDocument).toContain("[- strikethrough]");
    expect(initialScrapboxDocument).toContain("[/* bold italic]");
    expect(initialScrapboxDocument).toContain("[[bold]]");
    expect(initialScrapboxDocument).toContain("[page link]");
    expect(initialScrapboxDocument).toContain("[https://example.com external link]");
    expect(initialScrapboxDocument).toContain("#hashtag");
    expect(initialScrapboxDocument).toContain("[demo-user.icon]");
    // The image notation: a bare bracketed absolute URL to the sample asset.
    expect(initialScrapboxDocument).toMatch(/\[http\S*sample-image\.png\]/);
    expect(initialScrapboxDocument).toContain("> ");
    expect(initialScrapboxDocument).toContain("`inline code`");
    expect(initialScrapboxDocument).toContain("code:hello.js");
    // STRESS -- a language outside the JS/TS sync default, exercising codeHighlight: { languages: "all" }.
    expect(initialScrapboxDocument).toContain("code:greeter.rb");
    expect(initialScrapboxDocument).toContain("table:sample");
    expect(initialScrapboxDocument).toContain("$ git reset");
    expect(initialScrapboxDocument).toContain("% cp a.txt b.txt");
    expect(initialScrapboxDocument).toContain("[$ \\frac");
    // a real tab separates the table cells
    expect(initialScrapboxDocument).toContain("Header A\tHeader B");
    expect(initialScrapboxDocument).not.toContain("1.5em");
  });

  it("renders the demo with line numbers supplied as an editor extension", () => {
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state: createScrapboxDemoEditorState() });

    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(view.contentDOM.getAttribute("aria-label")).toBe("Scrapbox demo editor");

    view.destroy();
  });

  it("dynamically highlights both the JS and the Ruby code blocks via codeHighlight: { languages: \"all\" }", async () => {
    const parent = document.createElement("div");
    const view = createEditorView({ parent, state: createScrapboxDemoEditorState() });

    await vi.waitFor(() => {
      expect(parent.querySelector(".mbox-scrapbox-code-block-token.tok-keyword")).not.toBeNull();
    });

    view.destroy();
  });
});

describe("demoRenderFormula", () => {
  it("renders a formula expression with KaTeX markup", () => {
    const element = demoRenderFormula("x^2 + 1");

    // KaTeX wraps its output in a `.katex` element.
    expect(element.querySelector(".katex")).not.toBeNull();
    expect(element.textContent).toContain("x");
  });

  it("does not throw on an invalid expression", () => {
    expect(() => demoRenderFormula("\\frac{1}{")).not.toThrow();
  });

  it("renders fractions in display style, taller than the default text style", () => {
    // The rendered box height/depth is encoded in KaTeX's strut inline styles, so
    // it can be measured from the markup without real layout.
    const fraction = "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}";
    const displayHeight = intrinsicHeightEm(demoRenderFormula(fraction).innerHTML);
    const textHeight = intrinsicHeightEm(katex.renderToString(fraction, { throwOnError: false }));

    // Display style un-shrinks the numerator/denominator, so the fraction stands
    // clearly taller than the cramped text-style default.
    expect(displayHeight).toBeGreaterThan(textHeight * 1.3);
  });
});

/** Total vertical extent (height + depth, em) of a KaTeX render, from its strut. */
function intrinsicHeightEm(html: string): number {
  const start = html.indexOf("katex-html");
  const region = start < 0 ? html : html.slice(start);
  const match = /height:([\d.]+)em(?:;[^"]*?vertical-align:(-?[\d.]+)em)?/.exec(region);
  if (!match) return 0;
  const height = Number.parseFloat(match[1]);
  const verticalAlign = match[2] ? Number.parseFloat(match[2]) : 0;
  return height - verticalAlign; // depth is the negative vertical-align
}
