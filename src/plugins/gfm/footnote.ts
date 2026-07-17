import { WidgetType } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { createInactiveInlineNotationSpecs } from "../inline-notation-kit.js";

// GFM footnotes, presented the way the original HyperMD presents FOOTREF /
// FOOTNOTE:
//
//  - an idle `[^1]` reference collapses to a small superscript-style CHIP
//    showing the label, with the definition's text as its tooltip (mdast hands
//    us the cross-reference for free, so the doc-wide map costs nothing);
//  - a `[^1]: body` definition keeps its marker VISIBLE — the marker is the
//    footnote's identity, not noise — and the whole block (including indented
//    continuation lines) is dressed smaller and muted. The dressing is pure
//    styling, applied focused or not, so line heights stay focus-stable.
export const gfmFootnoteClassName = "mbox-gfm-footnote";
export const gfmFootnoteMarkerClassName = "mbox-gfm-footnote-marker";
export const gfmFootnoteRefClassName = "mbox-gfm-footnote-ref";

export class GfmFootnoteRefWidget extends WidgetType {
  constructor(
    readonly label: string,
    /** The definition's flattened body, shown as the chip's tooltip. */
    readonly note: string,
    readonly targetId?: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as GfmFootnoteRefWidget;
    return this.constructor === other.constructor
      && this.label === target.label
      && this.note === target.note
      && this.targetId === target.targetId;
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.targetId ? "a" : "span");
    element.className = gfmFootnoteRefClassName;
    element.textContent = this.label;
    if (this.targetId) {
      element.setAttribute("href", `#${this.targetId}`);
      element.setAttribute("role", "doc-noteref");
      element.setAttribute("aria-label", `Footnote ${this.label}`);
    }
    if (this.note) {
      element.title = this.note;
    }
    return element;
  }
}

function createGfmFootnoteSpecs(
  document: GfmDocument,
  state: EditorState,
  activeLines: Set<number>,
): MboxDecorationSpec[] {
  const definitionsByIdentifier = new Map(document.footnoteDefinitions.map((definition) => [definition.identifier, definition]));
  const isDefinitionInactive = (definition: GfmDocument["footnoteDefinitions"][number]) => {
    for (let line = definition.startLine; line <= definition.endLine; line += 1) {
      if (activeLines.has(line)) return false;
    }
    return true;
  };

  const referenceSpecs: MboxDecorationSpec[] = document.footnoteReferences.flatMap((reference) =>
    createInactiveInlineNotationSpecs(
      reference,
      activeLines.has(reference.line),
      () => {
        const definition = definitionsByIdentifier.get(reference.identifier);
        return new GfmFootnoteRefWidget(
          reference.label,
          definition?.text ?? "",
          definition && isDefinitionInactive(definition) ? `gfm-footnote-${definition.from}` : undefined,
        );
      },
    ),
  );

  const definitionSpecs: MboxDecorationSpec[] = document.footnoteDefinitions.flatMap((definition) => {
    const inactive = isDefinitionInactive(definition);
    const targetId = `gfm-footnote-${definition.from}`;
    const continuationLineStarts = Array.from(
      { length: definition.endLine - definition.startLine },
      (_, index) => state.doc.line(definition.startLine + index + 1).from,
    );
    const continuationIds = continuationLineStarts.map((lineStart) => `${targetId}-line-${lineStart}`);
    const definitionAttributes: Record<string, string> | undefined = inactive
      ? {
          id: targetId,
          role: "doc-footnote",
          "aria-label": `Footnote ${definition.label}`,
          ...(continuationIds.length > 0 ? { "aria-owns": continuationIds.join(" ") } : {}),
        }
      : undefined;
    const markerAttributes: Record<string, string> | undefined = inactive ? { "aria-hidden": "true" } : undefined;
    return [
      { type: "lineRange" as const, from: definition.from, to: definition.to, className: gfmFootnoteClassName },
      ...(inactive ? [{
        type: "line" as const,
        from: definition.from,
        to: definition.from,
        className: gfmFootnoteClassName,
        attributes: definitionAttributes!,
      }, ...continuationLineStarts.map((lineStart, index) => ({
        type: "line" as const,
        from: lineStart,
        to: lineStart,
        className: gfmFootnoteClassName,
        attributes: { id: continuationIds[index] },
      }))] : []),
      {
        type: "mark" as const,
        from: definition.marker.from,
        to: definition.marker.to,
        className: gfmFootnoteMarkerClassName,
        ...(markerAttributes ? { attributes: markerAttributes } : {}),
      },
    ];
  });

  return [...referenceSpecs, ...definitionSpecs];
}

const gfmFootnoteTheme: MboxThemeSpec = {
  // The chip stays inside the line box: sized down and top-aligned instead of
  // raised on the baseline, so an idle/focused swap never changes line height.
  [`.${gfmFootnoteRefClassName}`]: {
    display: "inline-block",
    fontSize: "0.7em",
    verticalAlign: "text-top",
    background: "rgba(127, 127, 127, 0.16)",
    borderRadius: "3px",
    padding: "0 0.35em",
    color: "#555",
    cursor: "default",
  },
  [`.${gfmFootnoteClassName}`]: {
    fontSize: "0.85em",
    color: "#666",
  },
  [`.${gfmFootnoteMarkerClassName}`]: {
    color: "#999",
  },
};

export function gfmFootnotePlugin(): MboxPlugin {
  return {
    theme: gfmFootnoteTheme,
    name: "gfm/footnote",
    decorations: (context) =>
      createGfmFootnoteSpecs(getGfmDocumentFromState(context.state), context.state, context.activeLineNumbers),
  };
}
