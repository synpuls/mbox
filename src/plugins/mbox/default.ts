import type { MboxPlugin } from "../../editor/plugin.js";
import { mboxBracketPlugin } from "./bracket.js";
import { codeBlockHighlightPlugin, codeBlockPlugin, type CodeBlockHighlightPluginOptions } from "./code-block.js";
import { mboxCompletePlugin, type MboxCompletePluginOptions } from "./complete.js";
import { emojiPlugin } from "./emoji.js";
import { mboxFootnotePlugin } from "./footnote.js";
import { headingPlugin } from "./heading.js";
import { inlineCodePlugin } from "./inline-code.js";
import { inlineStylePlugin } from "./inline-style.js";
import { listPlugin } from "./list.js";
import { markdownImagePlugin, type MarkdownImagePluginOptions } from "./markdown-image.js";
import { pageLinkPlugin, type PageLinkPluginOptions } from "./page-link.js";
import { paragraphPlugin } from "./paragraph.js";
import { quotePlugin } from "./quote.js";
import { tablePlugin } from "./table.js";
import { taskListPlugin } from "./task-list.js";
import { urlLinkPlugin } from "./url-link.js";

export interface MboxPluginOptions {
  link?: PageLinkPluginOptions;
  image?: MarkdownImagePluginOptions;
  codeHighlight?: boolean | CodeBlockHighlightPluginOptions;
  /** Inert (no autocomplete extension installed) unless `recommend` is set. */
  complete?: MboxCompletePluginOptions;
}

function getMboxCodeHighlightOptions(
  codeHighlight: MboxPluginOptions["codeHighlight"],
): CodeBlockHighlightPluginOptions | undefined {
  return codeHighlight === true ? undefined : codeHighlight || undefined;
}

export function mboxPlugins(options: MboxPluginOptions = {}): MboxPlugin[] {
  return [
    mboxBracketPlugin(),
    mboxCompletePlugin(options.complete),
    paragraphPlugin(),
    headingPlugin(),
    listPlugin(),
    taskListPlugin(),
    quotePlugin(),
    pageLinkPlugin(options.link),
    mboxFootnotePlugin(),
    emojiPlugin(),
    urlLinkPlugin(),
    markdownImagePlugin(options.image),
    inlineCodePlugin(),
    inlineStylePlugin(),
    codeBlockPlugin(),
    ...(options.codeHighlight ? [codeBlockHighlightPlugin(getMboxCodeHighlightOptions(options.codeHighlight))] : []),
    tablePlugin(),
  ];
}
