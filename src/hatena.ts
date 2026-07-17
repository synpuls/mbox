import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createEditorView, createNotationEditorState, type SharedMboxEditorOptions } from "./editor/create-editor.js";
import { hatenaPlugins, type HatenaPluginsOptions } from "./plugins/hatena/index.js";
import { hatenaDefaultPresentationTheme } from "./themes/hatena-presentation.js";

export { hatenaPlugins } from "./plugins/hatena/index.js";
export type { HatenaPluginsOptions } from "./plugins/hatena/index.js";
export { hatenaBlockquotePlugin } from "./plugins/hatena/blockquote.js";
export {
  hatenaQuoteBlockClassName,
  hatenaQuoteClassName,
  hatenaQuoteCiteClassName,
} from "./plugins/hatena/blockquote.js";
export { hatenaDefinitionPlugin } from "./plugins/hatena/definition.js";
export {
  hatenaDefinitionContinuationClassName,
  hatenaDefinitionLineClassName,
  hatenaDefinitionTermClassName,
} from "./plugins/hatena/definition.js";
export { hatenaFootnotePlugin, HatenaFootnoteWidget } from "./plugins/hatena/footnote.js";
export { hatenaFootnoteClassName, hatenaFootnoteLineClassName } from "./plugins/hatena/footnote.js";
export { hatenaHeadingClassNames, hatenaHeadingLineClassName, hatenaHeadingPlugin } from "./plugins/hatena/heading.js";
export { hatenaLinkClassName, hatenaLinkPlugin, HatenaLinkWidget } from "./plugins/hatena/link.js";
export type { HatenaLinkOptions } from "./plugins/hatena/link.js";
export {
  hatenaListActiveClassName,
  hatenaListCollapsedClassName,
  hatenaListIndentClassName,
  hatenaListLineClassName,
  hatenaListMarkerClassName,
  hatenaListMarkerSlotActiveClassName,
  hatenaListMarkerSlotClassName,
  hatenaListMarkerSlotCollapsedClassName,
  hatenaListMarkerSlotOrderedClassName,
  hatenaListPlugin,
} from "./plugins/hatena/list.js";
export { hatenaPreClassName, hatenaPrePlugin } from "./plugins/hatena/pre.js";
export {
  hatenaSuperPreClassName,
  hatenaSuperPreHighlightPlugin,
  hatenaSuperPreLangClassName,
  hatenaSuperPrePlugin,
  hatenaSuperPreTokenClassName,
  HatenaSuperPreLangWidget,
} from "./plugins/hatena/super-pre.js";
export type { HatenaSuperPreHighlightPluginOptions } from "./plugins/hatena/super-pre.js";
export {
  hatenaTableClassNames,
  hatenaTablePlugin,
  hatenaTableRawCellClassName,
  hatenaTableRenderedClassName,
} from "./plugins/hatena/table.js";
export { parseHatenaDocument } from "./plugins/hatena/parser.js";
export type {
  HatenaDefinition,
  HatenaDocument,
  HatenaFootnote,
  HatenaHeading,
  HatenaLine,
  HatenaLink,
  HatenaLinkKind,
  HatenaList,
  HatenaPreRole,
  HatenaQuote,
  HatenaQuoteRole,
  HatenaRange,
  HatenaSuperPreRole,
  HatenaTable,
  HatenaTableCell,
  HatenaTableRow,
} from "./plugins/hatena/parser.js";
export { hatenaDefaultPresentationTheme, hatenaDefaultPresentationThemeSpec } from "./themes/hatena-presentation.js";
export { getHatenaDocumentFromState } from "./plugins/hatena/parser-cache.js";

export type CreateHatenaEditorStateOptions = SharedMboxEditorOptions & HatenaPluginsOptions;
export type CreateHatenaEditorOptions = CreateHatenaEditorStateOptions & { parent: HTMLElement };

/** Hatena-specific editor-state shortcut. Hatena-specific plugin options are
 * visible directly. */
export function createHatenaEditorState(options: CreateHatenaEditorStateOptions = {}): EditorState {
  return createNotationEditorState(options, hatenaPlugins(options), hatenaDefaultPresentationTheme);
}

export function createHatenaEditor(options: CreateHatenaEditorOptions): EditorView {
  const { parent, ...stateOptions } = options;
  return createEditorView({ parent, state: createHatenaEditorState(stateOptions) });
}
