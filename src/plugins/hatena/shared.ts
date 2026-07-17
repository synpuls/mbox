import type { WidgetType } from "@codemirror/view";
import type { MboxDecorationProvider, MboxDecorationSpec, MboxThemeSpec } from "../../editor/plugin.js";
import type { HatenaDocument, HatenaLine } from "./parser.js";
import { getHatenaDocumentFromState } from "./parser-cache.js";

// Shared plumbing for the Hatena plugins. Each plugin builds its specs from the
// parsed document plus the set of active (revealed) line numbers; this module
// captures the wiring and grouping that would otherwise be copy-pasted per file.

/**
 * Wire a `(document, activeLines) => specs` builder into an
 * {@link MboxDecorationProvider}. Collapses the one `decorations` line every
 * Hatena plugin repeats — read the cached parse, pass the active line numbers —
 * so each plugin only supplies its builder.
 */
export function hatenaDecorationProvider(
  create: (document: HatenaDocument, activeLines: Set<number>) => MboxDecorationSpec[],
): MboxDecorationProvider {
  return (context) => create(getHatenaDocumentFromState(context.state), context.activeLineNumbers);
}

/** The role a line plays in a literal block (`>|…|<` pre, `>||…||<` super-pre). */
export type HatenaLiteralBlockRole = "opener" | "body" | "closer" | null;

/**
 * Group a document's literal-block lines into opener-triggered runs and emit one
 * `lineRange` per block plus a `replace` that hides each marker line while
 * inactive. pre and super-pre share this exactly; they differ only in which role
 * field they read and whether an opener reveals a widget (super-pre's lang label).
 */
export function emitLiteralBlockSpecs(
  document: HatenaDocument,
  activeLines: Set<number>,
  options: {
    roleOf: (line: HatenaLine) => HatenaLiteralBlockRole;
    className: string;
    widgetFor?: (line: HatenaLine) => WidgetType | undefined;
  },
): MboxDecorationSpec[] {
  const { roleOf, className, widgetFor } = options;

  const blocks: HatenaLine[][] = [];
  for (const line of document.lines) {
    const role = roleOf(line);
    if (role === null) {
      continue;
    }
    if (role === "opener" || blocks.length === 0) {
      blocks.push([]);
    }
    blocks[blocks.length - 1].push(line);
  }

  return blocks.flatMap((block) => {
    const first = block[0];
    const last = block[block.length - 1];
    const specs: MboxDecorationSpec[] = [{ type: "lineRange", from: first.from, to: last.to, className }];
    for (const line of block) {
      // Only the marker lines carry hideable syntax; the body is literal content
      // and always shown. Reveal a marker on its active line.
      const role = roleOf(line);
      const isMarker = role === "opener" || role === "closer";
      if (!isMarker || activeLines.has(line.line)) {
        continue;
      }
      const widget = widgetFor?.(line);
      specs.push(
        widget
          ? { type: "replace", from: line.from, to: line.to, widget }
          : { type: "replace", from: line.from, to: line.to },
      );
    }
    return specs;
  });
}

/**
 * The structural rule shared by every multi-line literal block: overrides the
 * editor's own line-wrapping default so "literal" content displays exactly as
 * written, unwrapped. Font, background, and corner radii are visual
 * preference, not structural -- a host opts in through its own presentation
 * theme on the public class passed in here.
 */
export function literalBlockTheme(className: string): MboxThemeSpec {
  return {
    [`.${className}`]: {
      whiteSpace: "pre",
    },
  };
}
