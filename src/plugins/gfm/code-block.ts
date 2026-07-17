// Fenced code blocks rendered as a card, matching the mbox notation's code-block
// presentation. The opening fence line becomes a "header line" carrying the
// language label plus a working Copy button, with the raw ```` ``` ```` hidden;
// the interior lines become the card body; the closing fence is hidden. Any
// ACTIVE fence line reveals its raw ```` ``` ```` so it stays editable — the
// header dressing is dropped there.
//
// The card's outer container is one `lineRange` spec (README multi-line section):
// every member line gets `mbox-gfm-code-block`, and the boundary lines pick up the
// `-first` / `-last` suffixes so CSS draws the top/bottom edges. On top of that,
// per-line classes distinguish the header, body and closing fence, exactly as the
// mbox card does (mbox has no indented-code-block case and so never needs the
// lineRange container itself — that part stays namespace-local). JS/TS token
// colouring is a SEPARATE opt-in plugin so the base card carries no parser weight
// unless the host asks for highlighting.
//
// The Copy button widget, language-id resolution, the highlight-token computation,
// the language-label range, and the content-line-start offsets are shared with
// mbox's code-block plugin via code-block-kit.
import type { Language } from "@codemirror/language";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmCodeBlock, GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import {
  CodeBlockKitCopyButtonWidget as GfmCodeBlockCopyButtonWidget,
  createCodeBlockKitHighlightSpecs,
  getCodeBlockKitContentLineStarts,
  getCodeBlockKitLanguage,
  getCodeBlockKitLanguageLabelRange,
} from "../code-block-kit.js";
import { createCodeBlockKitLanguageLoader } from "../code-block-language-loader.js";

export { GfmCodeBlockCopyButtonWidget };

export const gfmCodeBlockClassName = "mbox-gfm-code-block";
export const gfmCodeBlockClassNames = {
  fenceLine: "mbox-gfm-code-fence-line",
  headerLine: "mbox-gfm-code-header-line",
  openingFenceLine: "mbox-gfm-code-opening-fence-line",
  closingFenceLine: "mbox-gfm-code-closing-fence-line",
  contentLine: "mbox-gfm-code-content-line",
  copyButton: "mbox-gfm-code-copy-button",
  languageLabel: "mbox-gfm-code-language-label",
  token: "mbox-gfm-code-token",
};

function createGfmCodeBlockSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.codeBlocks.flatMap((block) => createSpecsForBlock(block, activeLines));
}

function createSpecsForBlock(block: GfmCodeBlock, activeLines: Set<number>): MboxDecorationSpec[] {
  // The container is drawn for every block (fenced or indented) via one lineRange.
  const specs: MboxDecorationSpec[] = [
    { type: "lineRange", from: block.from, to: block.to, className: gfmCodeBlockClassName },
  ];

  // An indented code block has no fences and no header dressing — the container is
  // the whole story. Content-line classes still help the body read as a card.
  const contentLineStarts = getCodeBlockKitContentLineStarts(block.content, block.value);
  for (const from of contentLineStarts) {
    specs.push({ type: "line", from, to: from, className: gfmCodeBlockClassNames.contentLine });
  }

  if (!block.fenced) {
    return specs;
  }

  const openingActive = activeLines.has(block.firstLine);
  specs.push({
    type: "line",
    from: block.openingFence.from,
    to: block.openingFence.from,
    className: openingActive
      ? `${gfmCodeBlockClassNames.fenceLine} ${gfmCodeBlockClassNames.openingFenceLine}`
      : `${gfmCodeBlockClassNames.fenceLine} ${gfmCodeBlockClassNames.openingFenceLine} ${gfmCodeBlockClassNames.headerLine}`,
  });

  if (!openingActive) {
    // Hide the raw fence run, keep the info string visible and mark its first token
    // as the language label, and float a Copy button after the info.
    specs.push({ type: "replace", from: block.openingFence.from, to: block.openingFence.to });
    const label = getCodeBlockKitLanguageLabelRange(block.infoValue, block.info.from);
    if (label) {
      specs.push({ type: "mark", from: label.from, to: label.to, className: gfmCodeBlockClassNames.languageLabel });
    }
    specs.push({
      type: "widget",
      from: block.info.to,
      to: block.info.to,
      widget: new GfmCodeBlockCopyButtonWidget(block.value, gfmCodeBlockClassNames.copyButton),
      side: 1,
    });
  }

  if (block.closingFence) {
    const closingActive = activeLines.has(block.lastLine);
    specs.push({
      type: "line",
      from: block.closingFence.from,
      to: block.closingFence.from,
      className: `${gfmCodeBlockClassNames.fenceLine} ${gfmCodeBlockClassNames.closingFenceLine}`,
    });
    if (!closingActive) {
      specs.push({ type: "replace", from: block.closingFence.from, to: block.closingFence.to });
    }
  }

  return specs;
}

const gfmCodeBlockTheme: MboxThemeSpec = {
  [`.${gfmCodeBlockClassName}`]: {
    fontFamily:
      'var(--mbox-code-block-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
  },
};

export function gfmCodeBlockPlugin(): MboxPlugin {
  return {
    theme: gfmCodeBlockTheme,
    name: "gfm/code-block",
    decorations: (context) => createGfmCodeBlockSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}

// The opt-in token highlighter: a second plugin so the base card stays cheap.
// With no options this stays fully synchronous, resolving only JS/TS via
// code-block-kit's small hardcoded list. Passing `languages` switches to
// dynamically loading from CodeMirror's full @codemirror/language-data
// registry instead (see code-block-language-loader.ts for why this needs to
// be async, and why it's kept out of this file's own dependency graph until
// a host actually asks for it).
export interface GfmCodeBlockHighlightPluginOptions {
  /** Restrict dynamic loading to these language names/aliases/extensions, or
   * pass `"all"` to allow any language in the full @codemirror/language-data
   * registry (still only loaded, one dynamic import at a time, for a
   * language actually used in the document). Omit entirely to skip the
   * dynamic loader altogether and stay on the zero-dependency JS/TS sync
   * default. */
  languages?: readonly string[] | "all";
  onLoadError?: (languageId: string, error: unknown) => void;
}

function createHighlightSpecs(document: GfmDocument, getLanguage: (infoValue: string) => Language | null): MboxDecorationSpec[] {
  return document.codeBlocks.flatMap((block) => {
    const language = getLanguage(block.infoValue);
    if (!language) {
      return [];
    }
    return createCodeBlockKitHighlightSpecs(block.value, block.content.from, language, gfmCodeBlockClassNames.token);
  });
}

export function gfmCodeBlockHighlightPlugin(options: GfmCodeBlockHighlightPluginOptions = {}): MboxPlugin {
  if (!options.languages) {
    return {
      name: "gfm/code-block-highlight",
      decorations: (context) => createHighlightSpecs(getGfmDocumentFromState(context.state), getCodeBlockKitLanguage),
    };
  }

  const loader = createCodeBlockKitLanguageLoader(
    (state) => getGfmDocumentFromState(state).codeBlocks.map((block) => block.infoValue),
    {
      ...(options.languages === "all" ? {} : { languages: options.languages }),
      onLoadError: options.onLoadError,
    },
  );

  return {
    extensions: [loader.extension],
    name: "gfm/code-block-highlight",
    decorations: (context) => createHighlightSpecs(getGfmDocumentFromState(context.state), loader.getLanguage),
  };
}
