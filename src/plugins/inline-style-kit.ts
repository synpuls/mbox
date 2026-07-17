import { createContentMarkSpec, type MboxDecorationSpec } from "../editor/plugin.js";

/** @internal Constituent of the src-shared InlineStyleKitSpan; not a package export. */
export interface InlineStyleKitRange {
  from: number;
  to: number;
}

/**
 * One open-marker/content/close-marker span: emphasis, strong, strikethrough,
 * and inline code all share this shape across namespaces. `className` styles
 * the content; the markers carry no class of their own (a `replace` spec's
 * class lives on its widget, and these markers have none).
 */
export interface InlineStyleKitSpan {
  openMarker: InlineStyleKitRange;
  content: InlineStyleKitRange;
  closeMarker: InlineStyleKitRange;
  className: string;
}

/**
 * Mark the content, and hide both markers when `hideMarkers` is true. Callers
 * own the active/inactive decision — mbox reveals inline style spans only via
 * the inactive-node visitor (so it never calls this for an active node in the
 * first place), while GFM keeps the content mark on active lines too and
 * hides only the markers, gating `hideMarkers` on a multi-line "any touched
 * line is active" check. Neither policy lives in this kit.
 *
 * This assumes `span.content` is never empty: CodeMirror's mark decoration
 * throws for a from===to range (table-kit hit exactly this for an empty table
 * cell and had to special-case it with a widget). Verified this can't happen
 * here -- mbox's own parser rejects a delimiter pair with nothing between
 * (`parseDelimitedInlineStyleAt`/`parseInlineCodeAt` both return null), and
 * GFM's mdast/micromark adapter never emits an empty emphasis/strong/
 * inlineCode node for the same CommonMark reason. No defensive check added
 * here since the scenario is confirmed unreachable, not just unlikely.
 */
export function createInlineStyleKitSpecs(span: InlineStyleKitSpan, hideMarkers: boolean): MboxDecorationSpec[] {
  const specs: MboxDecorationSpec[] = createContentMarkSpec(span.content.from, span.content.to, span.className);

  if (hideMarkers) {
    specs.push({ type: "replace", ...span.openMarker });
    specs.push({ type: "replace", ...span.closeMarker });
  }

  return specs;
}
