// Its own file because CodeMirror accumulates style modules document-wide.
import { describe, expect, it } from "vitest";
import { codeBlockHighlightClassNames } from "../plugins/mbox/code-block.js";
import { createMboxEditor } from "./create-editor.js";

describe("createMboxEditor code token presentation disabled", () => {
  it("does not inject code token colour rules when notation presentation is disabled", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({
      parent,
      doc: "```js\nconst value = 1;\n```",
      codeHighlight: true,
      presentation: { notation: false },
    });

    expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}.tok-keyword`)).not.toBeNull();
    expect(styleText()).not.toContain("--mbox-code-token-keyword-color");

    view.destroy();
  });
});

function styleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}
