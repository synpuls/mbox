import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import type { MboxDocument, MboxFootnoteDefinitionBlock } from "./types.js";

export const mboxFootnoteClassName = "mbox-footnote";
export const mboxFootnoteMarkerClassName = "mbox-footnote-marker";
export const mboxFootnoteRefClassName = "mbox-footnote-ref";

export class MboxFootnoteRefWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly note: string,
    readonly targetId?: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as MboxFootnoteRefWidget;
    return this.constructor === other.constructor
      && this.label === target.label
      && this.note === target.note
      && this.targetId === target.targetId;
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.targetId ? "a" : "span");
    element.className = mboxFootnoteRefClassName;
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

function createMboxFootnoteSpecs(document: MboxDocument, activeLines: MboxActiveLineNumbers): MboxDecorationSpec[] {
  const definitions = document.blocks.filter(
    (block): block is MboxFootnoteDefinitionBlock => block.type === "footnoteDefinition",
  );
  // Map construction deliberately leaves the last duplicate definition as the
  // canonical target, matching the parser's reference resolution policy.
  const definitionsByIdentifier = new Map(definitions.map((definition) => [definition.identifier, definition]));

  const referenceSpecs = createInactiveInlineNodeSpecs(document, activeLines, (node) =>
    node.type === "footnoteRef"
      ? (() => {
          const definition = definitionsByIdentifier.get(node.identifier);
          const targetId = definition && !activeLines.has(definition.line) ? `mbox-footnote-${definition.from}` : undefined;
          return [{
            type: "replace" as const,
            from: node.from,
            to: node.to,
            widget: new MboxFootnoteRefWidget(node.value, definition?.value ?? "", targetId),
          }];
        })()
      : [],
  );

  const definitionSpecs: MboxDecorationSpec[] = definitions.flatMap((definition) => {
    const inactive = !activeLines.has(definition.line);
    const definitionAttributes: Record<string, string> | undefined = inactive
      ? { id: `mbox-footnote-${definition.from}`, role: "doc-footnote", "aria-label": `Footnote ${definition.label}` }
      : undefined;
    const markerAttributes: Record<string, string> | undefined = inactive ? { "aria-hidden": "true" } : undefined;
    return [
    {
      type: "lineRange" as const,
      from: definition.from,
      to: definition.to,
      className: mboxFootnoteClassName,
      ...(definitionAttributes ? { attributes: definitionAttributes } : {}),
    },
    {
      type: "mark" as const,
      from: definition.marker.from,
      to: definition.marker.to,
      className: mboxFootnoteMarkerClassName,
      ...(markerAttributes ? { attributes: markerAttributes } : {}),
    },
    ];
  });

  return [...referenceSpecs, ...definitionSpecs];
}

const mboxFootnoteTheme: MboxThemeSpec = {
  [`.${mboxFootnoteRefClassName}`]: {
    display: "inline-block",
    fontSize: "0.72em",
    verticalAlign: "text-top",
    background: "rgba(80, 100, 120, 0.14)",
    borderRadius: "3px",
    padding: "0 0.35em",
    color: "#4d5a66",
    cursor: "default",
  },
  [`.${mboxFootnoteClassName}`]: {
    fontSize: "0.86em",
    color: "#5f6872",
  },
  [`.${mboxFootnoteMarkerClassName}`]: {
    color: "#8a949e",
  },
};

export function mboxFootnotePlugin(): MboxPlugin {
  return {
    theme: mboxFootnoteTheme,
    name: "mbox/footnote",
    decorations: (context) => createMboxFootnoteSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers),
  };
}
