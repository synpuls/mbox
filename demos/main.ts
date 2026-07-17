import { createEditorView } from "mbox";
import { createDemoEditorState } from "./demo";
import "./styles.css";

const parent = document.querySelector<HTMLDivElement>("#editor");

if (!parent) {
  throw new Error("Editor mount element was not found.");
}

createEditorView({
  parent,
  state: createDemoEditorState(),
});
