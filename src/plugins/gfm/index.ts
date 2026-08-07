// The GFM notation bundle: feature plugins gathered into a single array.
// This namespace is real GitHub-Flavored Markdown, parsed by ADAPTING mdast (see
// parser.ts) rather than hand-rolling a parser. Promoted to a full public
// namespace (exported from the src/gfm.ts package subpath) alongside mbox,
// scrapbox, and hatena; kept honest by the test suite and the gfm.html playground
// either way.
//
// ── SUPPORTED / UNSUPPORTED (audited against https://github.github.com/gfm/) ──
//
// SUPPORTED (implemented by the bundle plugins and covered by tests):
//   ATX headings (`#`..`######`)   marker hidden on idle lines; no width reserved
//   Setext headings (`===`/`---`)  text line styled; inactive underline line hidden,
//                                  and either active source line restores the whole construct
//   Bullet / ordered list items    nesting carried by the raw indentation
//   Task list items (`[ ]`/`[x]`)  INTERACTIVE checkbox (click dispatches the edit)
//   Blockquotes (incl. `>>`, lazy) lineRange container + width-reserving `>` spacer
//   Fenced code blocks             card: header line, language label, Copy button,
//                                  hidden fences; JS/TS highlight is opt-in
//   GitHub math extension (not GFM core, diverges): ` ```math ` fences, `` $`…`$ ``, `$…$`, and `$$…$$`
//                                  injected renderer; raw code/inline-code presentation when no renderer is supplied
//   Indented code blocks           bare card container (no fences to dress)
//   GFM pipe tables (diverges)     aligned grid, pipes/padding hidden, align applied
//   Emphasis / strong / strikethrough   `em`/`strong`/`del` elements carrying our classes,
//                                  markers hidden on idle lines
//   Inline code (`` `x` ``)        `code` element carrying our class; backticks and, for a
//                                  single-line span, CommonMark's one padding space per
//                                  side are hidden together. Fence count is recovered from
//                                  source, which mdast omits. Multiline spans keep their
//                                  line breaks until the hidden-line model arrives
//   Thematic break (`---`/`***`/`___`)   rendered as a rule widget
//   Hard line break                backslash form hides the `\`; two-space form has
//                                  no visible marker, so nothing to hide
//   Links `[t](u)`, `<url>` autolinks + GFM literals (`www.`/bare URL)   anchor widget (diverges)
//   Backslash escapes (`\*`)    the `\` hidden on idle lines, escaped char stays
//   Images `![alt](url)`           preview (DEFAULT, fetches the URL) / token via the
//                                  shared image-kit (diverges on size, not on rendering)
//   GitHub footnote extension (not GFM core, diverges): `[^1]` / `[^1]: b`   idle ref collapses to a
//                                  superscript chip (note as tooltip); definitions render smaller and muted with their marker kept visible (HyperMD's presentation)
//
// RENDERS, BUT NOT AS GITHUB DOES (measured against POST api.github.com/markdown).
// Inline math display, link labels and footnote definition bodies were
// on this list and are fixed; what stays is either waiting on the project owner
// or waiting its turn:
//   Images, sizing                 `renderMode` defaults to `preview` here, as GitHub
//                                  renders an `<img>` (the other notations still default
//                                  to `token`). What still differs is the SIZE: we set no
//                                  `max-width` outside a table cell, where GitHub uses
//                                  `max-width: 100%`. Sizing an image in GFM needs raw
//                                  `<img>`, which this notation does not accept
//   Images in a table cell         mbox's own invention, not GitHub's: a cell
//                                  holding an image claims a minimum column
//                                  (32 grid units by default, `imageMinimumColumnWidth`),
//                                  and the picture is capped to the cell and to
//                                  `--mbox-gfm-table-image-max-height` so the
//                                  table never scrolls sideways. GitHub's table
//                                  is auto-layout and needs none of this.
//                                  This is also the ONLY place the library sizes
//                                  an image -- see the entry above
//   Footnote references            GitHub numbers them and collects the notes into a
//                                  section at the end with backlinks; ours is an inline
//                                  chip showing the label, with the note as a tooltip
//   External link attributes       GitHub emits `rel="nofollow"` and no target; we emit
//                                  `target="_blank" rel="noreferrer"` on absolute http(s).
//                                  DELIBERATE, decided by the project owner: this
//                                  renders an editor, and following a link in the
//                                  same tab would leave unsaved work behind. The
//                                  cost is no `nofollow`; a host that needs one
//                                  adds it. The project owner chose to keep this
//                                  deliberate difference for the reason above
//   Inline code element            GitHub adds `class="notranslate"`; we do not
//   `$$…$$` next to emphasis       GitHub is not self-consistent here (`*$$K$$*`
//                                  emits a symbol the input does not carry,
//                                  `a *$$K$$* b` drops the math and keeps the
//                                  emphasis, `**$$K$$**` loses the emphasis).
//                                  mbox keeps the math in all three. Declining
//                                  to match this was the implementer's call,
//                                  not the owner's. The `$…$` form IS matched:
//                                  an italic anywhere above the run cancels it,
//                                  bold and strikethrough do not
//   Link-wrapped image, row height  `[![alt](img)](link)` renders as `<a><img></a>`
//                                  and, in a table cell, reserves a column like
//                                  any image. But its row does NOT keep its
//                                  height while being edited. That measure figure
//                                  comes from the image plugin, which works from
//                                  the parser's image list -- and an image inside
//                                  a link label is not in it, because the link owns
//                                  the run. (The table cell's own reservation is a
//                                  separate flag and DOES count it.) A limitation,
//                                  not a chosen shape
//   Multiline link or image        `[a\nb](url)` and `![a\nb](url)` stay as raw
//                                  source, both idle and active. GitHub renders
//                                  one anchor containing a `<br>`; a single
//                                  replace cannot span a line break, so matching
//                                  that shape needs the widget-plus-hidden-lines
//                                  model.
//                                  Interim, and deliberate: the same rule holds
//                                  for every multiline inline notation in the
//                                  shared kits. It used to THROW out of
//                                  createEditorView; that is fixed
//   Block content in a footnote    lists, quotes and code blocks inside a definition stay
//                                  raw. Rendering them puts bullets and a Copy button
//                                  inside the muted footnote styling — a scope question
//                                  for the owner, not an oversight
//   Semantic inline tags elsewhere GFM emits `em`/`strong`/`del`/`code`; scrapbox, hatena
//                                  and the mbox notation still emit spans. Each has its
//                                  own upstream to read first
//
// UNSUPPORTED (deliberately out — one-line reason each):
//   HTML blocks & inline HTML      would need an HTML sanitizer/renderer; unsafe seam
//   Reference links/images (`[t][id]`, `[id]: url`)   needs a doc-wide definition map
//   Autolink literals beyond `www.`/`http(s)` (bare email, other schemes)   left raw
//   Entity references (`&amp;`) in body text   left raw — but NOT universally. mdast's
//                                  decoded value reaches five places, measured: a code
//                                  fence's language, a link's destination (its *label*
//                                  stays raw), an image's alt and its src, and a
//                                  footnote's label
//   Definition lists / front matter   not part of the GFM core spec
import type { MboxPlugin } from "../../editor/plugin.js";
import { gfmCodeBlockHighlightPlugin, gfmCodeBlockPlugin, type GfmCodeBlockHighlightPluginOptions } from "./code-block.js";
import { gfmHeadingPlugin } from "./heading.js";
import { gfmImagePlugin, type GfmImagePluginOptions } from "./image.js";
import { gfmFootnotePlugin } from "./footnote.js";
import { gfmInlinePlugin } from "./inline.js";
import { gfmInlineCodePluginExcludingMath, gfmInlineCodePlugin } from "./inline-code.js";
import { gfmLinkPlugin, type GfmLinkOptions } from "./link.js";
import { gfmListPlugin } from "./list.js";
import { gfmMathPlugin, type GfmMathPluginOptions } from "./math.js";
import { gfmQuotePlugin } from "./quote.js";
import { gfmTablePlugin, type GfmTablePluginOptions } from "./table.js";
import { gfmThematicBreakPlugin } from "./thematic-break.js";

