// The bundle for the Hatena notation namespace: one plugin per feature, gathered
// into a single array. A notation package is read by starting here and following
// the imports outward — parser (pure function) -> parser-cache (a doc-keyed
// cache) -> one plugin file per feature. Promoted to a full public namespace
// (exported from src/index.ts) alongside mbox/scrapbox/gfm.
import type { MboxPlugin } from "../../editor/plugin.js";
import { hatenaBlockquotePlugin } from "./blockquote.js";
import { hatenaDefinitionPlugin } from "./definition.js";
import { hatenaFootnotePlugin } from "./footnote.js";
import { hatenaHeadingPlugin } from "./heading.js";
import { hatenaLinkPlugin, type HatenaLinkOptions } from "./link.js";
import { hatenaListPlugin } from "./list.js";
import { hatenaPrePlugin } from "./pre.js";
import {
  hatenaSuperPreHighlightPlugin,
  hatenaSuperPrePlugin,
  type HatenaSuperPreHighlightPluginOptions,
} from "./super-pre.js";
import { hatenaTablePlugin } from "./table.js";

export interface HatenaPluginsOptions {
  link?: HatenaLinkOptions;
  /** `true` adds the super-pre syntax highlighter with its zero-dependency
   * JS/TS default; pass a HatenaSuperPreHighlightPluginOptions object instead
   * to also set `languages`/`onLoadError`. Omitted or falsy adds no
   * highlighter at all. */
  codeHighlight?: boolean | HatenaSuperPreHighlightPluginOptions;
}

function getHatenaCodeHighlightOptions(
  codeHighlight: HatenaPluginsOptions["codeHighlight"],
): HatenaSuperPreHighlightPluginOptions | undefined {
  return codeHighlight === true ? undefined : codeHighlight || undefined;
}

// Deliberately not a re-export barrel: the package entries re-export every
// public symbol straight from the feature modules, and a second export list
// here would only drift out of sync. This file is the bundle, nothing else.
export function hatenaPlugins(options: HatenaPluginsOptions = {}): MboxPlugin[] {
  return [
    // Super-pre first: it owns the literal block. The other plugins produce no
    // specs for its lines because the parser leaves them syntax-free — including
    // the table plugin, which never groups a super-pre line into a table.
    hatenaSuperPrePlugin(),
    ...(options.codeHighlight
      ? [hatenaSuperPreHighlightPlugin(getHatenaCodeHighlightOptions(options.codeHighlight))]
      : []),
    hatenaPrePlugin(),
    hatenaBlockquotePlugin(),
    hatenaHeadingPlugin(),
    hatenaListPlugin(),
    hatenaDefinitionPlugin(),
    hatenaLinkPlugin(options.link),
    hatenaFootnotePlugin(),
    hatenaTablePlugin(),
  ];
}
