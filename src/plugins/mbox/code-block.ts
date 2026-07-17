// Renders a fenced ``` code block as a card. The opening ``` fence line becomes
// a "header line" carrying the language label plus a Copy button widget, with
// the raw ``` fence text hidden; the content lines become the card body, which
// the SEPARATE highlight plugin token-colors for JS/TS; the closing ``` fence is
// hidden. Any ACTIVE (selected) fence line reveals its raw ``` text so it stays
// editable — the header dressing (label + Copy) is dropped there.
//
// The Copy button widget, language-id resolution (with a filename-extension
// fallback), the highlight-token computation, the language-label range, and
// the content-line-start offsets are all shared with gfm's code-block plugin
// via code-block-kit; this file only adapts MboxCodeBlock into the kit's plain
// value shapes and builds the card's own line/container specs (mbox has no
// indented-code-block case and doesn't wrap the card in a lineRange the way
// gfm does, so that part stays namespace-local).
//
// Styling: this plugin emits stable `mbox-*` classes; most visual styling lives in
// consumer CSS (src/styles.css for the demos). The one exception is monospace:
// unlike table's, this is NOT a hard layout requirement (no ch-unit math depends
// on it) -- it's a strong, near-universal convention for how code looks. It ships
// in this plugin's own theme anyway (matching gfm's code-block plugin), so a bare
// codeBlockPlugin() keeps its existing default look; the value is CSS-variable
// overridable (--mbox-code-block-font-family) for a host who wants a different one.
import type { Language } from "@codemirror/language";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxBlock, MboxCodeBlock, MboxDocument } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import {
  CodeBlockKitCopyButtonWidget as CodeBlockCopyButtonWidget,
  createCodeBlockKitHighlightSpecs,
  getCodeBlockKitContentLineStarts,
  getCodeBlockKitLanguage,
  getCodeBlockKitLanguageLabelRange,
} from "../code-block-kit.js";
import { createCodeBlockKitLanguageLoader } from "../code-block-language-loader.js";

export { CodeBlockCopyButtonWidget };

const codeBlockLineClassName = "mbox-code-block-line";
const codeBlockOpeningFenceClassName = "mbox-code-opening-fence";
const codeBlockClosingFenceClassName = "mbox-code-closing-fence";
export const codeBlockClassNames = {
  block: "mbox-code-block",
  fenceLine: "mbox-code-fence-line",
  headerLine: "mbox-code-header-line",
  openingFenceLine: "mbox-code-opening-fence-line",
  closingFenceLine: "mbox-code-closing-fence-line",
  contentLine: "mbox-code-content-line",
  copyButton: "mbox-code-copy-button",
  info: "mbox-code-info",
  languageLabel: "mbox-code-language-label",
  text: "mbox-code-text",
};
export const codeBlockHighlightClassNames = {
  token: "mbox-code-token",
};

function createCodeBlockSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers = new Set(),
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "codeBlock" ? createCodeBlockSpecsForBlock(block, activeLines) : [],
  );
}

