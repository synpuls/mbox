import type { WidgetType } from "@codemirror/view";
import type { MboxReplaceDecorationSpec } from "../editor/plugin.js";

export interface InlineNotationKitRange {
  from: number;
  to: number;
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
  createWidget: () => WidgetType,
): MboxReplaceDecorationSpec[] {
  return active ? [] : [{ type: "replace", from: range.from, to: range.to, widget: createWidget() }];
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
