export {
  createEditorState,
  createEditorView,
  createMboxEditor,
  createMboxEditorState,
  defaultEditorPresentationThemeSpec,
  editorPresentationTheme,
} from "./editor/create-editor.js";
export type {
  CreateEditorStateOptions,
  CreateEditorViewOptions,
  CreateMboxEditorOptions,
  CreateMboxEditorStateOptions,
  EditorPresentationThemeOptions,
  MboxEditorPresentation,
  MboxEditorPresentationOptions,
  SharedMboxEditorOptions,
} from "./editor/create-editor.js";
export type { MboxActiveLineNumbers } from "./editor/focused-line.js";
export {
  createContentMarkSpec,
  createMarkSpec,
  createMboxExtension,
  createReplaceSpec,
  createWidgetSpec,
} from "./editor/plugin.js";
export type {
  CreateMboxExtensionOptions,
  MboxDecorationError,
  MboxDecorationProvider,
  MboxDecorationContext,
  MboxDecorationSpec,
  MboxLineDecorationSpec,
  MboxLineRangeDecorationSpec,
  MboxMarkDecorationSpec,
  MboxReplaceDecorationSpec,
  MboxWidgetDecorationSpec,
  MboxPlugin,
  MboxThemeSpec,
} from "./editor/plugin.js";
// Plugin-author / extension-author test helpers (createTestContext and
// validateDecorationSpecs) live at "mbox/testing" instead of here -- see
// src/testing.ts. Runtime plugins use getXxxDocumentFromState from the
// matching public entry point.

export { mboxPlugins } from "./plugins/mbox/default.js";
export type { MboxPluginOptions } from "./plugins/mbox/default.js";
export {
  CodeBlockCopyButtonWidget,
  codeBlockClassNames,
  codeBlockHighlightClassNames,
  codeBlockHighlightPlugin,
  codeBlockPlugin,
  getCodeBlockLanguageId,
} from "./plugins/mbox/code-block.js";
export type { CodeBlockHighlightPluginOptions } from "./plugins/mbox/code-block.js";
export { insertMboxBracketPair, mboxBracketPlugin } from "./plugins/mbox/bracket.js";
export {
  completionClassNames,
  completionOptionClassName,
  completionOptionWithPreviewClassName,
  completionPreviewClassName,
  completionPreviewImageClassName,
  mboxCompletePlugin,
} from "./plugins/mbox/complete.js";
export type { MboxCompletePluginOptions, MboxCompletionCandidate, MboxRecommend } from "./plugins/mbox/complete.js";
export { emojiClassName, emojiPlugin } from "./plugins/mbox/emoji.js";
export { headingClassNames, headingPlugin } from "./plugins/mbox/heading.js";
export { inlineCodeClassName, inlineCodeClassNames, inlineCodePlugin } from "./plugins/mbox/inline-code.js";
export { inlineStyleClassNames, inlineStylePlugin } from "./plugins/mbox/inline-style.js";
export { listClassNames, listPlugin } from "./plugins/mbox/list.js";
// List/indent keymap commands `(view) => boolean`, exported so hosts can remap
// the keys by binding these commands to their own key bindings. The pure edit
// builders behind them stay module-private.
export {
  runListDeleteBackward,
  runListDeleteForward,
  runListEnter,
  runListIndent,
  runListLineStart,
  runListOutdent,
  runListSpace,
} from "./plugins/mbox/list.js";
export { markdownImageClassName, markdownImageClassNames, markdownImagePlugin } from "./plugins/mbox/markdown-image.js";
export type { MarkdownImagePluginOptions, MarkdownImageRenderMode } from "./plugins/mbox/markdown-image.js";
export { MboxIconWidget, iconClassName, iconImageClassName, pageLinkClassName, pageLinkPlugin } from "./plugins/mbox/page-link.js";
export type { PageLinkPluginOptions } from "./plugins/mbox/page-link.js";
export {
  MboxFootnoteRefWidget,
  mboxFootnoteClassName,
  mboxFootnoteMarkerClassName,
  mboxFootnotePlugin,
  mboxFootnoteRefClassName,
} from "./plugins/mbox/footnote.js";
export { paragraphClassNames, paragraphPlugin } from "./plugins/mbox/paragraph.js";
export { quoteClassNames, quotePlugin } from "./plugins/mbox/quote.js";
export { tableClassNames, tablePlugin, tableRawCellClassName, tableRenderedClassName } from "./plugins/mbox/table.js";
export { taskListClassNames, taskListPlugin } from "./plugins/mbox/task-list.js";
export { urlLinkClassName, urlLinkPlugin } from "./plugins/mbox/url-link.js";

export { parseMboxDocument } from "./plugins/mbox/parser.js";
export { getMboxDocumentFromState } from "./plugins/mbox/parser-cache.js";
export type {
  MboxAutoLinkNode,
  MboxBaseBlock,
  MboxBlock,
  MboxCodeBlock,
  MboxDocument,
  MboxEmojiNode,
  MboxFootnoteDefinitionBlock,
  MboxFootnoteRefNode,
  MboxHeadingBlock,
  MboxIconNode,
  MboxInlineCodeNode,
  MboxInlineNode,
  MboxInlineStyleNode,
  MboxInlineTextNode,
  MboxListItemBlock,
  MboxMarkdownImageNode,
  MboxMarkdownLinkNode,
  MboxParagraphBlock,
  MboxQuoteBlock,
  MboxRange,
  MboxTableBlock,
  MboxTableCell,
  MboxTableRow,
  MboxTaskListItemBlock,
  MboxWikiLinkNode,
} from "./plugins/mbox/types.js";

// The image kit's widget bases and their constructor types: the public
// notation image widgets (ScrapboxImageWidget etc.) extend these, so they are
// part of the reachable type surface even though the rest of the kit stays
// internal.
export { ImageKitMeasureWidget, ImageKitPreviewWidget, ImageKitTokenWidget } from "./plugins/image-kit.js";
export type { ImageKitClassNames, ImageKitImage, ImageKitMeasureClassNames } from "./plugins/image-kit.js";

export { mboxDefaultPresentationTheme, mboxDefaultPresentationThemeSpec } from "./themes/default-presentation.js";
