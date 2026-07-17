import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import { createInlineStyleKitSpecs } from "../inline-style-kit.js";
import type { GfmDocument, GfmInlineStyleType } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { isLineSpanActive } from "./active-lines.js";

// Inline emphasis / strong / strikethrough. The content run is always marked;
// the open/close markers are hidden on idle lines and revealed on active ones —
// the same reveal pattern as the example's strong plugin (and, like it, inline
// markers do NOT reserve width: revealing a `*` does nudge the rest of the line,
// which the codebase accepts for inline syntax while reserving width for block
// markers such as headings).
//
// MULTI-LINE SPANS (the tree-vs-line-reveal tension): mdast happily produces one
// emphasis node spanning a soft line break, so its open and close markers live on
// DIFFERENT lines. The reveal model gates on a single active line, so we must
// decide what happens when only one of the span's lines is active. DECISION: a
// span reveals its markers when ANY line it touches is active (hidden only when
// the whole span is idle). Rationale: whichever line the caret is on, the user is
// editing inside that emphasis and needs to see the full `*...*` delimiters to
// understand the structure; revealing only the near marker would show an
// unbalanced span. The two markers are separate single-line `replace` ranges, so
// neither ever swallows the newline.
export const gfmInlineClassNames: Record<GfmInlineStyleType, string> = {
  emphasis: "mbox-gfm-em",
  strong: "mbox-gfm-strong",
  delete: "mbox-gfm-del",
};

function createGfmInlineSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  const styleSpecs = document.inlineStyles.flatMap((style) =>
    createInlineStyleKitSpecs(
      { openMarker: style.open, content: style.content, closeMarker: style.close, className: gfmInlineClassNames[style.type] },
      !isLineSpanActive(style, activeLines),
    ),
  );
  return [...styleSpecs, ...createGfmHardBreakSpecs(document, activeLines), ...createGfmEscapeSpecs(document, activeLines)];
}

// A backslash hard break (`foo\` + newline) has a marker character to hide: the
// trailing `\`. On an idle line it is replaced away so the break reads as clean
// text; on the active line it returns so the user sees what produces the break.
// The two-trailing-spaces form has no visible marker, so there is nothing to hide.
function createGfmHardBreakSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.hardBreaks.flatMap((hardBreak) => {
    if (!hardBreak.backslash || activeLines.has(hardBreak.line)) {
      return [];
    }
    return [{ type: "replace" as const, from: hardBreak.from, to: hardBreak.from + 1 }];
  });
}

// A backslash escape renders as just the escaped character on idle lines — the
// `\` itself is syntax, revealed like any other marker on the active line.
function createGfmEscapeSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.escapes.flatMap((escape) => {
    if (activeLines.has(escape.line)) {
      return [];
    }
    return [{ type: "replace" as const, from: escape.from, to: escape.to }];
  });
}

const gfmInlineTheme: MboxThemeSpec = {
  ".mbox-gfm-em": { fontStyle: "italic" },
  ".mbox-gfm-strong": { fontWeight: "bold" },
  ".mbox-gfm-del": { textDecoration: "line-through" },
};

export function gfmInlinePlugin(): MboxPlugin {
  return {
    theme: gfmInlineTheme,
    name: "gfm/inline",
    decorations: (context) => createGfmInlineSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
