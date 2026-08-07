import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxThemeSpec } from "../editor/plugin.js";
import { gfmHeadingClassNames } from "../plugins/gfm/heading.js";
import { gfmLinkClassName } from "../plugins/gfm/link.js";
import { gfmInlineCodeClassName } from "../plugins/gfm/inline-code.js";
import { gfmCodeBlockClassNames } from "../plugins/gfm/code-block.js";
import { codeTokenPresentationThemeSpec } from "./code-token-presentation.js";
import { headingPresentationThemeSpec } from "./heading-presentation.js";

/**
 * Optional default presentation for the GFM notation, mirroring
 * {@link mboxDefaultPresentationThemeSpec}. Structural behaviour lives in each
 * plugin; this theme only supplies opt-in visual defaults through the public
 * `.mbox-gfm-*` classes, every value overridable with a CSS variable.
 *
 * The values here are mbox's own defaults for this namespace. They are a
 * starting point, not a claim about how any other renderer looks: a host that
 * wants a different appearance sets the CSS variables rather than forking the
 * theme.
 */
export const gfmDefaultPresentationThemeSpec: MboxThemeSpec = {
  ...codeTokenPresentationThemeSpec([gfmCodeBlockClassNames.token]),
  ...headingPresentationThemeSpec([
    { level: 1, className: gfmHeadingClassNames.h1 },
    { level: 2, className: gfmHeadingClassNames.h2 },
    { level: 3, className: gfmHeadingClassNames.h3 },
    { level: 4, className: gfmHeadingClassNames.h4 },
    { level: 5, className: gfmHeadingClassNames.h5 },
    { level: 6, className: gfmHeadingClassNames.h6 },
  ]),
  [`.${gfmLinkClassName}`]: {
    color: "var(--mbox-gfm-link-color, #0969da)",
    textDecoration: "none",
    cursor: "pointer",
  },
  [`.${gfmInlineCodeClassName}`]: {
    fontFamily:
      'var(--mbox-gfm-code-font-family, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace)',
    fontSize: "var(--mbox-gfm-code-font-size, 85%)",
    background: "var(--mbox-gfm-code-background, #818b981f)",
    borderRadius: "var(--mbox-gfm-code-border-radius, 6px)",
    padding: "var(--mbox-gfm-code-padding, 0.2em 0.4em)",
  },
};

export function gfmDefaultPresentationTheme(): Extension {
  return EditorView.theme(gfmDefaultPresentationThemeSpec);
}
