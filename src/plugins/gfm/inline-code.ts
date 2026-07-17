import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import { createInlineStyleKitSpecs } from "../inline-style-kit.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { isLineSpanActive } from "./active-lines.js";

// Inline code `` `text` ``. The content run is always marked as monospace; the
// backtick fences are hidden on idle lines and revealed on active ones — the same
// reveal pattern as the inline emphasis plugin, applied to backticks. mdast does
// not report the fence width, so the adapter already recovered the exact open/close
// ranges from the source (a span may use one or several backticks). Following the
// inline-style DECISION, a span reveals BOTH fences when ANY line it touches is
// active, so a code span crossing a soft break never shows an unbalanced fence.
//
// This plugin ships no `theme`: the monospace font, background, and padding
// are visual preference, not structural. A host opts in through its own
// presentation theme on the public `.mbox-gfm-code` class.
export const gfmInlineCodeClassName = "mbox-gfm-code";

function createGfmInlineCodeSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.inlineCodes.flatMap((code) =>
    createInlineStyleKitSpecs(
      { openMarker: code.open, content: code.content, closeMarker: code.close, className: gfmInlineCodeClassName },
      !isLineSpanActive(code, activeLines),
    ),
  );
}

export function gfmInlineCodePlugin(): MboxPlugin {
  return {
    name: "gfm/inline-code",
    decorations: (context) => createGfmInlineCodeSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
