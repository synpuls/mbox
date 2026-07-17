import katex from "katex";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  createEditorState,
  createMboxExtension,
  editorPresentationTheme,
} from "mbox";
import { scrapboxDefaultPresentationTheme, scrapboxPlugins, type ScrapboxRecommend } from "mbox/scrapbox";

// The same placeholder image the other demos use (imported as a Vite asset so
// the path respects the build's `base`), but Scrapbox image notation only
// recognises an absolute `http(s)://…` URL (see `imageUrl` in
// scrapbox/inline.ts), so the served path won't render as-is — resolve it
// against the current page at load time.
import sampleImageURL from "./sample-image.png";
const demoImageURL = new URL(sampleImageURL, location.href).href;

// Scrapbox notation. Click into a line to reveal its raw syntax; other lines
// render the implemented notation.
export const initialScrapboxDocument = `Scrapbox notation demo
 Click a line to reveal its raw syntax

Indentation and lists
 A space-indented bullet
  A deeper nested bullet
1. Ordered list item
2. Second item

Decoration
 [* bold] / [** bigger] / [**** biggest]
 [/ italic] / [- strikethrough] / [/* bold italic]
 [[bold]]

Links
 [page link]
 [https://example.com external link] and [external link (reversed) https://example.com]
 #hashtag
 Icon notation: [demo-user.icon]

Image
 [${demoImageURL}]

Quote and inline code
> An example quote
 \`inline code\` and \`describe User do\`

code:hello.js
 function greet(name) {
   const message = "hello " + name
   // an example comment line
   console.log(message)
 }

code:greeter.rb
 class Greeter
   def initialize(prefix: "hello")
     @prefix = prefix
   end
 
   def call(name)
     "#{@prefix}, #{name}".upcase
   end
 end
 
 %w[ruby mbox].each { |name| puts Greeter.new.call(name) }

table:sample
 Header A	Header B
 abc	def
 12345	6789

Command line
 $ git reset --hard HEAD^
 % cp a.txt b.txt

Formula
 [$ \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}]
`;


// KaTeX-backed formula renderer for the `[$ … ]` notation. The library core has
// no math engine — it only exposes the `render` hook — so the demo supplies one.
// `renderToString` avoids touching the DOM tree directly, so it works the same
// in the browser and in the happy-dom test environment; `throwOnError: false`
// degrades a malformed expression to an inline error instead of crashing.
//
// `\displaystyle` typesets in display style while staying inline (not block):
// KaTeX then gives each construct its full, readable height — fractions get
// full-size numerator/denominator instead of the cramped text-style default —
// so no `\frac`-sniffing or manual height guessing is needed.
// Stand-in for a consumer's page index: prefix-match a fixed title list. A real
// app would fetch titles and rank them; the notation is ignored here.
const demoTitles = ["demo-user", "readme", "reference", "roadmap", "recipes", "Release Notes"];
const recommendDemoTitles: ScrapboxRecommend = (query) =>
  demoTitles.filter((title) => title.toLowerCase().startsWith(query.toLowerCase())).map((title) => ({ title }));

export function demoRenderFormula(expression: string): HTMLElement {
  const element = document.createElement("span");
  element.className = "demo-formula";
  element.innerHTML = katex.renderToString(`\\displaystyle ${expression}`, { throwOnError: false });
  return element;
}

