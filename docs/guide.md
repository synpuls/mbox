# Guide

Everything beyond the README's quick start: integration details, options, plugin authoring, styling, and troubleshooting.

## Install notes

`@codemirror/state`, `view`, `commands`, `language`, `autocomplete`, and `search` are declared as peer dependencies. npm 7+ installs peer dependencies by default. pnpm does too when `autoInstallPeers` is enabled (the default); Yarn requires the consuming project to provide them. mbox's public types (`Extension`, `EditorState`, `EditorView`, etc.) come from these packages, and your app will almost certainly use them directly too, to pass its own extensions or read the resulting state.

The package is ESM-only (`require()` is not supported), and creating an editor touches the DOM — in an SSR framework (Next.js etc.), construct the editor in a client-only component or effect.

## Browser testing and compatibility

The layout suite runs on every change against Playwright's bundled desktop Chromium, Firefox, and WebKit on Ubuntu. mbox is expected to work in current desktop Chrome, Edge, Firefox, and Safari. Edge and Safari have engine-level coverage through Chromium and WebKit; native Edge and Safari on macOS are not run in CI. Please report compatibility issues with the browser name and version.

Mobile browsers and older browser versions are outside the supported range before 1.0. Consumers need Node.js 18 or newer to install and import the package, and a DOM to create an editor. Maintainers use Node.js 20.19 or newer for the development toolchain; CI also verifies that the built package imports on Node.js 18.

## Reacting to edits

To react to edits, pass an update listener like any CodeMirror app:

```ts
import { EditorView } from "@codemirror/view";
import { createGfmEditor } from "@synpuls/mbox/gfm";

createGfmEditor({
  parent: document.querySelector("#editor")!,
  extensions: [
    EditorView.updateListener.of((update) => {
      if (update.docChanged) save(update.state.doc.toString());
    }),
  ],
});
```

In React, create the view in an effect and destroy it in the cleanup:

```tsx
function Editor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = createGfmEditor({ parent: ref.current!, doc: "# Hello" });
    return () => view.destroy();
  }, []);
  return <div ref={ref} />;
}
```

## Choosing a notation

Each notation lives at its own sub-path with a matching `createXxxEditor` / `createXxxEditorState` pair. You never need to look up a notation string.

```ts
import { createGfmEditor } from "@synpuls/mbox/gfm";           // GitHub Flavored Markdown
import { createScrapboxEditor } from "@synpuls/mbox/scrapbox"; // Scrapbox notation
import { createHatenaEditor } from "@synpuls/mbox/hatena";     // Hatena notation
import { createMboxEditor } from "@synpuls/mbox";              // mbox's own notation
```

`createXxxEditorState` returns just the `EditorState` (for when you want to assemble the `EditorView` yourself). `createXxxEditor` additionally takes a `parent` and returns a fully assembled `EditorView`.

If you need to choose a notation at runtime rather than at import time, build your own small dispatch table from these four functions.

The GFM layer covers the practical core of the spec — headings, lists, task lists, blockquotes, code blocks, tables, emphasis, links, images, footnotes. HTML and reference links (`[text][id]`) are deliberately not rendered and stay as raw text. Entity references stay raw in body text and link labels, although their decoded values are used where the parser supplies semantics such as a link destination or image source.

### Scrapbox icons

Scrapbox icon notation supports `[name.icon]` and repeated forms
`[name.icon*N]` / `[name.iconxN]`, where `N` is 1 through 20. `[[name.icon]]`
uses the larger strong-icon presentation; repetition also works inside that
form. Counts outside the range, including zero and leading-zero counts, remain
ordinary internal links. More than 20 deliberately remains a link rather than
being silently truncated.

In Scrapbox notation, `.icon` is lowercase-only: `[name.ICON]` and
`[name.Icon]` remain ordinary internal links. The repeat separator `x` is also
lowercase-only, so `[name.iconX2]` is not an icon. These rules apply to the
Scrapbox notation, not to mbox's separate native notation.

Hosts can adjust the strong-icon multiplier with
`--mbox-scrapbox-icon-strong-scale`; mbox's default is `3`. This is mbox's
chosen default, not a measured upstream multiplier.

### Scrapbox hashtags

A run made only of `#` characters is plain text, not a hashtag: `##`, `###`,
and `#####` do not link. A token is a hashtag when it starts with `#` and
contains at least one other character, so `##a`, `#a#`, and `###a` are tags.
Whitespace still ends the token, therefore `# tag` is plain text.

### Scrapbox image URLs

