import "katex/dist/katex.min.css";
import { createEditorView } from "mbox";
import { createScrapboxDemoEditorState } from "./scrapbox-demo";
import "./styles.css";

const parent = document.querySelector<HTMLDivElement>("#editor");

if (!parent) {
  throw new Error("Editor mount element was not found.");
}

createEditorView({
  parent,
  state: createScrapboxDemoEditorState(),
});
