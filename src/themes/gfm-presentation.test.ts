import { describe, expect, it } from "vitest";
import { gfmHeadingClassNames } from "../plugins/gfm/heading.js";
import { gfmLinkClassName } from "../plugins/gfm/link.js";
import { gfmInlineCodeClassName } from "../plugins/gfm/inline-code.js";
import { gfmCodeBlockClassNames } from "../plugins/gfm/code-block.js";
import { gfmDefaultPresentationThemeSpec } from "./gfm-presentation.js";

// These assertions pin mbox's own default values for the GFM namespace, so a
// change to any of them is deliberate rather than incidental. They are not a
// claim about how any other renderer looks.
describe("gfmDefaultPresentationThemeSpec", () => {
  it("composes the shared code token presentation spec", () => {
    expect(gfmDefaultPresentationThemeSpec[`.${gfmCodeBlockClassNames.token}.tok-keyword`]).toMatchObject({
      color: "var(--mbox-code-token-keyword-color, #a626a4)",
    });
  });
  it("provides optional heading presentation styles through public classes, matching mbox's own scale", () => {
    expect(gfmDefaultPresentationThemeSpec).toMatchObject({
      [`.${gfmHeadingClassNames.h1}, .${gfmHeadingClassNames.h2}, .${gfmHeadingClassNames.h3}, .${gfmHeadingClassNames.h4}, .${gfmHeadingClassNames.h5}, .${gfmHeadingClassNames.h6}`]: {
        fontWeight: "var(--mbox-heading-font-weight, 700)",
      },
      [`.${gfmHeadingClassNames.h1}`]: {
        fontSize: "var(--mbox-h1-font-size, 1.45rem)",
      },
    });
  });

  it("colours links through the public class, and leaves them unlined", () => {
    expect(gfmDefaultPresentationThemeSpec[`.${gfmLinkClassName}`]).toMatchObject({
      color: "var(--mbox-gfm-link-color, #0969da)",
      textDecoration: "none",
      cursor: "pointer",
    });
  });

  it("gives inline code a monospace stack, size, background, and padding", () => {
    expect(gfmDefaultPresentationThemeSpec[`.${gfmInlineCodeClassName}`]).toMatchObject({
      fontFamily:
        'var(--mbox-gfm-code-font-family, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace)',
      fontSize: "var(--mbox-gfm-code-font-size, 85%)",
      background: "var(--mbox-gfm-code-background, #818b981f)",
      borderRadius: "var(--mbox-gfm-code-border-radius, 6px)",
      padding: "var(--mbox-gfm-code-padding, 0.2em 0.4em)",
    });
  });
});
