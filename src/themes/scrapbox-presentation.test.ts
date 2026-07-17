import { describe, expect, it } from "vitest";
import {
  scrapboxCodeClassName,
  scrapboxEmphasisClassName,
  scrapboxStrikethroughClassName,
  scrapboxStrongClassName,
  scrapboxStrongLevelClassNamePrefix,
} from "../plugins/scrapbox/decoration.js";
import { scrapboxLinkClassName, scrapboxUrlClassName } from "../plugins/scrapbox/link.js";
import { scrapboxQuoteLineClassName } from "../plugins/scrapbox/quote.js";
import { scrapboxCodeBlockClassName } from "../plugins/scrapbox/code-block.js";
import { scrapboxTitleLineClassName } from "../plugins/scrapbox/title.js";
import { scrapboxDefaultPresentationThemeSpec } from "./scrapbox-presentation.js";
import { scrapboxCodeBlockTokenClassName } from "../plugins/scrapbox/code-block.js";
import { scrapboxInlineCodeTokenClassName } from "../plugins/scrapbox/inline-code-highlight.js";

describe("scrapboxDefaultPresentationThemeSpec", () => {
  it("composes the shared code token presentation spec for code blocks and inline code", () => {
    expect(
      scrapboxDefaultPresentationThemeSpec[
        `.${scrapboxCodeBlockTokenClassName}.tok-keyword, .${scrapboxInlineCodeTokenClassName}.tok-keyword`
      ],
    ).toMatchObject({ color: "var(--mbox-code-token-keyword-color, #a626a4)" });
  });
  it("styles inline decorations through their public classes", () => {
    expect(scrapboxDefaultPresentationThemeSpec).toMatchObject({
      [`.${scrapboxStrongClassName}`]: { fontWeight: "var(--mbox-scrapbox-strong-font-weight, 700)" },
      [`.${scrapboxEmphasisClassName}`]: { fontStyle: "italic" },
      [`.${scrapboxStrikethroughClassName}`]: { textDecoration: "line-through" },
    });
  });

  it("scales up higher asterisk levels", () => {
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxStrongLevelClassNamePrefix}-4`]).toMatchObject({
      fontSize: "var(--mbox-scrapbox-strong-level-4-font-size, 1.6em)",
    });
  });

  it("gives inline code a monospace presentation", () => {
    // Code blocks carry their own monospace in their own plugin-local theme
    // (scrapboxCodeBlockPlugin()) instead, so it's not duplicated here.
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxCodeClassName}`]).toMatchObject({
      fontFamily: "var(--mbox-scrapbox-code-font-family, monospace)",
    });
  });

  it("gives code blocks a font size and background, but no fontFamily (that lives in the plugin's own theme instead)", () => {
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxCodeBlockClassName}`]).toMatchObject({
      fontSize: "var(--mbox-scrapbox-code-font-size, 0.9em)",
    });
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxCodeBlockClassName}`]).not.toHaveProperty("fontFamily");
  });

  it("colours links and the quote bar through public classes", () => {
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxLinkClassName}`]).toMatchObject({
      color: "var(--mbox-scrapbox-link-color, #0969da)",
    });
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxQuoteLineClassName}`]).toMatchObject({
      // marginLeft shifts the border 6px right (CodeMirror's own `.cm-line`
      // default left padding) so it lines up with a normal line's text start
      // instead of sitting further left than it; paddingLeft is reduced by
      // the same 6px so the text itself doesn't move.
      marginLeft: "6px",
      borderLeft: "var(--mbox-scrapbox-quote-border, 3px solid #d0d7de)",
      paddingLeft: "calc(0.6em - 6px)",
      // Background is variable-driven too, defaulting to transparent so the
      // previous look is unchanged; a translucent value blends with the
      // selection highlight beneath the quote line.
      background: "var(--mbox-scrapbox-quote-background, transparent)",
    });
  });

  it("underlines external links but not internal page links", () => {
    // Internal `[Page]` links carry only the link class → no underline.
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxLinkClassName}`]).toMatchObject({ textDecoration: "none" });
    // External links additionally carry the url class → underline (declared after
    // the link rule so it wins on equal specificity).
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxUrlClassName}`]).toMatchObject({ textDecoration: "underline" });
  });

  it("enlarges the title line and gives it room before the body", () => {
    expect(scrapboxDefaultPresentationThemeSpec[`.${scrapboxTitleLineClassName}`]).toMatchObject({
      fontSize: "var(--mbox-scrapbox-title-font-size, 1.7em)",
      fontWeight: "var(--mbox-scrapbox-title-font-weight, 700)",
      paddingBottom: "var(--mbox-scrapbox-title-padding-bottom, 0.8em)",
    });
  });
});
