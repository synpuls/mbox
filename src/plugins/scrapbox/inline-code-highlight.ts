import { ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { createCodeBlockKitHighlightSpecs } from "../code-block-kit.js";
import { createCodeBlockKitLanguageLoader } from "../code-block-language-loader.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxInlineCodeTokenClassName = "mbox-scrapbox-code-token";

// Real Scrapbox highlights inline code (`` `...` ``) via highlight.js's
// content-based auto-detection (confirmed live: its DOM carries hljs-*
// classes) -- but mbox's own code-block highlighting is Lezer-based, and
// pulling in a second highlighting engine just for this would be a real
// architectural fork. Fixing the language to Ruby instead reuses the
// existing Lezer infra with no new dependency (Ruby is already in
// @codemirror/language-data's registry, backed by @codemirror/legacy-modes,
// which is already transitively installed): many short technical snippets
// tokenize into something reasonable even when they aren't actually Ruby,
// since keywords/strings/identifiers are broadly similar shapes across
// languages. A benchmark (see dev-docs/todo.md) found this stays responsive
// even without a cache at realistic per-document span counts; the cache
// below is kept anyway as cheap insurance, and is cleared on every doc
// change so it never grows past what the current document contains.
const RUBY_LANGUAGE_ID = "ruby";

export interface ScrapboxInlineCodeHighlightPluginOptions {
  onLoadError?: (languageId: string, error: unknown) => void;
}

/** Whether any line outside a code/table block has an inline `code` node.
 * The language loader only starts Ruby's dynamic import once this is true,
 * so enabling this plugin costs nothing until inline code actually shows up
 * in the document. */
export function scrapboxDocumentHasInlineCode(document: ScrapboxDocument): boolean {
  const blockLineNumbers = scrapboxBlockLineNumbers(document);
  return document.lines.some((line) => {
    if (blockLineNumbers.has(line.line)) return false;
    return (
      collectScrapboxInlineNodeResults(line.inline, (node) => (node.type === "code" ? [node] : [])).length > 0
    );
  });
}

/** Clears `cache` on every doc change, so the text-keyed highlight cache
 * below never retains specs for text no longer in the document. */
export function createInlineCodeCacheClearer(cache: Map<string, MboxDecorationSpec[]>): Extension {
  return ViewPlugin.define(() => ({
    update(update: ViewUpdate): void {
      if (update.docChanged) {
        cache.clear();
      }
    },
  }));
}

export function scrapboxInlineCodeHighlightPlugin(
  options: ScrapboxInlineCodeHighlightPluginOptions = {},
): MboxPlugin {
  const loader = createCodeBlockKitLanguageLoader(
    (state) => (scrapboxDocumentHasInlineCode(getScrapboxDocumentFromState(state)) ? [RUBY_LANGUAGE_ID] : []),
    {
      languages: [RUBY_LANGUAGE_ID],
      onLoadError: options.onLoadError,
    },
  );
  // Keyed by the span's raw text (from=0 specs); re-offset per occurrence
  // below, rather than re-tokenizing identical code every decoration pass.
  const cache = new Map<string, MboxDecorationSpec[]>();

  function highlightNode(node: ScrapboxInlineNode): MboxDecorationSpec[] {
    if (node.type !== "code") {
      return [];
    }
    const language = loader.getLanguage(RUBY_LANGUAGE_ID);
    if (!language) {
      return [];
    }
    let specs = cache.get(node.value);
    if (!specs) {
      specs = createCodeBlockKitHighlightSpecs(node.value, 0, language, scrapboxInlineCodeTokenClassName);
      cache.set(node.value, specs);
    }
    const offset = node.content.from;
    return specs.map((spec) => ({ ...spec, from: spec.from + offset, to: spec.to + offset }));
  }

  return {
    extensions: [loader.extension, createInlineCodeCacheClearer(cache)],
    name: "scrapbox/inline-code-highlight",
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      const blockLineNumbers = scrapboxBlockLineNumbers(document);
      return document.lines.flatMap((line) => {
        // Token colors stay active even on the active line. The surrounding
        // backtick marker/background behavior is owned by scrapboxDecorationPlugin,
        // which still leaves active-line code literal; code block/table lines
        // are never processed as inline content.
        if (blockLineNumbers.has(line.line)) {
          return [];
        }
        return collectScrapboxInlineNodeResults(line.inline, highlightNode);
      });
    },
  };
}
