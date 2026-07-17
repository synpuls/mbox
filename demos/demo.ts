import {
  createEditorState,
  createMboxExtension,
  editorPresentationTheme,
  mboxDefaultPresentationTheme,
  mboxPlugins,
  type MboxRecommend,
} from "mbox";
import { lineNumbers } from "@codemirror/view";

// A small placeholder image committed under demos/, imported as a Vite asset
// so the URL respects the build's `base` (dev "/", GitHub Pages "/mbox/").
// Markdown image syntax accepts a relative URL, so no origin/host is needed
// here (the scrapbox demo differs — see its own note).
import demoImageURL from "./sample-image.png";

// Stand-in for a consumer's page index: prefix-match a fixed title list. A real
// app would fetch titles and rank them; matches scrapbox-demo.ts's own demo
// recommender for the same "[ … ]" bracket completion mechanism.
const demoTitles = ["demo-user", "readme", "reference", "roadmap", "recipes", "Release Notes"];
const recommendDemoTitles: MboxRecommend = (query) =>
  demoTitles.filter((title) => title.toLowerCase().startsWith(query.toLowerCase())).map((title) => ({ title }));

export const initialDocument = `# mbox

Click a line to reveal its raw syntax.

## Block syntax

- Bullet list item
 - Nested bullet list item
- [x] A completed task

> An example quote.

| Syntax | Example |
| --- | --- |
| List | - item |
| Code block | sample.ts |

\`\`\`sample.ts
const syntax = ["[page link]", ":smile:", "~~strikethrough~~"];
const editor = new EditorView({
  extensions: [basicSetup, markdown()],
});
\`\`\`

## Inline syntax

- Page link: [page link]
- Icon: [demo-user.icon]
- Markdown link: [Markdown link](https://example.com)
- Bare URL: https://example.org
- emoji: :smile:
- Inline code: \`inline code\`
- Inline styles: *emphasis*, **bold**, ~~strikethrough~~
- Image: ![sample image](${demoImageURL})
- A footnote[^1] reference

[^1]: The footnote body goes here.
`;

export function createDemoEditorState() {
  return createEditorState({
    activeLine: true,
    ariaLabel: "mbox demo editor",
    doc: initialDocument,
    extensions: [
      lineNumbers(),
      createMboxExtension({
        plugins: [
          // The demo plays the host role: it owns URL semantics and passes a
          // resolver into the plugin, same as gfm/hatena/scrapbox's link
          // resolvers -- mbox's own reference plugin is no exception.
          ...mboxPlugins({
            image: {
              renderMode: "preview",
            },
            link: {
              pageUrl: (name) => `./${name}`,
              // A real host would map the icon name to its own avatar endpoint
              // (e.g. `https://example.com/users/${iconName}/icon`); the demo
              // has no backend, so it maps names to local files instead --
              // Vite resolves this dynamic `new URL(..., import.meta.url)` to
              // the bundled ./icons/*.png assets. Unknown names 404 and fall
              // back to the alt text.
              iconUrl: (iconName) => new URL(`./icons/${iconName}.png`, import.meta.url).href,
            },
            // The consumer owns the candidate index and ranking; here we just
            // prefix-match a fixed demo title list.
            complete: { recommend: recommendDemoTitles },
            codeHighlight: true,
          }),
        ],
      }),
      editorPresentationTheme({ minHeight: "560px" }),
      mboxDefaultPresentationTheme(),
    ],
  });
}
