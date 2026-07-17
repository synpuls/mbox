import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { hatenaDefinitionPlugin, hatenaDefinitionTermClassName } from "./definition.js";
import { hatenaFootnoteClassName, hatenaFootnotePlugin } from "./footnote.js";

describe("hatenaDefinitionPlugin", () => {
  it("nests a footnote ref that is the ENTIRE term so the term's bold weight still applies", () => {
    // Regression test: the term mark's range coincides exactly with an
    // embedded widget's own replace range when the term is nothing but that
    // widget, so CodeMirror needs inclusiveStart/inclusiveEnd on the term
    // mark to nest the widget instead of splitting it out as a DOM sibling
    // (which would silently drop the term's bold styling from it).
    //
    // A hatena link can't reproduce this: every link form (`[url:title=x]`,
    // a bare URL, `id:name`) contains a colon, and the term-parsing regex
    // (`/^:([^:]*):/`) stops at the first colon -- so a term can never be
    // "entirely a link" in the first place (confirmed: for
    // `:[http://example.com:title=foo]:...` the term mark ends up at
    // offset 1-6, "[http", while the link widget spans 1-31 -- a partial
    // overlap, not a coincident boundary, and not something
    // inclusiveStart/inclusiveEnd can fix). Hatena's colon-free `((note))`
    // footnote syntax hits the real coincident-boundary case instead.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: ":((note)):説明",
        extensions: [createMboxExtension({ plugins: [hatenaDefinitionPlugin(), hatenaFootnotePlugin()] })],
      }),
    });

    const term = parent.querySelector(`.${hatenaDefinitionTermClassName}`);
    expect(term).not.toBeNull();
    expect(term?.querySelector(`.${hatenaFootnoteClassName}`)).not.toBeNull();

    view.destroy();
  });
});
