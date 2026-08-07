import type { MboxPlugin } from "../../editor/plugin.js";
import { scrapboxBracketPlugin } from "./bracket.js";
import {
  scrapboxCodeBlockHighlightPlugin,
  scrapboxCodeBlockPlugin,
  type ScrapboxCodeBlockHighlightPluginOptions,
} from "./code-block.js";
import { scrapboxCommandLinePlugin } from "./command-line.js";
import { scrapboxCompletePlugin, type ScrapboxCompletePluginOptions } from "./complete.js";
import { scrapboxDecorationPlugin } from "./decoration.js";
import { scrapboxFormulaPlugin, type ScrapboxFormulaPluginOptions } from "./formula.js";
import { scrapboxImagePlugin, type ScrapboxImagePluginOptions } from "./image.js";
import { scrapboxIndentPlugin } from "./indent.js";
import { scrapboxInlineCodePlugin } from "./inline-code.js";
import {
  scrapboxInlineCodeHighlightPlugin,
  type ScrapboxInlineCodeHighlightPluginOptions,
} from "./inline-code-highlight.js";
import {
  scrapboxLinkPlugin,
  type ScrapboxLinkPluginOptions,
} from "./link.js";
import { scrapboxListPlugin } from "./list.js";
import { scrapboxQuotePlugin } from "./quote.js";
import { scrapboxTablePlugin } from "./table.js";
import { scrapboxTitlePlugin } from "./title.js";

// DELIBERATE LAYOUT DECISIONS (closed records; not a completeness audit)
//
// - Table icons reserve their column by the character count of their final
//   path segment. Wide resolver images can paint outside their cells. On
//   2026-07-31, the owner chose to do nothing: actual icons are nearly square
//   and fit, while widening every column would also widen those square-icon
//   columns. This is not a comprehensive upstream-audit result.
//
// - Icon repeats are limited to 20. On 2026-07-31, the owner chose this mbox
//   display safety limit: an over-limit count remains an internal link rather
//   than silently rendering fewer icons. The observed upstream `*100` case did
//   not appear to be cut off.

export interface ScrapboxPluginsOptions {
  /** Internal page/icon link rendering options. */
  link?: ScrapboxLinkPluginOptions;
  /** `true` adds scrapboxCodeBlockHighlightPlugin() with its zero-dependency
   * JS/TS default; pass a ScrapboxCodeBlockHighlightPluginOptions object
   * instead to also set `languages`/`onLoadError`. Omitted or falsy adds no
   * highlighter at all (kept off by default so the base card carries no
   * Lezer weight), matching gfm's own codeHighlight option. */
  codeHighlight?: boolean | ScrapboxCodeBlockHighlightPluginOptions;
  complete?: ScrapboxCompletePluginOptions;
  formula?: ScrapboxFormulaPluginOptions;
  image?: ScrapboxImagePluginOptions;
  /** `true` adds scrapboxInlineCodeHighlightPlugin(), highlighting inline
   * code (`` `...` ``) as Ruby -- a fixed approximation, not per-span language
   * detection (see the plugin's own doc comment for why mbox fixes the
   * language instead of detecting one).
   * Off by default: it dynamically loads Ruby's legacy-mode parser the first
   * time any inline code appears, which a consumer should opt into rather
   * than pay for unconditionally. */
  inlineCodeHighlight?: boolean | ScrapboxInlineCodeHighlightPluginOptions;
  /** `true` adds scrapboxTitlePlugin(), marking the document's first line as
   * the page title (an app-level convention, not part of the notation
   * itself). Off by default -- it changes the first line's visual
   * appearance once a presentation theme styles the class, so a consumer
   * opts in explicitly rather than getting a surprise restyle. */
  titleLine?: boolean;
}

function getScrapboxCodeHighlightOptions(
  codeHighlight: ScrapboxPluginsOptions["codeHighlight"],
): ScrapboxCodeBlockHighlightPluginOptions | undefined {
  return codeHighlight === true ? undefined : codeHighlight || undefined;
}

function getScrapboxInlineCodeHighlightOptions(
  inlineCodeHighlight: ScrapboxPluginsOptions["inlineCodeHighlight"],
): ScrapboxInlineCodeHighlightPluginOptions | undefined {
  return inlineCodeHighlight === true ? undefined : inlineCodeHighlight || undefined;
}

/**
 * Bundle of Scrapbox notation plugins: Tab indentation, list/indent structure,
 * block quotes, command lines, code blocks, tables, inline decoration/strong/
 * code styling, formulas, image previews and
 * internal/external/hashtag/icon link anchors.
 */
// Deliberately not a re-export barrel: the package entries re-export every
// public symbol straight from the feature modules, and a second export list
// here would only drift out of sync. This file is the bundle, nothing else.
export function scrapboxPlugins(options: ScrapboxPluginsOptions = {}): MboxPlugin[] {
  return [
    scrapboxBracketPlugin(),
    scrapboxInlineCodePlugin(),
    scrapboxCompletePlugin(options.complete),
    scrapboxIndentPlugin(),
    scrapboxListPlugin(),
    scrapboxQuotePlugin(),
    scrapboxCommandLinePlugin(),
    scrapboxCodeBlockPlugin(),
    ...(options.codeHighlight ? [scrapboxCodeBlockHighlightPlugin(getScrapboxCodeHighlightOptions(options.codeHighlight))] : []),
    scrapboxTablePlugin(),
    scrapboxDecorationPlugin(),
    ...(options.inlineCodeHighlight
      ? [scrapboxInlineCodeHighlightPlugin(getScrapboxInlineCodeHighlightOptions(options.inlineCodeHighlight))]
      : []),
    scrapboxFormulaPlugin(options.formula),
    scrapboxImagePlugin(options.image),
    scrapboxLinkPlugin(options.link),
    ...(options.titleLine ? [scrapboxTitlePlugin()] : []),
  ];
}
