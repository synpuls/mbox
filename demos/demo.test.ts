// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createEditorView } from "mbox";
import { createDemoEditorState, initialDocument } from "./demo";

const sampleImageURL = "/demos/sample-image.png";

describe("createDemoEditorState", () => {
  it("keeps the demo document as a syntax catalog", () => {
    expect(initialDocument).toContain("## Block syntax");
    expect(initialDocument).toContain("## Inline syntax");
    expect(initialDocument).toContain("- [x] ");
    expect(initialDocument).toContain("> ");
    expect(initialDocument).toContain("| Syntax | Example |");
    expect(initialDocument).toContain("```sample.ts");
    expect(initialDocument).toContain("[page link]");
    expect(initialDocument).toContain("[demo-user.icon]");
    expect(initialDocument).toContain("[Markdown link](https://example.com)");
    expect(initialDocument).toContain("https://example.org");
    expect(initialDocument).toContain(":smile:");
    expect(initialDocument).toContain("`inline code`");
    expect(initialDocument).toContain("*emphasis*");
    expect(initialDocument).toContain("**bold**");
    expect(initialDocument).toContain("~~strikethrough~~");
    expect(initialDocument).toContain("footnote[^1]");
    expect(initialDocument).toContain("[^1]:");
    expect(initialDocument).not.toContain("==highlight==");
  });

  it("uses the sample image source in the demo document", () => {
    expect(initialDocument).toContain(`![sample image](${sampleImageURL})`);
  });

  it("adds line numbers as an editor extension for visual row-height inspection", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: createDemoEditorState(),
    });

    expect(parent.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(view.contentDOM.getAttribute("aria-label")).toBe("mbox demo editor");

    view.destroy();
  });
});
