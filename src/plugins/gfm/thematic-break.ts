import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";

// Thematic breaks (`---`, `***`, `___`). On an idle line the raw marker run is
// replaced by a horizontal-rule widget so the break reads as a divider; on an
// active line the raw characters return so the user edits them directly. A line
// class rides along in both states for consistent vertical spacing.
export const gfmThematicBreakLineClassName = "mbox-gfm-hr-line";
export const gfmThematicBreakClassName = "mbox-gfm-hr";

export class GfmThematicBreakWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return this.constructor === other.constructor;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement("span");
    rule.className = gfmThematicBreakClassName;
    rule.setAttribute("role", "separator");
    return rule;
  }
}

function createGfmThematicBreakSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.thematicBreaks.flatMap((rule) => {
    const specs: MboxDecorationSpec[] = [
      { type: "line", from: rule.from, className: gfmThematicBreakLineClassName },
    ];
    if (!activeLines.has(rule.line)) {
      specs.push({ type: "replace", from: rule.from, to: rule.to, widget: new GfmThematicBreakWidget() });
    }
    return specs;
  });
}

const gfmThematicBreakTheme: MboxThemeSpec = {
  [`.${gfmThematicBreakClassName}`]: {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
    borderTop: "2px solid rgba(127, 127, 127, 0.4)",
  },
};

export function gfmThematicBreakPlugin(): MboxPlugin {
  return {
    theme: gfmThematicBreakTheme,
    name: "gfm/thematic-break",
    decorations: (context) =>
      createGfmThematicBreakSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
