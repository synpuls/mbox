import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxThemeSpec } from "../editor/plugin.js";
import { hatenaHeadingClassNames } from "../plugins/hatena/heading.js";
import { hatenaLinkClassName } from "../plugins/hatena/link.js";
import { hatenaPreClassName } from "../plugins/hatena/pre.js";
import { hatenaSuperPreClassName, hatenaSuperPreLangClassName } from "../plugins/hatena/super-pre.js";
import { hatenaSuperPreTokenClassName } from "../plugins/hatena/super-pre.js";
import { codeTokenPresentationThemeSpec } from "./code-token-presentation.js";
import { headingPresentationThemeSpec } from "./heading-presentation.js";

const literalBlockMonospace = "var(--mbox-hatena-literal-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)";

function literalBlockPresentation(className: string, background: string): MboxThemeSpec {
  return {
    [`.${className}`]: { fontFamily: literalBlockMonospace, background },
    [`.${className}-first`]: { borderTopLeftRadius: "4px", borderTopRightRadius: "4px" },
    [`.${className}-last`]: { borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px" },
  };
}

/**
 * Optional default presentation for the Hatena notation, mirroring
 * {@link mboxDefaultPresentationThemeSpec}. Structural behaviour lives in each
 * plugin; this theme only supplies opt-in visual defaults through the public
 * `.mbox-hatena-*` classes, every value overridable with a CSS variable.
 */
export const hatenaDefaultPresentationThemeSpec: MboxThemeSpec = {
  ...codeTokenPresentationThemeSpec([hatenaSuperPreTokenClassName]),
  ...headingPresentationThemeSpec([
    { level: 3, className: hatenaHeadingClassNames.h3 },
    { level: 4, className: hatenaHeadingClassNames.h4 },
    { level: 5, className: hatenaHeadingClassNames.h5 },
  ]),
  [`.${hatenaLinkClassName}`]: {
    color: "var(--mbox-hatena-link-color, #2563eb)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  // TRANSLUCENT on purpose: these classes sit on `.cm-line` elements, which
  // paint *above* CodeMirror's selection layer (drawSelection's
  // `.cm-selectionLayer` is at a negative z-index, behind the content) -- an
  // opaque background hides the selection highlight underneath. A translucent
  // tint lets the selection blend through; the same rule the scrapbox quote
  // background documents. Values composite on white to the previous opaque
  // defaults (#f8fafc / #f1f5f9).
  ...literalBlockPresentation(hatenaPreClassName, "var(--mbox-hatena-pre-background, rgba(148, 163, 184, 0.06))"),
  ...literalBlockPresentation(
    hatenaSuperPreClassName,
    "var(--mbox-hatena-superpre-background, rgba(148, 163, 184, 0.12))",
  ),
  [`.${hatenaSuperPreLangClassName}`]: {
    color: "var(--mbox-hatena-superpre-lang-color, #64748b)",
    fontFamily: "var(--mbox-hatena-superpre-lang-font-family, ui-sans-serif, system-ui, sans-serif)",
    fontSize: "var(--mbox-hatena-superpre-lang-font-size, 0.8em)",
    fontWeight: "var(--mbox-hatena-superpre-lang-font-weight, 600)",
  },
};

export function hatenaDefaultPresentationTheme(): Extension {
  return EditorView.theme(hatenaDefaultPresentationThemeSpec);
}
