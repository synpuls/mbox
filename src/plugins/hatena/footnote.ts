import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";
import { createInactiveInlineNotationSpecs } from "../inline-notation-kit.js";

// Inline footnotes `((content))`. Real Hatena hoists them into a numbered list at
// the article end and leaves a superscript `*N` reference in the text. mbox is a
// line-oriented editor with no "article end" to append to, so it keeps the number
// INLINE: an idle `((content))` collapses to a superscript `*N` whose tooltip is
// the content (the same tooltip-only treatment as the gfm footnote chip). The raw
// `((content))` returns on the active line for editing.
export const hatenaFootnoteClassName = "mbox-hatena-footnote";
// A footnote line reserves the superscript's (taller) height whether or not it is
// active, so revealing the raw ((...)) for editing never shrinks the row.
export const hatenaFootnoteLineClassName = "mbox-hatena-footnote-line";

export class HatenaFootnoteWidget extends WidgetType {
  constructor(
    readonly number: number,
    /** The footnote body, shown as the superscript's tooltip. */
    readonly note: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as HatenaFootnoteWidget;
    return this.constructor === other.constructor && this.number === target.number && this.note === target.note;
  }

  toDOM(): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = hatenaFootnoteClassName;
    sup.textContent = `*${this.number}`;
    sup.setAttribute("role", "doc-footnote");
    sup.setAttribute("aria-label", `Footnote ${this.number}: ${this.note}`);
    if (this.note) {
      sup.title = this.note;
    }
    return sup;
  }
}

function createHatenaFootnoteSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.lines.flatMap((line) => {
    if (line.footnotes.length === 0) {
      return [];
    }
    // Reserve the superscript's height on every footnote line — active or not — so
    // switching to the raw ((...)) for editing keeps the row the same height.
    const active = activeLines.has(line.line);
    return [
      { type: "line", from: line.from, to: line.from, className: hatenaFootnoteLineClassName },
      ...line.footnotes.flatMap((footnote) =>
        createInactiveInlineNotationSpecs(footnote.marker, active, () => new HatenaFootnoteWidget(footnote.number, footnote.text)),
      ),
    ];
  });
}

export function hatenaFootnotePlugin(): MboxPlugin {
  return {
    theme: {
      [`.${hatenaFootnoteClassName}`]: {
        color: "var(--mbox-hatena-footnote-color, #119e4d)",
        cursor: "help",
        fontSize: "0.75em",
        padding: "0 0.15em",
        // Lift the number like a superscript WITHOUT growing the line box: baseline
        // alignment + a relative offset + zero line-height keep it out of layout, so
        // the row height is set solely by the footnote-line rule below (and stays
        // equal to the active line, which has no sup).
        verticalAlign: "baseline",
        position: "relative",
        top: "-0.35em",
        lineHeight: "0",
      },
      // Hold every footnote line at the same (slightly taller) height, active or
      // not, so focus — which swaps the sup for raw text — never changes it.
      [`.${hatenaFootnoteLineClassName}`]: { lineHeight: "1.5" },
    },
    name: "hatena/footnote",
    decorations: hatenaDecorationProvider(createHatenaFootnoteSpecs),
  };
}
