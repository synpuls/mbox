import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  createEditorState,
  createEditorView,
  createMboxExtension,
  editorPresentationTheme,
  headingPlugin,
  mboxPlugins,
  quotePlugin,
} from "mbox";
import { scrapboxDefaultPresentationTheme, scrapboxPlugins } from "mbox/scrapbox";
import "/demos/styles.css";

const parent = document.querySelector<HTMLElement>("#editor")!;
const params = new URLSearchParams(window.location.search);
const setup = params.get("setup") ?? "full";
const pluginMode = params.get("plugins") ?? "default";
const labelledby = params.get("labelledby") === "1";
const readOnly = params.get("readonly") === "1";
const doc = "- item\n  - nested\n# Heading\n## Other";
const pluginsByMode = {
  default: mboxPlugins(),
  imagePreview: mboxPlugins({
    image: {
      renderMode: "preview",
    },
  }),
  codeHighlight: mboxPlugins({ codeHighlight: true }),
  mboxComplete: (() => {
    const previewIconUrl =
      "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='22'%20viewBox='0%200%2032%2022'%3E%3Crect%20width='32'%20height='22'%20fill='%23d92d20'/%3E%3C/svg%3E";
    const candidates = [{ title: "readme", iconUrl: previewIconUrl }, { title: "reference" }, { title: "roadmap" }];
    return mboxPlugins({
      complete: {
        recommend: (query) => candidates.filter((candidate) => candidate.title.toLowerCase().startsWith(query.toLowerCase())),
      },
    });
  })(),
  heading: [headingPlugin()],
  quote: [quotePlugin()],
  headingQuote: [headingPlugin(), quotePlugin()],
  scrapbox: scrapboxPlugins({}),
  scrapboxImagePreview: scrapboxPlugins({ image: { renderMode: "preview" } }),
  scrapboxTitleLine: scrapboxPlugins({ titleLine: true }),
  scrapboxPresentation: scrapboxPlugins({}),
  scrapboxInlineCodeHighlight: scrapboxPlugins({ inlineCodeHighlight: true }),
  scrapboxComplete: (() => {
    const previewIconUrl =
      "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='22'%20viewBox='0%200%2032%2022'%3E%3Crect%20width='32'%20height='22'%20fill='%23d92d20'/%3E%3C/svg%3E";
    const candidates = [
      { title: "demo-user" },
      { title: "readme", iconUrl: previewIconUrl },
      { title: "reference" },
      { title: "roadmap" },
      { title: "recipes" },
      { title: "Release Notes" },
    ];
    return scrapboxPlugins({
      complete: {
        recommend: (query) => candidates.filter((candidate) => candidate.title.toLowerCase().startsWith(query.toLowerCase())),
      },
    });
  })(),
  none: [],
};
const plugins = pluginsByMode[pluginMode as keyof typeof pluginsByMode] ?? pluginsByMode.default;
const mboxExtension = createMboxExtension({ plugins });
const view = createEditorView({
  parent,
  state:
    setup === "minimal"
      ? EditorState.create({
          doc,
          extensions: [mboxExtension],
        })
      : createEditorState({
          activeLine: true,
          doc,
          readOnly,
          extensions: [
            lineNumbers(),
            mboxExtension,
            editorPresentationTheme({ minHeight: "560px" }),
            ...(pluginMode === "scrapboxTitleLine" || pluginMode === "scrapboxPresentation" || pluginMode === "scrapboxInlineCodeHighlight"
              ? [scrapboxDefaultPresentationTheme()]
              : []),
            ...(labelledby ? [EditorView.contentAttributes.of({ "aria-labelledby": "fixture-editor-heading" })] : []),
          ],
        }),
});
view.dispatch({ selection: EditorSelection.cursor(2) });

window.__mboxLayoutFixture = {
  view,
  setDoc(doc, selection = 0, shouldFocus = true) {
    if (shouldFocus) {
      view.focus();
    }
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: doc,
      },
      selection: EditorSelection.cursor(selection),
    });
    if (!shouldFocus) {
      view.contentDOM.blur();
    }
  },
  setSelection(anchor, head = anchor) {
    view.focus();
    view.dispatch({
      selection: EditorSelection.range(anchor, head),
    });
  },
  focus() {
    view.focus();
  },
  selectionHead() {
    return view.state.selection.main.head;
  },
  selectionCoords() {
    return view.coordsAtPos(view.state.selection.main.head) as unknown as DOMRect | null;
  },
  coordsAtPos(pos) {
    return view.coordsAtPos(pos) as unknown as DOMRect | null;
  },
  rectForText(text) {
    const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent!.indexOf(text);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        return range.getBoundingClientRect();
      }
    }
    return null;
  },
};