Extension-based single-bracket image notation classifies its image token
lexically: it starts with `http://` or `https://` and ends in `.png`, `.jpg`,
`.jpeg`, `.gif`, `.svg`, or `.webp` (case-insensitive), optionally followed by
a non-empty query. An opening `[` is allowed inside that image token and the
first `]` ends the notation, so `[https://placehold.jp/150[x150.png]` is an
image. The short extension-only form `[https://.png]` is also classified as an
image; this does not assert that the URL is fetchable. These allowances do not
apply to a linked image's non-image URL, ordinary external links, or bare URLs.

Gyazo also has an extension-less image shorthand. A URL is image notation when
it is bracketed and has the form `http(s)://gyazo.com/<32桁hex>`, optionally
followed by `/raw`. Only the main `gyazo.com` host is supported: subdomains such
as `i.gyazo.com` are ordinary links. Without brackets, the same URL is also an
ordinary link.

Both `[画像URL ページURL]` and `[[画像URL ページURL]]` produce an ordinary
image whose source is the first URL and whose click destination is the second
URL. The double brackets do not give this two-element form the strong-image
presentation. A one-element `[[画像URL]]` remains a strong image, while a
one-element `[画像URL]` has no click destination. The unobserved link-first
double-bracket form `[[ページURL 画像URL]]` is not image notation.

### GFM images and how wide they get

**The GFM namespace renders images by default** (`renderMode: "preview"`), matching GitHub. That means an editor built with no options **fetches the image URLs in its document** — GitHub proxies those requests, mbox does not, so the reader's browser contacts whatever host the document names. Pass `image: { renderMode: "token" }` to get alt text and no network instead. The mbox and Scrapbox namespaces still default to `"token"`; only GFM changed, because only GFM is GitHub's notation.

mbox does **not** put a width limit on an ordinary GFM image. With no CSS of your own a 900px image occupies 900px. Sizing an image is the host's job; the library declines it so that a host which wants a different rule does not have to fight one.

**A table cell is the single exception.** mbox lays a table out as a fixed grid sized from each cell's text, and an image has no character width — so left alone, a photograph is squeezed into a column sized for its alt text and shows nothing. Two rules apply inside a cell, and only inside a cell:

- a cell holding an image claims a **minimum column width of 32 grid units**, so there is room for a picture worth looking at
- the picture is capped to the cell's width and to `--mbox-gfm-table-image-max-height` (256px by default), shrinking rather than cropping, so the table stays on screen and never scrolls sideways

Both are mbox's own inventions. GitHub's table is an auto-layout HTML table and does none of this.

`gfmTablePlugin({ imageMinimumColumnWidth })`, also reachable as `gfmPlugins({ table: { imageMinimumColumnWidth } })`, changes the reservation. The unit is a grid step, not a character and not a pixel; fractions are kept as given. `0` reserves nothing, which returns an image cell to being as narrow as its alt text. A value that is not a finite number at or above zero falls back to 32 **without throwing** — a plugin constructor that throws takes the whole editor down over a layout preference.

Consequences worth knowing before you turn previews on:

- **a small icon claims the same wide column as a photograph.** The reservation is made before anything is loaded, and an image tag carries no dimensions, so it cannot depend on the real size. Lower the option if your tables are mostly icons.
- **rows change height when images finish loading**, which moves scroll position and height estimates.
- **several images in one cell reserve once**, not once each.
- an image inside a link label reserves too. It is drawn inside the link's anchor rather than on its own, but it occupies the cell the same way. (It reserved nothing while such an image was still flattened to its alt text.)

### GFM parser code-block ranges

`GfmCodeBlock.content` is the continuous raw source interior of a code block, including any container prefixes and fence indentation. It is therefore not necessarily the range that spells the normalized mdast `value`. Consumers that need source ranges corresponding to `value` should use `contentSegments`: joining their `text` fields with newlines exactly reproduces `value`, including empty lines.

### GFM math

