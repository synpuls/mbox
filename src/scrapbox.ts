import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createEditorView, createNotationEditorState, type SharedMboxEditorOptions } from "./editor/create-editor.js";
import { scrapboxPlugins, type ScrapboxPluginsOptions } from "./plugins/scrapbox/index.js";
import { scrapboxDefaultPresentationTheme } from "./themes/scrapbox-presentation.js";

export {
  scrapboxBulletClassName,
  scrapboxIndentAttribute,
  scrapboxIndentLevelWidth,
  scrapboxListClassNames,
  scrapboxListLineClassName,
  scrapboxListPlugin,
  scrapboxNumberClassName,
} from "./plugins/scrapbox/list.js";
export type { ScrapboxListClassNames } from "./plugins/scrapbox/list.js";
export { parseScrapboxDocument, scrapboxCodeBlockLineNumbers, scrapboxTableBlockLineNumbers } from "./plugins/scrapbox/parser.js";
export type {
  ScrapboxCodeBlock,
  ScrapboxDocument,
  ScrapboxLine,
  ScrapboxListType,
  ScrapboxRange,
  ScrapboxTableBlock,
} from "./plugins/scrapbox/parser.js";
export {
  scrapboxQuoteClassNames,
  scrapboxQuoteLineClassName,
  scrapboxQuotePlugin,
} from "./plugins/scrapbox/quote.js";
export {
  scrapboxCodeBlockBodyClassName,
  scrapboxCodeBlockClassName,
  scrapboxCodeBlockClassNames,
  scrapboxCodeBlockCopyButtonClassName,
  scrapboxCodeBlockFileNameClassName,
  scrapboxCodeBlockHighlightPlugin,
  scrapboxCodeBlockKeywordClassName,
  scrapboxCodeBlockLanguageLabelClassName,
  scrapboxCodeBlockOpenerClassName,
  scrapboxCodeBlockPlugin,
  scrapboxCodeBlockTokenClassName,
  ScrapboxCodeBlockCopyButtonWidget,
} from "./plugins/scrapbox/code-block.js";
export type { ScrapboxCodeBlockHighlightPluginOptions } from "./plugins/scrapbox/code-block.js";
export {
  scrapboxFormulaClassName,
  scrapboxFormulaClassNames,
  scrapboxFormulaPlugin,
  ScrapboxFormulaWidget,
} from "./plugins/scrapbox/formula.js";
export type { ScrapboxFormulaPluginOptions, ScrapboxFormulaRenderer } from "./plugins/scrapbox/formula.js";
export {
  scrapboxTableCellClassName,
  scrapboxTableClassName,
  scrapboxTableClassNames,
  scrapboxTableHeaderClassName,
  scrapboxTableKeywordClassName,
  scrapboxTableNameClassName,
  scrapboxTableOpenerClassName,
  scrapboxTablePlugin,
  scrapboxTableRawCellClassName,
  scrapboxTableRenderedClassName,
  scrapboxTableRowClassName,
} from "./plugins/scrapbox/table.js";
export { parseScrapboxInline, parseScrapboxLineInline } from "./plugins/scrapbox/inline.js";
export type {
  ScrapboxCodeNode,
  ScrapboxDecorationNode,
  ScrapboxExternalLinkNode,
  ScrapboxFormulaNode,
  ScrapboxHashTagNode,
  ScrapboxIconNode,
  ScrapboxImageNode,
  ScrapboxInlineNode,
  ScrapboxInternalLinkNode,
  ScrapboxStrongImageNode,
  ScrapboxStrongNode,
  ScrapboxTextNode,
} from "./plugins/scrapbox/inline.js";
export {
  scrapboxHashTagClassName,
  scrapboxIconClassName,
  scrapboxIconImageClassName,
  scrapboxLinkClassName,
  scrapboxLinkClassNames,
  scrapboxLinkPlugin,
  scrapboxPageMissingClassName,
  scrapboxUrlClassName,
  ScrapboxIconWidget,
  ScrapboxLinkWidget,
} from "./plugins/scrapbox/link.js";
export type {
  ScrapboxIconUrlResolver,
  ScrapboxLinkPluginOptions,
  ScrapboxPageExistsResolver,
  ScrapboxPageUrlResolver,
} from "./plugins/scrapbox/link.js";
export { scrapboxTitleLineClassName, scrapboxTitlePlugin } from "./plugins/scrapbox/title.js";
export {
  scrapboxCommandClassName,
  scrapboxCommandLineClassName,
  scrapboxCommandLineClassNames,
  scrapboxCommandLinePlugin,
  scrapboxCommandPromptClassName,
} from "./plugins/scrapbox/command-line.js";
export {
  defaultScrapboxImageSrcResolver,
  scrapboxImageClassName,
  scrapboxImageClassNames,
  scrapboxImageElementClassName,
  scrapboxImageMeasureClassName,
  scrapboxImagePlugin,
  scrapboxImagePreviewClassName,
  scrapboxImageStrongClassName,
  scrapboxImageTokenClassName,
  ScrapboxImageMeasureWidget,
  ScrapboxImagePreviewWidget,
  ScrapboxImageWidget,
} from "./plugins/scrapbox/image.js";
export type {
  ScrapboxImagePluginOptions,
  ScrapboxImageRenderMode,
  ScrapboxImageSrcResolver,
} from "./plugins/scrapbox/image.js";
export {
  backspaceScrapboxIndent,
  enterScrapboxEmptyList,
  indentScrapboxLines,
  outdentScrapboxLines,
  scrapboxIndentPlugin,
  scrapboxLineStart,
} from "./plugins/scrapbox/indent.js";
export { scrapboxBracketPlugin } from "./plugins/scrapbox/bracket.js";
export { scrapboxInlineCodePlugin } from "./plugins/scrapbox/inline-code.js";
export {
  scrapboxInlineCodeHighlightPlugin,
  scrapboxInlineCodeTokenClassName,
} from "./plugins/scrapbox/inline-code-highlight.js";
export type { ScrapboxInlineCodeHighlightPluginOptions } from "./plugins/scrapbox/inline-code-highlight.js";
export {
  scrapboxCompletePlugin,
  scrapboxCompletionClassNames,
  scrapboxCompletionOptionClassName,
  scrapboxCompletionOptionWithPreviewClassName,
  scrapboxCompletionPreviewClassName,
  scrapboxCompletionPreviewImageClassName,
} from "./plugins/scrapbox/complete.js";
export type {
  ScrapboxCompletePluginOptions,
  ScrapboxCompletionCandidate,
  ScrapboxCompletionNotation,
  ScrapboxRecommend,
} from "./plugins/scrapbox/complete.js";
export { scrapboxPlugins } from "./plugins/scrapbox/index.js";
export type { ScrapboxPluginsOptions } from "./plugins/scrapbox/index.js";
export {
  scrapboxCodeClassName,
  scrapboxDecorationClassName,
  scrapboxDecorationClassNames,
  scrapboxDecorationPlugin,
  scrapboxEmphasisClassName,
  scrapboxStrikethroughClassName,
  scrapboxStrongClassName,
  scrapboxUnderlineClassName,
} from "./plugins/scrapbox/decoration.js";
export { scrapboxDefaultPresentationTheme, scrapboxDefaultPresentationThemeSpec } from "./themes/scrapbox-presentation.js";
export { getScrapboxDocumentFromState } from "./plugins/scrapbox/parser-cache.js";

export type CreateScrapboxEditorStateOptions = SharedMboxEditorOptions & ScrapboxPluginsOptions;
export type CreateScrapboxEditorOptions = CreateScrapboxEditorStateOptions & { parent: HTMLElement };

/** Scrapbox-specific editor-state shortcut. Scrapbox-specific plugin options
 * are visible directly. */
export function createScrapboxEditorState(options: CreateScrapboxEditorStateOptions = {}): EditorState {
  return createNotationEditorState(options, scrapboxPlugins(options), scrapboxDefaultPresentationTheme);
}

export function createScrapboxEditor(options: CreateScrapboxEditorOptions): EditorView {
  const { parent, ...stateOptions } = options;
  return createEditorView({ parent, state: createScrapboxEditorState(stateOptions) });
}
