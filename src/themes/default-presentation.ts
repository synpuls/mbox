import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxThemeSpec } from "../editor/plugin.js";
import { headingClassNames } from "../plugins/mbox/heading.js";
import { inlineCodeClassName } from "../plugins/mbox/inline-code.js";
import { inlineStyleClassNames } from "../plugins/mbox/inline-style.js";
import { pageLinkClassName } from "../plugins/mbox/page-link.js";
import { quoteClassNames } from "../plugins/mbox/quote.js";
import { codeBlockHighlightClassNames } from "../plugins/mbox/code-block.js";
import { codeTokenPresentationThemeSpec } from "./code-token-presentation.js";
import { headingPresentationThemeSpec } from "./heading-presentation.js";

export const mboxDefaultPresentationThemeSpec: MboxThemeSpec = {
  ...codeTokenPresentationThemeSpec([codeBlockHighlightClassNames.token]),
  ...headingPresentationThemeSpec([
    { level: 1, className: headingClassNames.h1 },
    { level: 2, className: headingClassNames.h2 },
    { level: 3, className: headingClassNames.h3 },
    { level: 4, className: headingClassNames.h4 },
    { level: 5, className: headingClassNames.h5 },
    { level: 6, className: headingClassNames.h6 },
  ]),
  [`.${pageLinkClassName}`]: {
    color: "var(--mbox-page-link-color, #0969da)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  [`.${inlineCodeClassName}`]: {
    fontFamily:
      'var(--mbox-inline-code-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
  },
  [`.${inlineStyleClassNames.em}`]: {
    fontStyle: "var(--mbox-emphasis-font-style, italic)",
  },
  [`.${inlineStyleClassNames.strong}`]: {
    fontWeight: "var(--mbox-strong-font-weight, 700)",
  },
  [`.${inlineStyleClassNames.strike}`]: {
    textDecoration: "var(--mbox-strike-text-decoration, line-through)",
  },
  [`.${quoteClassNames.quote}`]: {
    borderLeft: "var(--mbox-quote-border, 3px solid #d0d7de)",
    paddingLeft: "var(--mbox-quote-padding, 0.6em)",
    color: "var(--mbox-quote-color, #57606a)",
  },
};

export function mboxDefaultPresentationTheme(): Extension {
  return EditorView.theme(mboxDefaultPresentationThemeSpec);
}
