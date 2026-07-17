// The GFM notation bundle: one plugin per feature, gathered into a single array.
// This namespace is real GitHub-Flavored Markdown, parsed by ADAPTING mdast (see
// parser.ts) rather than hand-rolling a parser. Promoted to a full public
// namespace (exported from src/index.ts) alongside mbox and scrapbox; kept
// honest by the test suite and the gfm.html playground either way.
//
// ── SUPPORTED / UNSUPPORTED (audited against https://github.github.com/gfm/) ──
//
// SUPPORTED (each has its own plugin + tests):
//   ATX headings (`#`..`######`)   marker hidden on idle lines, width reserved
//   Setext headings (`===`/`---`)  text line styled; the underline stays a literal
//                                  (mbox has no primitive to hide a whole line)
//   Bullet / ordered list items    nesting carried by the raw indentation
//   Task list items (`[ ]`/`[x]`)  INTERACTIVE checkbox (click dispatches the edit)
//   Blockquotes (incl. `>>`, lazy) lineRange container + width-reserving `>` spacer
//   Fenced code blocks             card: header line, language label, Copy button,
//                                  hidden fences; JS/TS highlight is opt-in
//   Indented code blocks           bare card container (no fences to dress)
//   GFM pipe tables                aligned grid, pipes/padding hidden, align applied
//   Emphasis / strong / strikethrough   content marked, markers hidden on idle lines
//   Inline code (`` `x` ``)        content marked, backticks hidden (count recovered
//                                  from source; mdast omits it)
//   Thematic break (`---`/`***`/`___`)   rendered as a rule widget
//   Hard line break                backslash form hides the `\`; two-space form has
//                                  no visible marker, so nothing to hide
//   Links `[t](u)`, `<url>` autolinks + GFM literals (`www.`/bare URL)   anchor widget
//   Backslash escapes (`\*`)    the `\` hidden on idle lines, escaped char stays
//   Images `![alt](url)`           token (default) / preview via the shared image-kit
//   Footnotes `[^1]` / `[^1]: b`  idle ref collapses to a superscript chip (note as
//                                  tooltip); definitions render smaller and muted with
//                                  their marker kept visible (HyperMD's presentation)
//
// UNSUPPORTED (deliberately out — one-line reason each):
//   HTML blocks & inline HTML      would need an HTML sanitizer/renderer; unsafe seam
//   Reference links/images (`[t][id]`, `[id]: url`)   needs a doc-wide definition map
//   Autolink literals beyond `www.`/`http(s)` (bare email, other schemes)   left raw
//   Entity references (`&amp;`)   HTML-adjacent decoding; raw text stays honest
//   Definition lists / front matter / math   not part of the GFM core spec
import type { MboxPlugin } from "../../editor/plugin.js";
import { gfmCodeBlockHighlightPlugin, gfmCodeBlockPlugin, type GfmCodeBlockHighlightPluginOptions } from "./code-block.js";
import { gfmHeadingPlugin } from "./heading.js";
import { gfmImagePlugin, type GfmImagePluginOptions } from "./image.js";
import { gfmFootnotePlugin } from "./footnote.js";
import { gfmInlinePlugin } from "./inline.js";
import { gfmInlineCodePlugin } from "./inline-code.js";
import { gfmLinkPlugin, type GfmLinkOptions } from "./link.js";
import { gfmListPlugin } from "./list.js";
import { gfmQuotePlugin } from "./quote.js";
import { gfmTablePlugin } from "./table.js";
import { gfmThematicBreakPlugin } from "./thematic-break.js";

// The bundle forwards host options to the plugins that take them — the link plugin's
// URL resolver, the image plugin's render mode, and an opt-in flag for the code-block
// syntax highlighter (kept off by default so the base card carries no lezer weight).
export interface GfmPluginsOptions {
  link?: GfmLinkOptions;
  image?: GfmImagePluginOptions;
  /** `true` adds the code-block syntax highlighter with its zero-dependency
   * JS/TS default; pass a GfmCodeBlockHighlightPluginOptions object instead
   * to also set `languages`/`onLoadError`. Omitted or falsy adds no
   * highlighter at all. */
  codeHighlight?: boolean | GfmCodeBlockHighlightPluginOptions;
}

function getGfmCodeHighlightOptions(
  codeHighlight: GfmPluginsOptions["codeHighlight"],
): GfmCodeBlockHighlightPluginOptions | undefined {
  return codeHighlight === true ? undefined : codeHighlight || undefined;
}

// Deliberately not a re-export barrel: the package entries re-export every
// public symbol straight from the feature modules, and a second export list
// here would only drift out of sync. This file is the bundle, nothing else.
export function gfmPlugins(options: GfmPluginsOptions = {}): MboxPlugin[] {
  return [
    // Code block first: its container styling should sit under the others, and
    // its literal interior is already inline-free from the tree.
    gfmCodeBlockPlugin(),
    ...(options.codeHighlight ? [gfmCodeBlockHighlightPlugin(getGfmCodeHighlightOptions(options.codeHighlight))] : []),
    gfmQuotePlugin(),
    gfmHeadingPlugin(),
    gfmListPlugin(),
    gfmTablePlugin(),
    gfmThematicBreakPlugin(),
    gfmInlinePlugin(),
    gfmFootnotePlugin(),
    gfmInlineCodePlugin(),
    gfmLinkPlugin(options.link),
    gfmImagePlugin(options.image),
  ];
}
