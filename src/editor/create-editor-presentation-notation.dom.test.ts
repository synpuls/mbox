// Its own file: see create-editor-presentation.test.ts's top comment. This
// test keeps the container theme on (with a custom minHeight), which leaves
// --mbox-editor-font-size in the shared stylesheet -- that would break
// "disable only the container presentation theme" there, which checks for
// that token's absence.

import { describe, expect, it } from "vitest";
import { pageLinkClassName } from "../plugins/mbox/page-link.js";
import { createMboxEditor } from "./create-editor.js";

describe("createMboxEditor presentation", () => {
  it("can disable only the notation presentation theme", () => {
    const parent = document.createElement("div");
    const view = createMboxEditor({
      parent,
      doc: "[Page]",
      presentation: { container: { minHeight: "777px" }, notation: false },
    });

    expect(parent.querySelector(`.${pageLinkClassName}`)).not.toBeNull();
    expect(styleText()).toContain("777px");
    expect(styleText()).not.toContain("--mbox-page-link-color");

    view.destroy();
  });
});

function styleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}
