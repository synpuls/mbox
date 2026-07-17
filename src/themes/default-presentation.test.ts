import { describe, expect, it } from "vitest";
import { headingClassNames } from "../plugins/mbox/heading.js";
import { inlineCodeClassName } from "../plugins/mbox/inline-code.js";
import { inlineStyleClassNames } from "../plugins/mbox/inline-style.js";
import { pageLinkClassName } from "../plugins/mbox/page-link.js";
import { quoteClassNames } from "../plugins/mbox/quote.js";
import { codeBlockHighlightClassNames } from "../plugins/mbox/code-block.js";
import { mboxDefaultPresentationThemeSpec } from "./default-presentation.js";

describe("mboxDefaultPresentationThemeSpec", () => {
  it("composes the shared code token presentation spec", () => {
    expect(mboxDefaultPresentationThemeSpec[`.${codeBlockHighlightClassNames.token}.tok-keyword`]).toMatchObject({
      color: "var(--mbox-code-token-keyword-color, #a626a4)",
    });
  });
  it("provides optional heading presentation styles through public classes", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${headingClassNames.h1}, .${headingClassNames.h2}, .${headingClassNames.h3}, .${headingClassNames.h4}, .${headingClassNames.h5}, .${headingClassNames.h6}`]: {
        fontWeight: "var(--mbox-heading-font-weight, 700)",
      },
      [`.${headingClassNames.h1}`]: {
        fontSize: "var(--mbox-h1-font-size, 1.45rem)",
      },
    });
  });

  it("provides optional page link presentation styles through the public class", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${pageLinkClassName}`]: {
        color: "var(--mbox-page-link-color, #0969da)",
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      },
    });
  });

  it("gives inline code a default monospace font through the public class, overridable via CSS variable", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${inlineCodeClassName}`]: {
        fontFamily: expect.stringMatching(/^var\(--mbox-inline-code-font-family, .*monospace\)$/),
      },
    });
  });

  it("gives emphasis/strong/strikethrough their expected default look through their public classes", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${inlineStyleClassNames.em}`]: {
        fontStyle: "var(--mbox-emphasis-font-style, italic)",
      },
      [`.${inlineStyleClassNames.strong}`]: {
        fontWeight: "var(--mbox-strong-font-weight, 700)",
      },
      [`.${inlineStyleClassNames.strike}`]: {
        textDecoration: "var(--mbox-strike-text-decoration, line-through)",
      },
    });
  });

  it("gives a quote a default border and muted text color through its public class", () => {
    expect(mboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${quoteClassNames.quote}`]: {
        borderLeft: "var(--mbox-quote-border, 3px solid #d0d7de)",
        paddingLeft: "var(--mbox-quote-padding, 0.6em)",
        color: "var(--mbox-quote-color, #57606a)",
      },
    });
  });
});