Pass `math: { render }` to `gfmPlugins` when a fenced `math` block or GitHub math form (`` $`x^2`$ ``, `$x^2$`, or `$$x^2$$`) should use a renderer such as KaTeX or MathJax. A single-dollar form never crosses a physical source line; `$$…$$` may span lines when its delimiters occupy a display-math line. Ambiguous dollar runs remain literal: escaped dollars, whitespace-adjacent single-dollar runs, alphanumeric-adjacent runs, and list-item runs. Emphasis around a `$…$` run is more particular than "already interpreted as emphasis" suggests, and mbox follows GitHub here: **bold and strikethrough let the math through, italic does not**, at any nesting depth. `**$K$**`, `~~$K$~~` and `****$K$****` are math; `*$K$*`, `***$K$***` and `*a **$K$** b*` are not, because an italic is somewhere above the run. Emphasis merely *next to* the run changes nothing (`*x* $K$` is math), and emphasis *inside* it still cancels it (`$a*b*c$` is not). The `$$…$$` form is deliberately not matched to GitHub in combination with emphasis -- GitHub is not self-consistent there -- so mbox keeps the math in all such cases. Without a renderer, the backtick form remains ordinary inline code and bare dollar source remains visible. The renderer's returned DOM is trusted input: create it from trusted content or sanitize it in the renderer. mbox does not apply a generic sanitizer, because it could damage valid renderer output such as MathML.

Use the `gfmPlugins()` bundle for math. It coordinates the math replacement with inline-code decoration. If you assemble public individual plugins yourself, `gfmMathPlugin({ render })` together with `gfmInlineCodePlugin()` produces overlapping decorations for recognized inline math; the rendered math still wins visually, but the combination is not supported. The exclusion helper is intentionally internal to keep the public API small.

By default mbox supplies the TeX source as a visually hidden accessible equivalent. If the renderer already provides an accessible mathematical equivalent, set `render.providesAccessibleMath = true`; this declares that capability and avoids announcing both representations. If the renderer throws, mbox keeps the editor rendering and visibly falls back to the TeX source.

In GFM tables, column widths are calculated from the normalized TeX source, not from arbitrary renderer DOM. A renderer with a tall or wide inline result can therefore increase the rendered row height or overflow its source-sized cell; mbox deliberately does not crop mathematical output. Keep table math compact, or supply host CSS appropriate to your renderer.

A pipe table inside a blockquote splits into columns normally: the `> ` prefix is not a cell, at any nesting depth. Focusing one of its lines restores the whole physical line, quote marker included.

### Scrapbox formulas

Pass `formula: { render }` to `scrapboxPlugins` when Scrapbox `[$ … ]` formulas or Cosense's block-formula `code:tex` / `code:latex` blocks should use a renderer such as KaTeX or MathJax. A block formula replaces its opener with a block widget and hides its more-indented body lines while inactive; focusing any line restores the complete raw source. Its expression joins the body lines after removing the opener's indent plus their one required extra indent, preserving deeper indentation. These two lower-case file names are formulas, not code cards: mbox shows neither a language label nor a Copy button and does not send them to the code highlighter. Without a renderer, mbox displays the formula's raw expression. The renderer's returned DOM is trusted input: create it from trusted content or sanitize it in the renderer. mbox does not apply a generic sanitizer, because it could damage valid renderer output such as MathML.

For an inline formula, mbox stays on the same line and gives the first space followed by `]` priority as its terminator. If the line has no such ` ]`, the first `]` terminates the formula.

By default mbox supplies the TeX source as a visually hidden accessible equivalent. If the renderer already provides an accessible mathematical equivalent, set `render.providesAccessibleMath = true`; this declares that capability and avoids announcing both representations. If the renderer throws, mbox keeps the editor rendering and visibly falls back to the TeX source.

### GFM table row width

A body row shorter than the header displays empty cells only while the row is inactive; no text is inserted into the source. A body row longer than the header renders only the header-count cells while inactive, matching GitHub; its remaining physical source is hidden as one editable tail and returns in full when that row becomes active. The idle ARIA grid and column-width calculation therefore include only participating cells.

A link whose label is an image — `[![alt](img)](link)`, ordinary CommonMark — renders as a picture inside the anchor, so clicking it follows the **link's** destination, not the image's. The picture appears only when images render as pictures at all; with `image: { renderMode: "token" }` the label stays as alt text. A destination the allowlist rejects still shows the picture, but not as a clickable anchor.

Inside a GFM table cell such a link reserves a column exactly as a bare image does, and the picture is capped to the cell the same way. One difference, deliberate and currently unfixed: **the row does not keep its height while that line is being edited.** A bare image in a cell holds its row open with a hidden measure figure. That figure comes from the image plugin, which works from the parser's list of images -- and an image inside a link label is not in it, because the link owns the whole run. The link plugin draws the picture but builds no measure figure of its own. The row shrinks when the caret arrives and grows back when it leaves.

