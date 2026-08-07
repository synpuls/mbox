import type { WidgetType } from "@codemirror/view";
import type { MboxReplaceDecorationSpec } from "../editor/plugin.js";

export interface InlineNotationKitRange {
  from: number;
  to: number;
}

/** The smallest document surface inline-notation lowering needs. */
export type InlineNotationSource = string | { sliceString(from: number, to: number): string };

/**
 * CodeMirror plugins cannot replace a range containing a line break. Keep this
 * decision beside the shared inline-notation reveal rule so a new caller
 * cannot accidentally reintroduce the crash by forgetting a second guard.
 *
 * Temporary 8-pre behavior: leave multiline notation raw. Section 8A replaces
 * this with the widget-plus-hidden-lines rendering model.
 */
export function canReplaceInlineNotation(range: InlineNotationKitRange, source: InlineNotationSource): boolean {
  const text = typeof source === "string" ? source.slice(range.from, range.to) : source.sliceString(range.from, range.to);
  return !text.includes("\n");
}

/**
 * Replaces `range` with a widget the caller's factory creates, on an inactive
 * line -- the reveal/hide rule shared by every inline notation (emoji, link,
 * footnote reference, formula, ...). On an active line, the raw source stays
 * as-is: no spec at all, and `createWidget` is never even called.
 */
export function createInactiveInlineNotationSpecs(
  range: InlineNotationKitRange,
  active: boolean,
  source: InlineNotationSource,
  createWidget: () => WidgetType,
): MboxReplaceDecorationSpec[] {
  return active || !canReplaceInlineNotation(range, source)
    ? []
    : [{ type: "replace", from: range.from, to: range.to, widget: createWidget() }];
}

export interface AnchorElementOptions {
  href: string;
  text: string;
  className: string;
  /** Extra attributes beyond href/class (e.g. `target`/`rel`); an `undefined`
   * value is skipped, so callers can pass a conditional attribute inline. */
  attributes?: Record<string, string | undefined>;
}

/** Builds the `<a>` DOM every link-shaped inline notation widget renders --
 * href, text, class, and any extra attributes. Notation-specific policy
 * (autolink styling, external-link target/rel, ...) is the caller's own
 * className/attributes, not something this function decides. */
export function createAnchorElement(options: AnchorElementOptions): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.className = options.className;
  anchor.setAttribute("href", options.href);
  anchor.textContent = options.text;

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    if (value !== undefined) {
      anchor.setAttribute(name, value);
    }
  }

  return anchor;
}
