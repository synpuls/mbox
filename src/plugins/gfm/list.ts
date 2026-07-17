import type { EditorState } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import { createReplaceSpec, type MboxDecorationSpec, type MboxPlugin, type MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { createTaskCheckboxInput, updateTaskCheckboxInput } from "../task-checkbox-kit.js";

// Bullet lists (with GFM task-list checkboxes). Nesting is preserved by the raw
// leading indentation, which is real document text and stays in the layout; the
// depth is surfaced only as a `-d{n}` class for optional CSS. The bullet marker
// `- ` is hidden on inactive lines and replaced by a fixed-WIDTH widget: an
// inline-block box whose width is the marker's exact char count in `ch`, so the
// glyph inside (a bullet dot, or a checkbox) can render at any intrinsic size
// while the content after it keeps the same x — the layout-stability rule applied
// to a widget rather than a hanging indent.
export const gfmListLineClassName = "mbox-gfm-list-line";
export const gfmTaskLineClassName = "mbox-gfm-task-line";
export const gfmBulletClassName = "mbox-gfm-bullet";
export const gfmTaskCheckboxClassName = "mbox-gfm-task-checkbox";
export const gfmListDepthClassName = (depth: number): string => `mbox-gfm-li-d${depth}`;

export class GfmBulletWidget extends WidgetType {
  constructor(
    readonly width: number,
    /** The glyph shown in the box: a dot for bullets, the raw "1." for ordered. */
    readonly label: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as GfmBulletWidget;
    return this.constructor === other.constructor && this.width === target.width && this.label === target.label;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = gfmBulletClassName;
    // The inline-block box is pinned to the marker's width; the glyph floats inside.
    span.style.display = "inline-block";
    span.style.width = `${this.width}ch`;
    span.textContent = this.label;
    return span;
  }
}

export class GfmTaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    /** Document range of the `[ ]` / `[x]` bracket, for the toggle dispatch. */
    readonly from: number,
    readonly to: number,
    readonly readOnly = false,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as GfmTaskCheckboxWidget;
    return (
      this.constructor === other.constructor &&
      this.checked === target.checked &&
      this.from === target.from &&
      this.to === target.to &&
      this.readOnly === target.readOnly
    );
  }

  toDOM(view: EditorView): HTMLElement {
    // An INTERACTIVE checkbox: CodeMirror passes the EditorView to `toDOM`, so a
    // click can dispatch the `[ ]` <-> `[x]` text edit directly (mirroring the mbox
    // task-list widget). The slot is COMPACT (2ch, themed below) like the mbox
    // notation's — reserving the whole raw `- [ ] ` width would leave a gaping
    // hole between the box and the text.
    const span = document.createElement("span");
    span.className = gfmTaskCheckboxClassName;
    span.appendChild(createTaskCheckboxInput(view, { checked: this.checked, from: this.from, to: this.to }));
    return span;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (dom.className !== gfmTaskCheckboxClassName || dom.childElementCount !== 1) {
      return false;
    }
    const input = dom.firstElementChild;
    return input instanceof HTMLInputElement && input.type === "checkbox"
      ? updateTaskCheckboxInput(input, view, { checked: this.checked, from: this.from, to: this.to })
      : false;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function createGfmListSpecs(document: GfmDocument, activeLines: Set<number>, state: EditorState): MboxDecorationSpec[] {
  return document.listItems.flatMap((item) => {
    const className = item.task
      ? `${gfmListLineClassName} ${gfmListDepthClassName(item.depth)} ${gfmTaskLineClassName}`
      : `${gfmListLineClassName} ${gfmListDepthClassName(item.depth)}`;
    // A line decoration must sit at the line START — a nested item's bullet
    // offset is mid-line (after the indentation), so resolve the real line start.
    const lineFrom = state.doc.line(item.line).from;
    const specs: MboxDecorationSpec[] = [{ type: "line", from: lineFrom, to: lineFrom, className }];

    // Active: keep the raw `- ` / `- [ ] ` so the user edits it directly.
    if (activeLines.has(item.line)) {
      return specs;
    }

    if (item.task) {
      // Replace the whole `- [ ] ` prefix with one compact checkbox slot.
      specs.push(
        ...createReplaceSpec(
          item.bullet.from,
          item.task.marker.to,
          // The `[ ]` bracket is the first three chars of the marker range; that is
          // the exact span the click toggles.
          new GfmTaskCheckboxWidget(item.task.checked, item.task.marker.from, item.task.marker.from + 3, state.readOnly),
        ),
      );
    } else {
      // Ordered items keep their number (it carries meaning); bullets show a dot.
      const label = item.ordered ? state.doc.sliceString(item.bullet.from, item.bullet.to).trim() : "•";
      specs.push(
        ...createReplaceSpec(item.bullet.from, item.bullet.to, new GfmBulletWidget(item.bullet.to - item.bullet.from, label)),
      );
    }
    return specs;
  });
}

const gfmListTheme: MboxThemeSpec = {
  [`.${gfmBulletClassName}`]: { textAlign: "center", opacity: "0.65" },
  // The same compact slot the mbox notation's task list uses: a 2ch inline-flex
  // box, checkbox sized to the text (1em) and optically centered in the slot.
  [`.${gfmTaskCheckboxClassName}`]: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: "0",
    blockSize: "1lh",
    inlineSize: "2ch",
    justifyContent: "flex-start",
    // Top-align the 1lh box: sitting on the BASELINE its descender half would
    // push the line taller than its text (focused vs unfocused height jump).
    verticalAlign: "top",
  },
  [`.${gfmTaskCheckboxClassName} input`]: {
    blockSize: "1em",
    boxSizing: "border-box",
    font: "inherit",
    inlineSize: "1em",
    margin: "0 0 0 calc(0.5ch - 0.5em)",
    verticalAlign: "-0.125em",
  },
};

export function gfmListPlugin(): MboxPlugin {
  return {
    theme: gfmListTheme,
    name: "gfm/list",
    decorations: (context) => createGfmListSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers, context.state),
  };
}