An absolute `http(s)` link opens in a **new tab** and sends no referrer: mbox emits `target="_blank" rel="noreferrer"`. Relative, protocol-relative and `mailto` destinations get neither attribute and follow in the same tab. This deliberately differs from GitHub, which emits `rel="nofollow"` and no `target`: mbox renders an editor, and following a link in the same tab would take the reader away from unsaved work. mbox emits no `nofollow`, so a host that wants one adds it itself.

Rendered GFM links allow relative URLs and the `http`, `https`, `mailto`, and `tel` protocols by default. Other explicit protocols render as non-link text. Hosts can opt into a custom protocol with `link: { additionalAllowedProtocols: ["obsidian"] }`; entries must be ASCII scheme names without a colon. Explicit `javascript`, `vbscript`, `data`, `file`, and `blob` destinations are always blocked, including when returned by `linkUrl`, and cannot be re-enabled. Relative destinations still resolve against the embedding document's base URL when followed.

## Passing your own CodeMirror extensions

Every `createXxxEditor` / `createXxxEditorState` accepts `extensions`, which are added alongside mbox's own setup.

```ts
import { EditorView } from "@codemirror/view";
import { createGfmEditor } from "@synpuls/mbox/gfm";

createGfmEditor({
  parent: document.querySelector("#editor")!,
  doc: "# Hello",
  extensions: [EditorView.lineWrapping],
});
```

## Read-only display

Pass `readOnly: true` for a non-editing, always-rendered display mode: edits
are rejected, the editor never takes focus, and raw syntax never appears. Text
stays selectable and copyable. This is not a security boundary: it supplies no
input-size limit, CPU isolation, URL/network policy, or worker execution.

```ts
createGfmEditor({
  parent: document.querySelector("#viewer")!,
  doc: "# Hello",
  readOnly: true,
});
```

This is more than CodeMirror's `EditorState.readOnly` on its own, which still lets the editor take focus — and a focused line reveals its raw syntax.

## Accessibility

Every editor exposes CodeMirror's multiline `textbox` role and has the default accessible name `Text editor`. Pass `ariaLabel` when a page has more than one editor so each can be distinguished.

```ts
createGfmEditor({ parent: document.querySelector("#article-editor")!, ariaLabel: "Article body" });
createGfmEditor({ parent: document.querySelector("#notes-editor")!, ariaLabel: "Editorial notes" });
```

When a visible heading already names the editor, keep that relationship in a normal CodeMirror extension. `aria-labelledby` takes precedence over the default `aria-label`. Use `ariaLabel` or a host-provided `aria-label` only when there is no `aria-labelledby` relationship.

```ts
createGfmEditor({
  parent: document.querySelector("#editor")!,
  extensions: [EditorView.contentAttributes.of({ "aria-labelledby": "article-heading" })],
});
```

## Writing your own plugin

An `MboxPlugin` is just data. It carries arbitrary CodeMirror `extensions`, a `keymap`, a `theme`, and a `decorations` function that receives the current `MboxDecorationContext` and returns decoration specs. Pass it through `extraPlugins`.

```ts
import type { MboxPlugin } from "@synpuls/mbox";
import { createGfmEditor } from "@synpuls/mbox/gfm";

const todoHighlightPlugin: MboxPlugin = {
  theme: {
    ".todo-highlight": { backgroundColor: "#fff3b0" },
  },
  decorations: ({ state }) => {
    const index = state.doc.toString().indexOf("TODO");
    return index === -1
      ? []
      : [{ type: "mark", from: index, to: index + 4, className: "todo-highlight" }];
  },
};

createGfmEditor({
  parent: document.querySelector("#editor")!,
  doc: "TODO: write docs",
  extraPlugins: [todoHighlightPlugin],
});
```

A notation is nothing more than a list of these. `extraPlugins` adds yours to an existing one; to build a notation of your own instead, pass your list to `createMboxExtension` and hand the result to `createEditorState` as an extension. The four that ship are assembled exactly this way, so a notation you write gets the same focused-line reveal, the same containment, and the same test helpers. Your `decorations` receives the `EditorState`, so its syntax is whatever you parse out of the document text — cache the parse against `state.doc`, which is a fresh object only when the text actually changes.

```ts
import { createEditorState, createEditorView, createMboxExtension } from "@synpuls/mbox";

createEditorView({
  parent: document.querySelector("#editor")!,
  state: createEditorState({
    doc: "TODO: write docs",
    extensions: [createMboxExtension({ plugins: [todoHighlightPlugin] })],
  }),
});
```

