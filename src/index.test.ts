import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { WidgetType } from "@codemirror/view";
import type {
  MboxPluginOptions,
  MarkdownImagePluginOptions,
  MboxDocument,
  MboxFootnoteDefinitionBlock,
  MboxFootnoteRefNode,
  MboxCompletePluginOptions,
  MboxCompletionCandidate,
  MboxRecommend,
  PageLinkPluginOptions,
} from "./index.js";
import type { ScrapboxPageExistsResolver } from "./scrapbox.js";
import {
  CodeBlockCopyButtonWidget,
  codeBlockHighlightClassNames,
  codeBlockHighlightPlugin,
  codeBlockClassNames,
  codeBlockPlugin,
  completionClassNames,
  completionOptionClassName,
  completionOptionWithPreviewClassName,
  completionPreviewClassName,
  completionPreviewImageClassName,
  createMarkSpec,
  createReplaceSpec,
  createWidgetSpec,
  mboxPlugins,
  emojiClassName,
  getMboxDocumentFromState,
  headingClassNames,
  inlineCodeClassNames,
  inlineStyleClassNames,
  insertMboxBracketPair,
  listClassNames,
  markdownImageClassName,
  markdownImageClassNames,
  mboxBracketPlugin,
  mboxCompletePlugin,
  mboxFootnoteClassName,
  mboxFootnoteMarkerClassName,
  mboxFootnotePlugin,
  mboxFootnoteRefClassName,
  MboxFootnoteRefWidget,
  pageLinkClassName,
  paragraphClassNames,
  parseMboxDocument,
  quoteClassNames,
  tableClassNames,
  tablePlugin,
  taskListClassNames,
  urlLinkClassName,
} from "./index.js";
import { scrapboxPageMissingClassName } from "./scrapbox.js";