// The bundle forwards host options to the plugins that take them — the link plugin's
// URL resolver, the image plugin's render mode, the injected math renderer, the
// table plugin's layout options, and an opt-in flag for the code-block syntax
// highlighter (kept off by default so the base card carries no lezer weight).
export interface GfmPluginsOptions {
  link?: GfmLinkOptions;
  image?: GfmImagePluginOptions;
  /** `true` adds the code-block syntax highlighter with its zero-dependency
   * JS/TS default; pass a GfmCodeBlockHighlightPluginOptions object instead
   * to also set `languages`/`onLoadError`. Omitted or falsy adds no
   * highlighter at all. */
  codeHighlight?: boolean | GfmCodeBlockHighlightPluginOptions;
  math?: GfmMathPluginOptions;
  /** Table layout options -- currently the column a cell with an image claims. */
  table?: GfmTablePluginOptions;
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
  const mathRendererInjected = options.math?.render !== undefined;
  return [
    // Code block first: its container styling should sit under the others, and
    // its literal interior is already inline-free from the tree.
    gfmCodeBlockPlugin({ excludeMathFences: mathRendererInjected }),
    ...(options.codeHighlight ? [gfmCodeBlockHighlightPlugin(getGfmCodeHighlightOptions(options.codeHighlight))] : []),
    ...(mathRendererInjected ? [gfmMathPlugin(options.math)] : []),
    gfmQuotePlugin(),
    gfmHeadingPlugin(),
    gfmListPlugin(),
    gfmTablePlugin(options.table),
    gfmThematicBreakPlugin(),
    gfmInlinePlugin(),
    gfmFootnotePlugin(),
    mathRendererInjected ? gfmInlineCodePluginExcludingMath() : gfmInlineCodePlugin(),
    gfmLinkPlugin(options.link),
    gfmImagePlugin(options.image),
  ];
}
