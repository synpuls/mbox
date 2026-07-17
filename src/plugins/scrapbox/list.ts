import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

const scrapboxCaretAnchorClassName = "mbox-scrapbox-caret-anchor";

/**
 * A zero-width caret home rendered just after the indent box of an *empty* list
 * line. It exists purely so the caret (and, crucially, IME preedit text) lands
 * outside the fixed-width indent box instead of being folded into the box's own
 * text node. Its single zero-width-space child gives the browser a text node to
 * anchor the caret to; it carries no visible glyph and is not part of the
 * document, so it never affects the text or copy/paste.
 */
class ScrapboxCaretAnchorWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = scrapboxCaretAnchorClassName;
    span.textContent = "​";
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

export const scrapboxListLineClassName = "mbox-scrapbox-list-line";
export const scrapboxBulletClassName = "mbox-scrapbox-bullet";
const scrapboxBulletIndentClassName = "mbox-scrapbox-bullet-indent";
export const scrapboxNumberClassName = "mbox-scrapbox-number";
export const scrapboxIndentAttribute = "data-mbox-scrapbox-indent";

/**
 * A fixed-width box rendered in place of one raw indent space. Replacing the
 * space (rather than marking it) keeps the leading whitespace out of the DOM as
 * editable/selectable text — CodeMirror paints the widget instead — while the
 * document text is untouched, so the caret, backspace and indent commands still
 * operate on the real spaces. One widget per level preserves a caret stop
 * between levels. The innermost box is the bullet slot and carries the dot; the
 * outer boxes are plain indent steps.
 *
 * A zero-width space child gives the inline-block box the line's height (so the
 * dot's `top: 50%` centers on the text) without adding any raw indent space
 * back to the document.
 */
