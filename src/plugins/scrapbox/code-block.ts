import type { Language } from "@codemirror/language";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import {
  CodeBlockKitCopyButtonWidget as ScrapboxCodeBlockCopyButtonWidget,
  createCodeBlockKitSegmentedHighlightSpecs,
  getCodeBlockKitLanguageForFileName,
  type CodeBlockKitSegment,
} from "../code-block-kit.js";
import { createCodeBlockKitLanguageLoader } from "../code-block-language-loader.js";
import type { ScrapboxCodeBlock, ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentCacheEntryFromState, getScrapboxDocumentFromState } from "./parser-cache.js";

export { ScrapboxCodeBlockCopyButtonWidget };

export const scrapboxCodeBlockClassName = "mbox-scrapbox-code-block";
export const scrapboxCodeBlockOpenerClassName = "mbox-scrapbox-code-block-opener";
export const scrapboxCodeBlockBodyClassName = "mbox-scrapbox-code-block-body";
export const scrapboxCodeBlockKeywordClassName = "mbox-scrapbox-code-block-keyword";
export const scrapboxCodeBlockFileNameClassName = "mbox-scrapbox-code-block-filename";
export const scrapboxCodeBlockLanguageLabelClassName = "mbox-scrapbox-code-block-language-label";
export const scrapboxCodeBlockCopyButtonClassName = "mbox-scrapbox-code-block-copy-button";
export const scrapboxCodeBlockTokenClassName = "mbox-scrapbox-code-block-token";

const codeKeywordLength = "code:".length;

export const scrapboxCodeBlockClassNames = {
  codeBlock: scrapboxCodeBlockClassName,
  opener: scrapboxCodeBlockOpenerClassName,
  body: scrapboxCodeBlockBodyClassName,
  keyword: scrapboxCodeBlockKeywordClassName,
  fileName: scrapboxCodeBlockFileNameClassName,
  languageLabel: scrapboxCodeBlockLanguageLabelClassName,
  copyButton: scrapboxCodeBlockCopyButtonClassName,
  token: scrapboxCodeBlockTokenClassName,
};

/** Each bodyLine's stripped-indent slice as a `{from, to, text}` segment --
 * `from`/`to` is the document range that line's content occupies once its
 * required indent marker is excluded. Shared by the Copy button (joined into
 * one string) and the highlight plugin (parsed as one, but kept as separate
 * document ranges so token positions map back correctly). A line that is
 * only the required indent marker (no content after it) yields an empty
 * `text`, which still takes its place between its neighbors. */
function getCodeBlockSegments(input: string, block: ScrapboxCodeBlock): CodeBlockKitSegment[] {
  return block.bodyLines.map((body) => {
    const from = body.from + block.indent + 1;
    return { from, to: body.to, text: input.slice(from, body.to) };
  });
}

function createScrapboxCodeBlockSpecs(document: ScrapboxDocument, input: string): MboxDecorationSpec[] {
  return document.codeBlocks.flatMap((block) => {
    const opener = block.openerLine;
    const keywordEnd = opener.content.from + codeKeywordLength;

    const specs: MboxDecorationSpec[] = [
      {
        type: "line",
        from: opener.from,
        className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockOpenerClassName}`,
      },
      { type: "mark", from: opener.content.from, to: keywordEnd, className: scrapboxCodeBlockKeywordClassName },
    ];

    if (opener.to > keywordEnd) {
      specs.push({
        type: "mark",
        from: keywordEnd,
        to: opener.to,
        className: `${scrapboxCodeBlockFileNameClassName} ${scrapboxCodeBlockLanguageLabelClassName}`,
      });
    }

    specs.push({
      type: "widget",
      from: opener.to,
      widget: new ScrapboxCodeBlockCopyButtonWidget(
        getCodeBlockSegments(input, block)
          .map((segment) => segment.text)
          .join("\n"),
        scrapboxCodeBlockCopyButtonClassName,
      ),
      side: 1,
    });

    for (const body of block.bodyLines) {
      specs.push({
        type: "line",
        from: body.from,
        className: `${scrapboxCodeBlockClassName} ${scrapboxCodeBlockBodyClassName}`,
      });
    }

    return specs;
  });
}

// Monospace here isn't a hard layout requirement the way table's is (no
// ch-unit math depends on it) -- it's a strong convention for how code looks.
// It stays in this plugin's own theme anyway, matching mbox/gfm's code-block
// plugins, so a bare scrapboxCodeBlockPlugin() keeps its existing default
// look; the value is CSS-variable overridable (--mbox-code-block-font-family).
export function scrapboxCodeBlockPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${scrapboxCodeBlockClassName}`]: {
        fontFamily:
          'var(--mbox-code-block-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
    },
    name: "scrapbox/code-block",
    decorations: (context) => {
      const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
      return createScrapboxCodeBlockSpecs(document, input);
    },
  };
}

// With no options this stays fully synchronous, resolving only JS/TS via
// code-block-kit's small hardcoded list -- matching mbox/gfm's own
// codeBlockHighlightPlugin(). Passing `languages` switches to dynamically
// loading from CodeMirror's full @codemirror/language-data registry instead.
export interface ScrapboxCodeBlockHighlightPluginOptions {
  /** Restrict dynamic loading to these language names/aliases/extensions, or
   * pass `"all"` to allow any language in the full @codemirror/language-data
   * registry (still only loaded, one dynamic import at a time, for a
   * language actually used in the document). Omit entirely to skip the
   * dynamic loader altogether and stay on the zero-dependency JS/TS sync
   * default. */
  languages?: readonly string[] | "all";
  onLoadError?: (languageId: string, error: unknown) => void;
}

function createScrapboxCodeBlockHighlightSpecs(
  document: ScrapboxDocument,
  input: string,
  getLanguage: (fileName: string) => Language | null,
): MboxDecorationSpec[] {
  return document.codeBlocks.flatMap((block) => {
    const language = getLanguage(block.fileName);
    if (!language) {
      return [];
    }
    return createCodeBlockKitSegmentedHighlightSpecs(getCodeBlockSegments(input, block), language, scrapboxCodeBlockTokenClassName);
  });
}

export function scrapboxCodeBlockHighlightPlugin(options: ScrapboxCodeBlockHighlightPluginOptions = {}): MboxPlugin {
  if (!options.languages) {
    return {
      name: "scrapbox/code-block-highlight",
      decorations: (context) => {
        const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
        return createScrapboxCodeBlockHighlightSpecs(document, input, getCodeBlockKitLanguageForFileName);
      },
    };
  }

  const loader = createCodeBlockKitLanguageLoader(
    (state) => getScrapboxDocumentFromState(state).codeBlocks.map((block) => block.fileName),
    {
      ...(options.languages === "all" ? {} : { languages: options.languages }),
      onLoadError: options.onLoadError,
      infoValueKind: "fileName",
    },
  );

  return {
    extensions: [loader.extension],
    name: "scrapbox/code-block-highlight",
    decorations: (context) => {
      const { input, document } = getScrapboxDocumentCacheEntryFromState(context.state);
      return createScrapboxCodeBlockHighlightSpecs(document, input, loader.getLanguage);
    },
  };
}