export function codeBlockPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${codeBlockClassNames.block}`]: {
        fontFamily:
          'var(--mbox-code-block-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
      },
    },
    name: "mbox/code-block",
    decorations: (context) => [
      ...createCodeBlockSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers),
      ...createCodeBlockFenceMarkerHideSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers),
    ],
  };
}

// With no options this stays fully synchronous, resolving only JS/TS via
// code-block-kit's small hardcoded list. Passing `languages` switches to
// dynamically loading from CodeMirror's full @codemirror/language-data
// registry instead (see code-block-language-loader.ts for why this needs to
// be async, and why it's kept out of code-block-kit's own dependency graph
// until a host actually asks for it).
export interface CodeBlockHighlightPluginOptions {
  /** Restrict dynamic loading to these language names/aliases/extensions, or
   * pass `"all"` to allow any language in the full @codemirror/language-data
   * registry (still only loaded, one dynamic import at a time, for a
   * language actually used in the document). Omit entirely to skip the
   * dynamic loader altogether and stay on the zero-dependency JS/TS sync
   * default. */
  languages?: readonly string[] | "all";
  onLoadError?: (languageId: string, error: unknown) => void;
}

export function codeBlockHighlightPlugin(options: CodeBlockHighlightPluginOptions = {}): MboxPlugin {
  if (!options.languages) {
    return {
      name: "mbox/code-block-highlight",
      decorations: (context) => createCodeBlockHighlightSpecs(getMboxDocumentFromState(context.state), getCodeBlockKitLanguage),
    };
  }

  const loader = createCodeBlockKitLanguageLoader(
    (state) =>
      getMboxDocumentFromState(state)
        .blocks.filter((block): block is MboxCodeBlock => block.type === "codeBlock")
        .map((block) => block.infoValue),
    {
      ...(options.languages === "all" ? {} : { languages: options.languages }),
      onLoadError: options.onLoadError,
    },
  );

  return {
    extensions: [loader.extension],
    name: "mbox/code-block-highlight",
    decorations: (context) => createCodeBlockHighlightSpecs(getMboxDocumentFromState(context.state), loader.getLanguage),
  };
}

export function getCodeBlockLanguageId(block: MboxBlock | undefined): string | null {
  if (block?.type !== "codeBlock") {
    return null;
  }

  const [languageId] = block.infoValue.trim().split(/\s+/, 1);
  return languageId ? languageId.toLowerCase() : null;
}

function createCodeBlockHighlightSpecs(
  document: MboxDocument,
  getLanguage: (infoValue: string) => Language | null,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) => {
    if (block.type !== "codeBlock") {
      return [];
    }

    const language = getLanguage(block.infoValue);
    if (!language) {
      return [];
    }

    return createCodeBlockKitHighlightSpecs(block.value, block.content.from, language, codeBlockHighlightClassNames.token);
  });
}

function createCodeBlockFenceMarkerHideSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) => {
    if (block.type !== "codeBlock") {
      return [];
    }

    const specs: MboxDecorationSpec[] = [];
    if (!activeLines.has(block.line)) {
      specs.push({
        type: "replace",
        from: block.openingFence.from,
        to: block.openingFence.from + 3,
      });
    }

    const closingLine = getClosingFenceLine(block);
    if (block.closingFence && !activeLines.has(closingLine)) {
      specs.push({
        type: "replace",
        from: block.closingFence.from,
        to: block.closingFence.from + 3,
      });
    }

    return specs;
  });
}

function createCodeBlockSpecsForBlock(block: MboxCodeBlock, activeLines: MboxActiveLineNumbers): MboxDecorationSpec[] {
  const openingFenceActive = activeLines.has(block.line);

  return [
    ...createCodeBlockLineSpecs(block, openingFenceActive),
    { ...block.openingFence, className: codeBlockOpeningFenceClassName },
    { ...block.info, className: codeBlockClassNames.info },
    ...(!openingFenceActive ? createCodeBlockLanguageLabelSpecs(block) : []),
    ...(!openingFenceActive ? createCodeBlockCopyButtonSpecs(block) : []),
    ...createCodeTextSpecs(block),
    ...(block.closingFence ? [{ ...block.closingFence, className: codeBlockClosingFenceClassName }] : []),
  ];
}

function createCodeBlockLineSpecs(block: MboxCodeBlock, openingFenceActive: boolean): MboxDecorationSpec[] {
  return [
    {
      type: "line",
      from: block.openingFence.from,
      className: [
        codeBlockLineClassName,
        codeBlockClassNames.block,
        codeBlockClassNames.fenceLine,
        codeBlockClassNames.openingFenceLine,
        openingFenceActive ? "" : codeBlockClassNames.headerLine,
      ]
        .filter(Boolean)
        .join(" "),
    },
    ...getCodeBlockKitContentLineStarts(block.content, block.value).map((from) => ({
      type: "line" as const,
      from,
      className: `${codeBlockLineClassName} ${codeBlockClassNames.block} ${codeBlockClassNames.contentLine}`,
    })),
    ...(block.closingFence
      ? [
          {
            type: "line" as const,
            from: block.closingFence.from,
            className: `${codeBlockLineClassName} ${codeBlockClassNames.block} ${codeBlockClassNames.fenceLine} ${codeBlockClassNames.closingFenceLine}`,
          },
        ]
      : []),
  ];
}

function createCodeBlockCopyButtonSpecs(block: MboxCodeBlock): MboxDecorationSpec[] {
  return [
    {
      type: "widget",
      from: block.openingFence.to,
      widget: new CodeBlockCopyButtonWidget(block.value, codeBlockClassNames.copyButton),
      side: 1,
    },
  ];
}

function createCodeBlockLanguageLabelSpecs(block: MboxCodeBlock): MboxDecorationSpec[] {
  const range = getCodeBlockKitLanguageLabelRange(block.infoValue, block.info.from);
  return range ? [{ ...range, className: codeBlockClassNames.languageLabel }] : [];
}

function createCodeTextSpecs(block: MboxCodeBlock): MboxDecorationSpec[] {
  return splitContentLineRanges(block).map((range) => ({
    ...range,
    className: codeBlockClassNames.text,
  }));
}

function getClosingFenceLine(block: MboxCodeBlock): number {
  return block.line + block.value.split("\n").length;
}

function splitContentLineRanges(block: MboxCodeBlock) {
  const ranges: Array<{ from: number; to: number }> = [];
  let lineFrom = block.content.from;

  for (let index = 0; index < block.value.length; index += 1) {
    if (block.value[index] !== "\n") {
      continue;
    }

    const lineTo = block.content.from + index + 1;
    if (lineFrom < lineTo) {
      ranges.push({ from: lineFrom, to: lineTo });
    }
    lineFrom = lineTo;
  }

  if (lineFrom < block.content.to) {
    ranges.push({ from: lineFrom, to: block.content.to });
  }

  return ranges;
}