`createContentMarkSpec` creates one `MboxMarkDecorationSpec` for a mark that spans the whole *content* of something (a list item's body, or the content of an emphasis/strong span). Such a mark needs `inclusiveStart` / `inclusiveEnd`: when its boundaries exactly match an embedded widget (a link or image), CodeMirror otherwise makes that widget a sibling of the mark, so the mark's styling does not reach the widget. The helper encapsulates those required boundary options, which TypeScript cannot require for an ordinary mark spec.

Plugin failures are contained. If a plugin's `decorations()` throws, that provider's entire output for the update is dropped and everything else keeps rendering. If lowering finds a reversed range, an out-of-bounds coordinate, or a `replace` range crossing a line break, only that spec is dropped; the provider's other specs remain. Empty mark and replace ranges are normalized instead, so they do not report an error. These failures are silent by default; pass `onDecorationError` to `createXxxEditor` to route them to your error tracking. Exceptions thrown by an error handler are swallowed, so a broken reporter cannot interrupt rendering or prevent other handlers from receiving the failure.

Give a plugin a `name` when you need reports to identify it: `onDecorationError`
includes `pluginName` and `pluginIndex`, and lowering errors also include the
failed `spec`.

When testing a plugin like this, `@synpuls/mbox/testing` exports `createTestContext`, which builds an `MboxDecorationContext` directly from a document string, and `validateDecorationSpecs`. The latter runs specs through the same normalization and lowering used in production: empty mark and replace ranges are normalized, while invalid positions and reversed ranges fail the test before they reach an editor.

## Public API surface

Every symbol exported from `@synpuls/mbox`, `@synpuls/mbox/gfm`, `@synpuls/mbox/hatena`, `@synpuls/mbox/scrapbox`, and `@synpuls/mbox/testing` is supported API. Some internal modules ship inside the published package's `dist/` folder as build artifacts, but they are not listed in `package.json`'s `exports`, importing them directly is unsupported, and they may change or be removed without notice.

## Styling

Each notation has an opt-in default presentation theme (e.g. `gfmDefaultPresentationTheme()`), which `createXxxEditor` / `createXxxEditorState` include automatically unless you pass `presentation: false`. To style things yourself, each notation exports its own `.mbox-*` class names (e.g. `headingClassNames`, `gfmLinkClassName`) for use in your own stylesheet. Passing `presentation: false` skips the default theme entirely; passing `presentation: { notation: false }` keeps the container's default sizing and spacing while dropping only the notation-specific colors and fonts. The default presentation is light-oriented — for dark UIs, override the CSS variables provided for parts of the default styling (e.g. `--mbox-gfm-link-color`) or disable the presentation and style the class names yourself.

Table layout is structural rather than part of the optional presentation theme. Each table plugin applies its calculated column width, and with no host CSS at all a table's columns line up while none of its rows is being edited. Put the caret in any row of a table and the rest of that table falls back to content-sized cells until the caret leaves: the cell boxes those widths need come from the table's ARIA structure, which is stood down while a row shows its raw source. A host that styles `.mbox-*-table-cell` with a `display` of its own — as the demo stylesheet does — keeps the columns aligned throughout. To replace every calculated cell width in an editor, set the shared `--mbox-table-cell-width` variable on the host:

```css
#editor { --mbox-table-cell-width: 30ch; }
```

This is the supported override and works for the mbox, GFM, Scrapbox, and Hatena table plugins. It also avoids a selector specificity contest because the variable is a different property from the plugin's `width` declaration.

This structural rule is a public behavior change for existing host CSS. A one-class rule such as `.mbox-table-cell { width: 30ch; }` has specificity (0,1,0) and no longer overrides the plugin theme's generated (0,2,0) selector. Prefer `--mbox-table-cell-width`; alternatively use a more specific selector such as `#editor .mbox-table-cell`, add `!important`, or append your own `EditorView.theme()` after the table plugin.

`codeHighlight` is opt-in: omit it or pass `false` to add no highlighter; `true` adds the zero-dependency JS/TS default. Pass an object such as `{ languages: "all" }` to configure `languages` and `onLoadError`.
The default presentation theme colors tokens; with `presentation: false`, highlighting still runs but the host supplies colors. Override token colors with `--mbox-code-token-*-color`, for example `--mbox-code-token-keyword-color`.
The default palette is tuned for a light background; every token color is overridable.

## Troubleshooting

**Editor misbehaves in impossible-looking ways** (extensions ignored, `instanceof` failures): you probably have two copies of `@codemirror/state` / `@codemirror/view` installed. Check with `npm ls @codemirror/state` and deduplicate (`npm dedupe`, or your package manager's resolutions/overrides).