const demoTheme = EditorView.theme({
  // Tint quote lines so the feature is visible in the demo. The value is kept
  // *translucent* on purpose: the quote background paints above CodeMirror's
  // selection layer, so a translucent tint lets a selection blend through it
  // instead of hiding it -- select the quote lines below to see the two colours
  // mix. An opaque value here would cover the selection entirely.
  "&": {
    "--mbox-scrapbox-quote-background": "rgba(255, 212, 59, 0.2)",
  },
  // KaTeX supplies its own fonts/spacing; keep the wrapper neutral. inline-block
  // lets the small all-round padding actually reserve space (vertical padding is
  // ignored on a plain inline box), giving the formula a little breathing room.
  ".demo-formula": { display: "inline-block", fontSize: "1.1em", padding: "0.25em 0.4em" },
  ".mbox-scrapbox-command-line": {
    fontFamily: "ui-monospace, Menlo, monospace",
    background: "rgba(175, 184, 193, 0.12)",
  },
  ".mbox-scrapbox-command-prompt": { color: "#8250df", fontWeight: "600" },
  // Mirrors mbox/gfm's own code-block copy button and language label look
  // (see demos/styles.css's .mbox-code-copy-button/.mbox-gfm-code-copy-button),
  // kept here instead since every other scrapbox-specific visual choice in
  // this demo already lives in this theme rather than the shared stylesheet.
  ".mbox-scrapbox-code-block-copy-button": {
    background: "rgba(255, 255, 255, 0.56)",
    border: "1px solid rgba(102, 112, 133, 0.18)",
    borderRadius: "4px",
    color: "#667085",
    cursor: "pointer",
    float: "right",
    font: "inherit",
    fontSize: "12px",
    marginLeft: "8px",
    marginTop: "1px",
    padding: "0 5px",
  },
  ".mbox-scrapbox-code-block-copy-button:hover": {
    background: "rgba(255, 255, 255, 0.76)",
    color: "#344054",
  },
  ".mbox-scrapbox-code-block-language-label": {
    color: "#344054",
    fontWeight: "600",
  },
  ".mbox-scrapbox-table-opener": { color: "#57606a" },
  // Mirrors mbox/gfm's own table grid look (see demos/styles.css's
  // .mbox-table-cell/.mbox-gfm-table-cell), kept here instead since every
  // other scrapbox-specific visual choice in this demo already lives in this
  // theme rather than the shared stylesheet.
  ".mbox-scrapbox-table-cell": {
    boxSizing: "border-box",
    display: "inline-block",
    "--mbox-scrapbox-table-column-extra-width": "5ch",
    width: "calc(var(--mbox-table-kit-column-width) + var(--mbox-scrapbox-table-column-extra-width))",
    maxWidth: "var(--mbox-table-kit-cell-max-width, 100%)",
    background: "rgba(248, 250, 252, 0.58)",
    boxShadow: "inset 0 0 0 1px rgba(203, 213, 225, 0.76)",
    overflowWrap: "anywhere",
    paddingInline: "1ch",
    verticalAlign: "top",
  },
  ".mbox-scrapbox-table-raw-cell": {
    background: "transparent",
    boxShadow: "none",
    display: "inline",
    maxWidth: "none",
    overflowWrap: "normal",
    paddingInline: "0",
    width: "auto",
  },
  ".mbox-scrapbox-table-rendered": {
    alignItems: "stretch",
    display: "flex",
    whiteSpace: "pre-wrap",
  },
  ".mbox-scrapbox-table-rendered .mbox-scrapbox-table-cell": {
    flex: "0 1 calc(var(--mbox-table-kit-column-width) + var(--mbox-scrapbox-table-column-extra-width))",
    minWidth: "0",
  },
  ".mbox-scrapbox-table-header .mbox-scrapbox-table-cell": {
    background: "rgba(241, 245, 249, 0.7)",
    fontWeight: "600",
  },
  // Sizing/alignment comes from the link plugin's core theme (keeps the icon at
  // one text em with no layout shift on focus); the demo only rounds the avatar.
  ".mbox-scrapbox-icon-image": { borderRadius: "50%" },
  // Size the preview *figure*, not the img: a percentage max-width on the img
  // poisons the inline-block figure's shrink-to-fit so the figure reserves the
  // full line width, which pushes the image below the list bullet. Capping the
  // figure and letting the img fill it (max-width: 100%) keeps the image beside
  // the bullet — the same convention the markdown image plugin uses.
  ".mbox-scrapbox-image-preview": { maxWidth: "min(100%, 320px)" },
  ".mbox-scrapbox-image-element": { maxWidth: "100%" },
});

export function createScrapboxDemoEditorState() {
  return createEditorState({
    activeLine: true,
    ariaLabel: "Scrapbox demo editor",
    doc: initialScrapboxDocument,
    extensions: [
      lineNumbers(),
      createMboxExtension({
        plugins: scrapboxPlugins({
          image: { renderMode: "preview" },
          codeHighlight: { languages: "all" },
          inlineCodeHighlight: true,
          formula: { render: demoRenderFormula },
          titleLine: true,
          // The consumer owns the candidate index and ranking; here we just
          // prefix-match a fixed demo title list for both `[ … ]` and `#tag`.
          complete: { recommend: recommendDemoTitles },
          // The library only hands over the raw name; the consumer owns every
          // URL. `iconUrl` builds the avatar image, `pageUrl` the link href —
          // both from the raw text and reused across notations. A real host
          // would map the name to its avatar endpoint (on scrapbox.io:
          // `/api/pages/<project>/<name>/icon`); the demo has no backend, so
          // it maps names to local files instead -- Vite resolves this dynamic
          // `new URL(..., import.meta.url)` to the bundled ./icons/*.png
          // assets. Unknown names 404 and fall back to the alt text.
          link: {
            iconUrl: (iconName) => new URL(`./icons/${iconName}.png`, import.meta.url).href,
            pageUrl: (pageName) => `./${pageName}`,
          },
        }),
      }),
      demoTheme,
      editorPresentationTheme({ minHeight: "560px" }),
      scrapboxDefaultPresentationTheme(),
    ],
  });
}
