import {
  createEditorState,
  createEditorView,
  createMboxExtension,
  editorPresentationTheme,
} from "mbox";
import "katex/dist/katex.min.css";
import katex from "katex";
import { gfmDefaultPresentationTheme, gfmPlugins, type GfmMathRenderer } from "mbox/gfm";
import { createPlaygroundHandle } from "./playground-handle";
import sampleImageURL from "./sample-image.png";
import "./styles.css";

// The "run it" page for the GFM notation. Editor setup, the mbox extension
// wiring, and the debug handle are notation-agnostic; only the plugin bundle
// and the seed `doc` are specific to GFM.
const parent = document.querySelector<HTMLDivElement>("#editor");

if (!parent) {
  throw new Error("Editor mount element was not found.");
}

// The demo is a consumer of the optional math hook. KaTeX remains a
// devDependency: the library itself does not import or depend on it.
const demoRenderMath: GfmMathRenderer = (expression) => {
  const element = document.createElement("div");
  element.innerHTML = katex.renderToString(expression, { displayMode: true, throwOnError: false });
  return element;
};
demoRenderMath.providesAccessibleMath = true;

// A syntax catalog: every supported construct appears once, grouped under a
// labelled heading. The SUPPORTED / UNSUPPORTED audit lives in
// src/plugins/gfm/index.ts.
const doc = [
  "# GFM syntax catalog",
  "",
  "Move the caret onto a line to reveal its raw markers.",
  "",
  "## Headings",
  "",
  "### ATX levels 1–6",
  "#### Fourth level",
  "##### Fifth level",
  "###### Sixth level",
  "",
  "Setext heading",
  "==============",
  "",
  "## Inline",
  "",
  "*emphasis*, _also emphasis_, **strong**, ~~strikethrough~~, and `inline code`.",
  "",
  "Escapes: \\*not emphasis\\* and a literal backslash \\\\.",
  "",
  "A hard line break ends this line\\",
  "and continues on the next.",
  "",
  "Emphasis can span a line break:",
  "*crossing a",
  "line break*",
  "",
  "## Links & images",
  "",
  "A [labelled link](https://example.com/page) and a bare autolink www.example.com.",
  "",
  `![Sample image](${sampleImageURL})`,
  "",
  "## Lists",
  "",
  "- a bullet",
  "  - nested by indent",
  "1. an ordered item",
  "2. another ordered item",
  "- [ ] an open task",
  "- [x] a completed task",
  "",
  "A fenced code block can appear inside a list item:",
  "",
  "- a list item holding a fenced block:",
  "  ```",
  "  code inside a list item",
  "  ```",
  "",
  "## Blockquotes",
  "",
  "> a blockquote",
  "> with lazy continuation",
  "a lazy continuation line",
  ">> and a nested quote",
  "",
  "## Code block",
  "",
  "```js",
  "// Build a greeting with a regular expression.",
  "/* Keep the example short and complete. */",
  "class Greeter {",
  "  greet(name = \"world\", loud = true) {",
  "    const pattern = /w+/g;",
  "    return loud ? `HELLO ${name}` : name.replace(pattern, \"?\");",
  "  }",
  "}",
  "const answer = 42;",
  "```",
  "",
  "A Ruby fenced code block:",
  "",
  "```ruby",
  "# A small callable object.",
  "class Greeter",
  "  def initialize(prefix: \"hello\")",
  "    @prefix = prefix",
  "  end",
  "",
  "  def call(name)",
  "    \"#{@prefix}, #{name}\".upcase",
  "  end",
  "end",
  "",
  "%w[ruby mbox].each { |name| puts Greeter.new.call(name) }",
  "```",
  "",
  "## Math fence",
  "",
  "```math",
  "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  "```",
  "",
  "## Footnotes",
  "",
  "A claim that needs a source[^src] and a second reference[^2].",
  "",
  "[^src]: a source note for the claim",
  "[^2]: a second footnote definition",
  "",
  "## Table",
  "",
  "| Construct | Supported |",
  "| :-------- | :-------: |",
  "| Headings  | yes       |",
  "| Tables    | yes       |",
  "",
  "## Thematic break",
  "",
  "---",
].join("\n");

const view = createEditorView({
  parent,
  state: createEditorState({
    activeLine: true,
    ariaLabel: "GFM playground editor",
    // The playground plays the host role: it owns URL semantics and passes a
    // resolver into the notation bundle. Swap this for your own routing.
    extensions: [
      createMboxExtension({
        plugins: gfmPlugins({
          link: { linkUrl: (url) => url },
          image: { renderMode: "preview" },
          codeHighlight: { languages: "all" },
          math: { render: demoRenderMath },
        }),
      }),
      editorPresentationTheme({ minHeight: "560px" }),
      gfmDefaultPresentationTheme(),
    ],
    doc,
  }),
});

window.__mboxGfmPlayground = createPlaygroundHandle(view);
