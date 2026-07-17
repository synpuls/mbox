import { describe, expect, it } from "vitest";
import { codeBlockHighlightClassNames } from "../plugins/mbox/code-block.js";
import { createMboxEditor } from "./create-editor.js";

describe("createMboxEditor code token presentation", () => {
  it("renders highlighted tokens and injects their overridable colour rules", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({ parent, doc: "```js\nconst value = 1;\n```", codeHighlight: true });

    expect(parent.querySelector(`.${codeBlockHighlightClassNames.token}.tok-keyword`)).not.toBeNull();
    expect(styleText()).toContain("--mbox-code-token-keyword-color");

    view.destroy();
  });
});

function styleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}
