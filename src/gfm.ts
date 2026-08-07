import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createNotationEditorState, type SharedMboxEditorOptions } from "./editor/create-editor.js";
import { createEditorView } from "./editor/create-editor.js";
import { gfmPlugins, type GfmPluginsOptions } from "./plugins/gfm/index.js";
import { gfmDefaultPresentationTheme } from "./themes/gfm-presentation.js";

export { gfmPlugins } from "./plugins/gfm/index.js";
export type { GfmPluginsOptions } from "./plugins/gfm/index.js";
export {
  gfmHeadingClassNames,
  gfmHeadingLineClassName,
  gfmHeadingPlugin,
  gfmHeadingSetextUnderlineClassName,
} from "./plugins/gfm/heading.js";
export {
  gfmBulletClassName,
  gfmListDepthClassName,
  gfmListLineClassName,
  gfmListPlugin,
  gfmTaskCheckboxClassName,
  gfmTaskLineClassName,
  GfmBulletWidget,
  GfmTaskCheckboxWidget,
} from "./plugins/gfm/list.js";
export { gfmQuoteClassName, gfmQuotePlugin } from "./plugins/gfm/quote.js";
export {
  gfmCodeBlockClassName,
  gfmCodeBlockClassNames,
  gfmCodeBlockHighlightPlugin,
  gfmCodeBlockPlugin,
  GfmCodeBlockCopyButtonWidget,
} from "./plugins/gfm/code-block.js";
export type { GfmCodeBlockHighlightPluginOptions } from "./plugins/gfm/code-block.js";
export { gfmMathClassName, gfmMathPlugin, GfmMathWidget } from "./plugins/gfm/math.js";
export type { GfmMathPluginOptions, GfmMathRenderer } from "./plugins/gfm/math.js";
export { gfmImageClassName, gfmImageClassNames, gfmImagePlugin } from "./plugins/gfm/image.js";
export type { GfmImagePluginOptions, GfmImageRenderMode } from "./plugins/gfm/image.js";
export {
  gfmFootnoteClassName,
  gfmFootnoteMarkerClassName,
  gfmFootnotePlugin,
  gfmFootnoteRefClassName,
  GfmFootnoteRefWidget,
} from "./plugins/gfm/footnote.js";
export { gfmInlineClassNames, gfmInlinePlugin } from "./plugins/gfm/inline.js";
export { gfmInlineCodeClassName, gfmInlineCodePlugin } from "./plugins/gfm/inline-code.js";
export { gfmLinkClassName, gfmLinkPlugin, gfmUnsafeLinkClassName, GfmLinkWidget } from "./plugins/gfm/link.js";
export type { GfmLinkOptions } from "./plugins/gfm/link.js";
export { gfmTableClassNames, gfmTablePlugin, gfmTableRawCellClassName, gfmTableRenderedClassName } from "./plugins/gfm/table.js";
export {
  gfmThematicBreakClassName,
  gfmThematicBreakLineClassName,
  gfmThematicBreakPlugin,
  GfmThematicBreakWidget,
} from "./plugins/gfm/thematic-break.js";
export { adaptGfmDocument, parseGfmDocument } from "./plugins/gfm/parser.js";
export type {
  GfmBlockquote,
  GfmCodeBlock,
  GfmCodeBlockContentSegment,
  GfmCodeBlockLanguage,
  GfmDocument,
  GfmEscape,
  GfmFootnoteDefinition,
  GfmFootnoteReference,
  GfmHardBreak,
  GfmHeading,
  GfmImage,
  GfmInlineCode,
  GfmInlineStyle,
  GfmInlineStyleType,
  GfmLink,
  GfmListItem,
  GfmQuoteMarker,
  GfmRange,
  GfmTable,
  GfmTableAlign,
  GfmTableCell,
  GfmTableRow,
  GfmTask,
  GfmThematicBreak,
} from "./plugins/gfm/parser.js";
export { gfmDefaultPresentationTheme, gfmDefaultPresentationThemeSpec } from "./themes/gfm-presentation.js";
export { getGfmDocumentFromState } from "./plugins/gfm/parser-cache.js";

export type CreateGfmEditorStateOptions = SharedMboxEditorOptions & GfmPluginsOptions;
export type CreateGfmEditorOptions = CreateGfmEditorStateOptions & { parent: HTMLElement };

/** GFM-specific editor-state shortcut. GFM-specific plugin options are visible
 * directly. */
export function createGfmEditorState(options: CreateGfmEditorStateOptions = {}): EditorState {
  return createNotationEditorState(options, gfmPlugins(options), gfmDefaultPresentationTheme);
}

export function createGfmEditor(options: CreateGfmEditorOptions): EditorView {
  const { parent, ...stateOptions } = options;
  return createEditorView({ parent, state: createGfmEditorState(stateOptions) });
}
