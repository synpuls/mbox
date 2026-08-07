import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxThemeSpec } from "../editor/plugin.js";
import {
  scrapboxCodeClassName,
  scrapboxEmphasisClassName,
  scrapboxStrikethroughClassName,
  scrapboxStrongClassName,
  scrapboxStrongLevelClassNamePrefix,
  scrapboxUnderlineClassName,
} from "../plugins/scrapbox/decoration.js";
import {
  scrapboxCodeBlockClassName,
  scrapboxCodeBlockKeywordClassName,
  scrapboxCodeBlockTokenClassName,
} from "../plugins/scrapbox/code-block.js";
import { scrapboxInlineCodeTokenClassName } from "../plugins/scrapbox/inline-code-highlight.js";
import { scrapboxHashTagClassName, scrapboxLinkClassName, scrapboxUrlClassName } from "../plugins/scrapbox/link.js";
import { scrapboxBulletClassName } from "../plugins/scrapbox/list.js";
import { scrapboxQuoteLineClassName } from "../plugins/scrapbox/quote.js";
import { scrapboxTitleLineClassName } from "../plugins/scrapbox/title.js";
import { codeTokenPresentationThemeSpec } from "./code-token-presentation.js";

const monospace = "var(--mbox-scrapbox-code-font-family, monospace)";

// `[** ..]`, `[*** ..]` ... render progressively larger, like Scrapbox. Level 1
// is plain bold (base size); levels 2-10 scale up, each overridable.
const strongLevelSizes: MboxThemeSpec = {};
for (let level = 2; level <= 10; level += 1) {
  const size = (1 + (level - 1) * 0.2).toFixed(1);
  strongLevelSizes[`.${scrapboxStrongLevelClassNamePrefix}-${level}`] = {
    fontSize: `var(--mbox-scrapbox-strong-level-${level}-font-size, ${size}em)`,
  };
}

/**
 * Optional default presentation for Scrapbox notation, mirroring
 * {@link mboxDefaultPresentationThemeSpec}. Structural behaviour lives in each
 * plugin; this theme only supplies opt-in visual defaults through the public
 * `.mbox-scrapbox-*` classes, every value overridable with a CSS variable.
 */
export const scrapboxDefaultPresentationThemeSpec: MboxThemeSpec = {
  ...codeTokenPresentationThemeSpec([scrapboxCodeBlockTokenClassName, scrapboxInlineCodeTokenClassName]),
  ...strongLevelSizes,
  [`.${scrapboxStrongClassName}`]: {
    fontWeight: "var(--mbox-scrapbox-strong-font-weight, 700)",
  },
  [`.${scrapboxEmphasisClassName}`]: {
    fontStyle: "italic",
  },
  [`.${scrapboxStrikethroughClassName}`]: {
    textDecoration: "line-through",
  },
  [`.${scrapboxUnderlineClassName}`]: {
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  [`.${scrapboxCodeClassName}`]: {
    fontFamily: monospace,
    fontSize: "var(--mbox-scrapbox-code-font-size, 0.9em)",
    background: "var(--mbox-scrapbox-code-background, rgba(175, 184, 193, 0.2))",
    borderRadius: "4px",
    padding: "0.1em 0.3em",
  },
  // Both internal and external links share the colour and pointer; internal
  // `[Page]` links carry only this class and are NOT underlined.
  [`.${scrapboxLinkClassName}`]: {
    color: "var(--mbox-scrapbox-link-color, #0969da)",
    textDecoration: "none",
    cursor: "pointer",
  },
  // External links additionally carry the url class. Declared after the link
  // rule so, at equal specificity, its underline wins for external links while
  // internal page links stay underline-free.
  [`.${scrapboxUrlClassName}`]: {
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  [`.${scrapboxHashTagClassName}`]: {
    color: "var(--mbox-scrapbox-hashtag-color, #0969da)",
    textDecoration: "none",
    cursor: "pointer",
  },
  [`.${scrapboxQuoteLineClassName}`]: {
    // Shift the border 6px right -- CodeMirror's own `.cm-line` default left
    // padding, the same constant list.ts's hang-indent math uses -- and take
    // it back out of the padding, so the border lines up with a normal
    // line's text start instead of sitting 6px further left than it.
    marginLeft: "6px",
    borderLeft: "var(--mbox-scrapbox-quote-border, 3px solid #d0d7de)",
    paddingLeft: "calc(0.6em - 6px)",
    color: "var(--mbox-scrapbox-quote-color, #57606a)",
    // Default `transparent` keeps the previous look. Because the quote class
    // sits on the `.cm-line` element, this background paints *above* CodeMirror's
    // selection layer (drawSelection's `.cm-selectionLayer` is at a negative
    // z-index, behind the content), so an *opaque* value hides the selection
    // highlight underneath. Pass a *translucent* colour (rgba/hsla or a
    // `color-mix(... transparent)`) and the selection blends through it -- the
    // supported way to tint a quote without losing the selection.
    background: "var(--mbox-scrapbox-quote-background, transparent)",
  },
  // fontFamily is NOT here: scrapboxCodeBlockPlugin() carries it in its own
  // theme instead (not because it's structural -- it isn't, unlike table's --
  // but so a bare scrapboxCodeBlockPlugin() keeps its default look without
  // this opt-in presentation theme).
  [`.${scrapboxCodeBlockClassName}`]: {
    fontSize: "var(--mbox-scrapbox-code-font-size, 0.9em)",
    background: "var(--mbox-scrapbox-code-block-background, rgba(175, 184, 193, 0.15))",
  },
  [`.${scrapboxCodeBlockKeywordClassName}`]: {
    color: "var(--mbox-scrapbox-code-block-keyword-color, #57606a)",
  },
  [`.${scrapboxBulletClassName}::after`]: {
    background: "var(--mbox-scrapbox-bullet-color, #57606a)",
  },
  // The title line (a document's first line) is set at ~1.73x a normal line's
  // font size, with ~0.8em of its own font-size as extra room before the body
  // starts -- enough that the title reads as a heading rather than as a large
  // first paragraph. The extra room is
  // line-height/padding, not margin, so it stays part of the line box
  // CodeMirror measures (no focus/unfocus height jump -- the same reasoning
  // as Hatena's heading padding, see hatena's own presentation theme).
  [`.${scrapboxTitleLineClassName}`]: {
    fontSize: "var(--mbox-scrapbox-title-font-size, 1.7em)",
    fontWeight: "var(--mbox-scrapbox-title-font-weight, 700)",
    lineHeight: "var(--mbox-scrapbox-title-line-height, 1.5)",
    paddingBottom: "var(--mbox-scrapbox-title-padding-bottom, 0.8em)",
  },
};

export function scrapboxDefaultPresentationTheme(): Extension {
  return EditorView.theme(scrapboxDefaultPresentationThemeSpec);
}
