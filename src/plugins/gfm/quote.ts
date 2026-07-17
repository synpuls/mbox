import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";

// Blockquotes, including GFM nested `>>` and lazy continuation. Two decorations
// cooperate:
//
//  - A `lineRange` per blockquote node draws the container (a left bar). Nested
//    quotes emit nested ranges; each carries its depth as a CSS custom property,
//    and because CodeMirror lets a later line decoration override an earlier one's
//    attributes, the DEEPEST range wins on a shared line, so `--mbox-gfm-quote-depth`
//    always reflects the deepest nesting on that line.
//  - A per-marker `replace` hides each `>` on inactive lines, FLUSH LEFT — the
//    quoted text sits directly against the container, exactly like the mbox
//    notation's quotes (the sideways shift when focus reveals the raw `> ` is an
//    accepted part of the presentation). A lazy-continuation line has no `>` to
//    hide, yet still sits inside the container.
export const gfmQuoteClassName = "mbox-gfm-quote";

function createGfmQuoteSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  const containers: MboxDecorationSpec[] = document.blockquotes.map((block) => ({
    type: "lineRange",
    from: block.from,
    to: block.to,
    className: gfmQuoteClassName,
    attributes: { style: `--mbox-gfm-quote-depth: ${block.depth}` },
  }));

  const markers: MboxDecorationSpec[] = document.quoteMarkers.flatMap((marker) => {
    if (activeLines.has(marker.line)) {
      return [];
    }
    return [{ type: "replace", from: marker.from, to: marker.to }];
  });

  return [...containers, ...markers];
}

// Nesting made visible, GitHub-style: one vertical bar PER depth level, plus an
// indent that clears them. A repeating gradient paints a 3px bar every 1em; its
// painted width is sized from the per-line `--mbox-gfm-quote-depth` custom
// property (set by the deepest lineRange on the line), so depth 1 shows one bar,
// depth 2 two bars, and so on — all from a single line element.
const gfmQuoteTheme: MboxThemeSpec = {
  [`.${gfmQuoteClassName}`]: {
    backgroundImage: "repeating-linear-gradient(to right, rgba(127, 127, 127, 0.4) 0 3px, transparent 3px 1em)",
    backgroundRepeat: "no-repeat",
    // Start the bars at the editor's own text column (the 6px `.cm-line` left
    // padding), not at the line element's edge — the bars line up with the
    // surrounding text instead of jutting out to its left.
    backgroundPosition: "6px 0",
    backgroundSize: "calc((var(--mbox-gfm-quote-depth, 1) - 1) * 1em + 3px) 100%",
    paddingLeft: "calc(6px + (var(--mbox-gfm-quote-depth, 1) - 1) * 1em + 3px + 0.5em)",
    color: "rgba(90, 90, 90, 1)",
  },
};

export function gfmQuotePlugin(): MboxPlugin {
  return {
    theme: gfmQuoteTheme,
    name: "gfm/quote",
    decorations: (context) => createGfmQuoteSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