class ScrapboxIndentWidget extends WidgetType {
  constructor(readonly innermost: boolean) {
    super();
  }
  eq(other: ScrapboxIndentWidget): boolean {
    return other.innermost === this.innermost;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.innermost ? scrapboxBulletClassName : scrapboxBulletIndentClassName;
    span.textContent = "​";
    return span;
  }
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Width of one Scrapbox indent level, in em. The indent whitespace is rendered
 * at this fixed width per level (in both the focused and unfocused states), so
 * a half-width space and a full-width space indent by the same amount — as in
 * Scrapbox — and focus never shifts the content horizontally.
 */
export const scrapboxIndentLevelWidth = 1.5;

/**
 * Width of the innermost indent step — the slot that holds the bullet dot — in
 * em. The dot is centered in this slot and the item text begins at its right
 * edge, so a wider slot gives the dot more horizontal breathing room and a
 * roomier gap before the text. It matches the outer indent-level width so every
 * indent step is a uniform 1.5em. The raw indent space is hidden inside this
 * fixed-width slot so it never tacks its own width on top, which used to leave
 * the dot floating a whole space away from the text.
 */
const scrapboxBulletSlotWidth = scrapboxIndentLevelWidth;

/**
 * Diameter of the bullet dot, in em. Real Scrapbox paints a 6px dot on a 15px
 * line font — 0.4em; a smaller dot reads as too faint next to the item text.
 */
const scrapboxBulletDotSize = 0.4;

export const scrapboxListClassNames = {
  line: scrapboxListLineClassName,
};

export interface ScrapboxListClassNames {
  line: string;
  bullet: string;
  number: string;
}

/**
 * Build the list decorations for a parsed document.
 *
 * Following the markdown list plugin, this never replaces or resizes the raw
 * indent whitespace: the leading spaces/tabs are left completely untouched, so
 * the content keeps exactly the same horizontal position whether or not the
 * line is focused (revealed). The bullet is a class on the content span; its
 * dot is painted by an absolutely-positioned `::before` (see the theme below)
 * that occupies no inline width, so it can never shift the text either.
 *
 * Unlike the other scrapbox plugins, the bullet is kept on the active
 * (focused) line too: it hides no syntax, so — as in real Scrapbox — the dot
 * stays visible while the cursor is on the line. Only code and table blocks are
 * skipped.
 */
function createScrapboxListSpecs(
  document: ScrapboxDocument,
  classNames: ScrapboxListClassNames,
): MboxDecorationSpec[] {
  const skippedLineNumbers = scrapboxBlockLineNumbers(document);

  return document.lines.flatMap((line) => {
    if (line.listType === "none" || skippedLineNumbers.has(line.line)) {
      return [];
    }

    // Hang a soft-wrapped bullet line by its total indent width so the wrapped
    // continuation lines up with the item text instead of sliding back under the
    // bullet. The indent is drawn with fixed-em widgets (outer levels
    // 1.5em, the innermost bullet slot 1.0em), so the hang is that same em sum.
    // The number list keeps its raw marker, handled separately.
    const bulletHangEm =
      line.listType === "bullet" ? (line.indent - 1) * scrapboxIndentLevelWidth + scrapboxBulletSlotWidth : null;

    const specs: MboxDecorationSpec[] = [
      {
        type: "line",
        from: line.from,
        to: line.from,
        className: classNames.line,
        attributes: {
          [scrapboxIndentAttribute]: String(line.indent),
          ...(bulletHangEm !== null ? { style: `--mbox-scrapbox-list-hang: ${bulletHangEm}em` } : {}),
        },
      },
    ];

    if (line.listType === "bullet") {
      // Replace the leading indent whitespace with one fixed-width box per
      // level, so the raw spaces never render as editable/selectable text and
      // half/full-width spaces indent identically. Replacing on both focus
      // states keeps the content column stable when the line is revealed, and
      // the document text is untouched so caret/backspace/indent still work.
      // The innermost box is the bullet slot (it carries the dot, one Scrapbox
      // bullet-slot — 1.0em — left of the text); the outer boxes are full-width
      // indent steps. (A bullet line always has indent >= 1.)
      for (let level = 0; level < line.indent; level += 1) {
        const from = line.marker.from + level;
        const innermost = level === line.indent - 1;
        specs.push({
          type: "replace",
          from,
          to: from + 1,
          widget: new ScrapboxIndentWidget(innermost),
        });
      }
      // On an *empty* list line the indent box is the line's only inline box, so
      // the caret sits inside it — and CodeMirror folds IME preedit text into the
      // box's own text node, right-aligning the unconfirmed characters to the
      // left of the caret (the markdown list avoids this by not decorating the
      // active line at all). Placing a zero-width anchor immediately after the
      // box gives the caret — and the composition — a home outside the box, so
      // preedit text grows rightwards from the content edge, while the fixed
      // half/full-width indent box is kept intact.
      if (line.content.from === line.content.to) {
        specs.push({
          type: "widget",
          from: line.content.from,
          to: line.content.from,
          widget: new ScrapboxCaretAnchorWidget(),
          side: 1,
        });
      }
    } else if (line.listType === "number" && line.numberMarker) {
      specs.push({
        type: "mark",
        from: line.numberMarker.from,
        to: line.numberMarker.to,
        className: classNames.number,
      });
    }

    return specs;
  });
}

export function scrapboxListPlugin(): MboxPlugin {
  return {
    theme: {
      // Hang the wrap by the indent width (set per line via --mbox-scrapbox-list-hang)
      // while preserving CodeMirror's default `.cm-line` left padding (6px), so the
      // first line (bullet + text) does not move but wrapped lines align with the text.
      [`.${scrapboxListLineClassName}`]: {
        textIndent: "calc(var(--mbox-scrapbox-list-hang, 0px) * -1)",
        paddingLeft: "calc(6px + var(--mbox-scrapbox-list-hang, 0px))",
      },
      // Each indent level is a fixed-width inline-block box painted in place of a
      // raw space. The innermost box is the narrower bullet slot (its width is
      // the dot-left-edge-to-text distance, 1.0em, matching real Scrapbox); the
      // outer boxes are full 1.5em indent steps.
      // `line-height: normal` keeps each box only as tall as the font's natural
      // height, not the editor's expanded line-height. Without it the inline-block
      // box grows to the full line box, and a caret parked at the line start
      // (right against the box, with no text node before it) is measured against
      // that taller box — so it renders taller than the caret anywhere in the item
      // text. Matching the font height makes the caret one size wherever it sits,
      // and the dot still centers on the text (its `top: 50%` is half of a box that
      // now shares the text's own height).
      [`.${scrapboxBulletClassName}`]: {
        position: "relative",
        display: "inline-block",
        width: `${scrapboxBulletSlotWidth}em`,
        lineHeight: "normal",
        whiteSpace: "pre",
      },
      [`.${scrapboxBulletIndentClassName}`]: {
        display: "inline-block",
        width: `${scrapboxIndentLevelWidth}em`,
        lineHeight: "normal",
        whiteSpace: "pre",
      },
      // The dot is an absolutely-positioned pseudo-element (no inline width, so
      // it never shifts the text). It sits at the horizontal center of the bullet
      // slot — left inset by half the slot's leftover width — so a selected line
      // keeps the dot in the middle of its highlighted cell instead of hugging the
      // left edge. Vertically it is centered on the line (`top: 50%` of the box,
      // which shares the text's height, then pulled up half its own height).
      [`.${scrapboxBulletClassName}::after`]: {
        content: '""',
        position: "absolute",
        left: `${(scrapboxBulletSlotWidth - scrapboxBulletDotSize) / 2}em`,
        top: "50%",
        width: `${scrapboxBulletDotSize}em`,
        height: `${scrapboxBulletDotSize}em`,
        transform: "translateY(-50%)",
        borderRadius: "50%",
        background: "var(--mbox-scrapbox-bullet-color, #57606a)",
        pointerEvents: "none",
      },
    },
    name: "scrapbox/list",
    decorations: (context) =>
      createScrapboxListSpecs(getScrapboxDocumentFromState(context.state), {
        line: scrapboxListLineClassName,
        bullet: scrapboxBulletClassName,
        number: scrapboxNumberClassName,
      }),
  };
}
