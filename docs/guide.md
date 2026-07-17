# Guide

Everything beyond the README's quick start: integration details, options, plugin authoring, styling, and troubleshooting.

## Install notes

`@codemirror/state`, `view`, `commands`, `language`, `autocomplete`, and `search` are declared as peer dependencies. With npm 7+ (and Yarn/pnpm) `npm install @synpuls/mbox` installs them automatically — you do not need to list them yourself. mbox's public types (`Extension`, `EditorState`, `EditorView`, etc.) come from these packages, and your app will almost certainly use them directly too, to pass its own extensions or read the resulting state.

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

The GFM layer covers the practical core of the spec — headings, lists, task lists, blockquotes, code blocks, tables, emphasis, links, images, footnotes. HTML, reference links (`[text][id]`), and entity references are deliberately not rendered and stay as raw text.

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

Plugin failures are contained. If a plugin's `decorations()` throws, that provider's entire output for the update is dropped and everything else keeps rendering. If lowering finds a reversed range or an out-of-bounds coordinate, only that spec is dropped; the provider's other specs remain. Empty mark and replace ranges are normalized instead, so they do not report an error. These failures are silent by default; pass `onDecorationError` to `createXxxEditor` to route them to your error tracking. Exceptions thrown by an error handler are swallowed, so a broken reporter cannot interrupt rendering or prevent other handlers from receiving the failure.

Give a plugin a `name` when you need reports to identify it: `onDecorationError`
includes `pluginName` and `pluginIndex`, and lowering errors also include the
failed `spec`.

When testing a plugin like this, `@synpuls/mbox/testing` exports `createTestContext`, which builds an `MboxDecorationContext` directly from a document string, and `validateDecorationSpecs`. The latter runs specs through the same normalization and lowering used in production: empty mark and replace ranges are normalized, while invalid positions and reversed ranges fail the test before they reach an editor.

## Public API surface

Every symbol exported from `@synpuls/mbox`, `@synpuls/mbox/gfm`, `@synpuls/mbox/hatena`, `@synpuls/mbox/scrapbox`, and `@synpuls/mbox/testing` is supported API. Some internal modules ship inside the published package's `dist/` folder as build artifacts, but they are not listed in `package.json`'s `exports`, importing them directly is unsupported, and they may change or be removed without notice.

## Styling

Each notation has an opt-in default presentation theme (e.g. `gfmDefaultPresentationTheme()`), which `createXxxEditor` / `createXxxEditorState` include automatically unless you pass `presentation: false`. To style things yourself, each notation exports its own `.mbox-*` class names (e.g. `headingClassNames`, `gfmLinkClassName`) for use in your own stylesheet. Passing `presentation: false` skips the default theme entirely; passing `presentation: { notation: false }` keeps the container's default sizing and spacing while dropping only the notation-specific colors and fonts. The default presentation is light-oriented — for dark UIs, override the CSS variables provided for parts of the default styling (e.g. `--mbox-gfm-link-color`) or disable the presentation and style the class names yourself.

`codeHighlight` is opt-in: omit it or pass `false` to add no highlighter; `true` adds the zero-dependency JS/TS default. Pass an object such as `{ languages: "all" }` to configure `languages` and `onLoadError`.
The default presentation theme colors tokens; with `presentation: false`, highlighting still runs but the host supplies colors. Override token colors with `--mbox-code-token-*-color`, for example `--mbox-code-token-keyword-color`.
The default palette is tuned for a light background; every token color is overridable.

## Troubleshooting

**Editor misbehaves in impossible-looking ways** (extensions ignored, `instanceof` failures): you probably have two copies of `@codemirror/state` / `@codemirror/view` installed. Check with `npm ls @codemirror/state` and deduplicate (`npm dedupe`, or your package manager's resolutions/overrides).