describe("root public API", () => {
  it("exports mbox's own code-block copy button widget, matching gfm/scrapbox's own equivalents", () => {
    expect(new CodeBlockCopyButtonWidget("const x = 1;", "test-copy-button")).toBeInstanceOf(WidgetType);
  });

  it("exports mbox bracket pair helpers", () => {
    const state = EditorState.create({ doc: "ab", selection: { anchor: 1 } });
    const next = state.update(insertMboxBracketPair(state)).state;

    expect(next.doc.toString()).toBe("a[]b");
    expect(mboxBracketPlugin().extensions).toHaveLength(1);
  });

  it("exports the safe spec-builder helpers for third-party plugin authors", () => {
    expect(createReplaceSpec(0, 2)).toEqual([{ type: "replace", from: 0, to: 2 }]);
    expect(createReplaceSpec(1, 1)).toEqual([]);
    expect(createMarkSpec(1, 1, "mbox-empty")).toEqual([]);
    expect(createWidgetSpec(0, new (class extends WidgetType {
      toDOM(): HTMLElement {
        return document.createElement("span");
      }
    })())).toHaveLength(1);
  });

  it("exports the default plugin set and built-in plugin factories", () => {
    expect(mboxPlugins()).toHaveLength(16);
    expect(codeBlockPlugin().decorations).toBeTypeOf("function");
    expect(codeBlockHighlightPlugin().decorations).toBeTypeOf("function");
    expect(tablePlugin().decorations).toBeTypeOf("function");
    expect(mboxFootnotePlugin().decorations).toBeTypeOf("function");
    expect(new MboxFootnoteRefWidget("1", "note")).toBeInstanceOf(WidgetType);
  });

  it("exports opt-in plugin factories and option types", () => {
    const markdownImageOptions: MarkdownImagePluginOptions = { renderMode: "preview" };
    const pageLinkOptions: PageLinkPluginOptions = { pageUrl: (name) => `/wiki/${name}` };
    const scrapboxPageExists: ScrapboxPageExistsResolver = (name) => name !== "Missing";
    const completionCandidate: MboxCompletionCandidate = { title: "Ruby", type: "page" };
    const recommend: MboxRecommend = () => [completionCandidate];
    const completionOptions: MboxCompletePluginOptions = { recommend };
    const defaultOptions: MboxPluginOptions = { image: markdownImageOptions, link: pageLinkOptions };

    expect(mboxPlugins(defaultOptions)).toHaveLength(16);
    expect(mboxPlugins({ codeHighlight: true })).toHaveLength(17);
    expect(scrapboxPageExists("Page")).toBe(true);
    expect(codeBlockHighlightPlugin().decorations).toBeTypeOf("function");
    expect(mboxCompletePlugin(completionOptions).extensions).toHaveLength(1);
  });

  it("exports public class names for user CSS", () => {
    expect(headingClassNames.h1).toBe("mbox-h1");
    expect(listClassNames.ul).toBe("mbox-ul");
    expect(taskListClassNames.item).toBe("mbox-task-list");
    expect(quoteClassNames.quote).toBe("mbox-quote");
    expect(paragraphClassNames.paragraph).toBe("mbox-paragraph");
    expect(pageLinkClassName).toBe("mbox-page-link");
    expect(mboxFootnoteClassName).toBe("mbox-footnote");
    expect(mboxFootnoteMarkerClassName).toBe("mbox-footnote-marker");
    expect(mboxFootnoteRefClassName).toBe("mbox-footnote-ref");
    expect(emojiClassName).toBe("mbox-emoji");
    expect(urlLinkClassName).toBe("mbox-url-link");
    expect(markdownImageClassName).toBe("mbox-image");
    expect(scrapboxPageMissingClassName).toBe("mbox-scrapbox-page-missing");
    expect(markdownImageClassNames.preview).toBe("mbox-image-preview");
    expect(inlineCodeClassNames.code).toBe("mbox-inline-code");
    expect(inlineStyleClassNames.strong).toBe("mbox-strong");
    expect(codeBlockClassNames.copyButton).toBe("mbox-code-copy-button");
    expect(codeBlockClassNames.fenceLine).toBe("mbox-code-fence-line");
    expect(codeBlockClassNames.headerLine).toBe("mbox-code-header-line");
    expect(codeBlockClassNames.languageLabel).toBe("mbox-code-language-label");
    expect(codeBlockClassNames.closingFenceLine).toBe("mbox-code-closing-fence-line");
    expect(codeBlockHighlightClassNames.token).toBe("mbox-code-token");
    expect(tableClassNames.table).toBe("mbox-table");
    expect(completionOptionClassName).toBe("mbox-completion-option");
    expect(completionOptionWithPreviewClassName).toBe("mbox-completion-option-with-preview");
    expect(completionPreviewClassName).toBe("mbox-completion-preview");
    expect(completionPreviewImageClassName).toBe("mbox-completion-preview-image");
    expect(completionClassNames).toEqual({
      option: "mbox-completion-option",
      optionWithPreview: "mbox-completion-option-with-preview",
      preview: "mbox-completion-preview",
      previewImage: "mbox-completion-preview-image",
    });
  });

  it("exports the default parser and document model type", () => {
    const document: MboxDocument = parseMboxDocument("# Hello");

    expect(document.blocks[0]?.type).toBe("heading");
  });

  it("exports mbox footnote node types", () => {
    const ref: MboxFootnoteRefNode = {
      type: "footnoteRef",
      from: 0,
      to: 4,
      marker: { from: 0, to: 2 },
      label: { from: 2, to: 3 },
      identifier: "1",
      value: "1",
    };
    const definition: MboxFootnoteDefinitionBlock = {
      type: "footnoteDefinition",
      from: 0,
      to: 13,
      line: 1,
      label: "1",
      identifier: "1",
      marker: { from: 0, to: 5 },
      syntax: { from: 0, to: 6 },
      content: { from: 6, to: 13 },
      value: "content",
    };

    expect(ref.identifier).toBe(definition.identifier);
  });

  it("exports getMboxDocumentFromState, resolving the mbox document for a real EditorState", () => {
    const state = EditorState.create({ doc: "# Hello" });

    expect(getMboxDocumentFromState(state).blocks[0]).toMatchObject({ type: "heading", level: 1 });
  });

});
