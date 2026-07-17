import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";

// Nested unordered lists (`-item`, `--item`, ...). Following the polished mbox
// and scrapbox list plugins, the raw hyphen run is replaced in BOTH focused and
// unfocused states by fixed-width marker slots. The slot paints a dash on active
// lines and a dot on inactive lines, while the document text stays untouched.
// The line also gets a hanging indent so soft-wrapped text aligns with the item
// content instead of continuing under the marker.
export const hatenaListLineClassName = "mbox-hatena-list";
export const hatenaListActiveClassName = "mbox-hatena-list-active";
export const hatenaListCollapsedClassName = "mbox-hatena-list-collapsed";
export const hatenaListMarkerClassName = "mbox-hatena-list-marker";
export const hatenaListIndentClassName = "mbox-hatena-list-indent";
export const hatenaListMarkerSlotClassName = "mbox-hatena-list-marker-slot";
export const hatenaListMarkerSlotActiveClassName = "mbox-hatena-list-marker-slot-active";
export const hatenaListMarkerSlotCollapsedClassName = "mbox-hatena-list-marker-slot-collapsed";
export const hatenaListMarkerSlotOrderedClassName = "mbox-hatena-list-marker-slot-ordered";
const hatenaListDepthProperty = "--mbox-hatena-list-depth";
const hatenaListHangProperty = "--mbox-hatena-list-hang";
const hatenaListIndentLevelWidthEm = 1.2;
const hatenaListMarkerSlotWidthEm = 1;

// Exported for the co-located widget test only — not part of the hatena barrel.
export class HatenaListMarkerWidget extends WidgetType {
  constructor(
    private readonly depth: number,
    private readonly active: boolean,
    /** 1-based number for an ordered (`+`) item; null renders a bullet dot. */
    private readonly ordinal: number | null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as HatenaListMarkerWidget;
    return (
      this.constructor === other.constructor &&
      this.depth === target.depth &&
      this.active === target.active &&
      this.ordinal === target.ordinal
    );
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = hatenaListMarkerClassName;

    for (let level = 0; level < this.depth; level += 1) {
      const innermost = level === this.depth - 1;
      const slot = document.createElement("span");
      if (innermost && this.ordinal !== null) {
        // Ordered item: the number IS the marker (no ::after dot).
        slot.className = `${hatenaListMarkerSlotClassName} ${hatenaListMarkerSlotOrderedClassName}`;
        slot.textContent = `${this.ordinal}.`;
      } else if (innermost) {
        slot.className = [
          hatenaListMarkerSlotClassName,
          this.active ? hatenaListMarkerSlotActiveClassName : hatenaListMarkerSlotCollapsedClassName,
        ].join(" ");
        slot.textContent = "​";
      } else {
        slot.className = hatenaListIndentClassName;
        slot.textContent = "​";
      }
      marker.appendChild(slot);
    }

    return marker;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function hatenaListHangEm(depth: number): number {
  return hatenaListMarkerSlotWidthEm + Math.max(0, depth - 1) * hatenaListIndentLevelWidthEm;
}

function createHatenaListSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.lines.flatMap((line) => {
    if (!line.list) {
      return [];
    }

    const active = activeLines.has(line.line);
    const className = [
      hatenaListLineClassName,
      active ? hatenaListActiveClassName : hatenaListCollapsedClassName,
    ].join(" ");

    return [
      {
        type: "line",
        from: line.from,
        className,
        attributes: {
          style: `${hatenaListDepthProperty}:${line.list.depth}; ${hatenaListHangProperty}: ${hatenaListHangEm(
            line.list.depth,
          )}em`,
        },
      },
      {
        type: "replace",
        from: line.list.marker.from,
        to: line.list.marker.to,
        widget: new HatenaListMarkerWidget(line.list.depth, active, line.list.ordinal),
      },
    ];
  });
}

export function hatenaListPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${hatenaListLineClassName}`]: {
        boxSizing: "border-box",
        paddingLeft: `calc(6px + var(${hatenaListHangProperty}, ${hatenaListMarkerSlotWidthEm}em))`,
        textIndent: `calc(-1 * var(${hatenaListHangProperty}, ${hatenaListMarkerSlotWidthEm}em))`,
      },
      [`.${hatenaListMarkerClassName}`]: {
        display: "inline-block",
        textIndent: "0",
        whiteSpace: "pre",
      },
      [`.${hatenaListIndentClassName}`]: {
        display: "inline-block",
        width: `${hatenaListIndentLevelWidthEm}em`,
        whiteSpace: "pre",
      },
      [`.${hatenaListMarkerSlotClassName}`]: {
        display: "inline-block",
        position: "relative",
        width: `${hatenaListMarkerSlotWidthEm}em`,
        whiteSpace: "pre",
      },
      [`.${hatenaListMarkerSlotClassName}::after`]: {
        content: '""',
        position: "absolute",
        left: "0",
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
      },
      [`.${hatenaListMarkerSlotCollapsedClassName}::after`]: {
        width: "0.4em",
        height: "0.4em",
        borderRadius: "50%",
        background: "var(--mbox-hatena-list-marker-color, #575d63)",
      },
      [`.${hatenaListMarkerSlotActiveClassName}::after`]: {
        width: "0.65em",
        height: "2px",
        borderRadius: "999px",
        background: "var(--mbox-hatena-list-active-marker-color, #575d63)",
      },
      [`.${hatenaListMarkerSlotOrderedClassName}`]: {
        // The number sits right-aligned against the content, like an <ol> marker.
        textAlign: "right",
        paddingRight: "0.25em",
        color: "var(--mbox-hatena-list-marker-color, #575d63)",
      },
    },
    name: "hatena/list",
    decorations: hatenaDecorationProvider(createHatenaListSpecs),
  };
}
