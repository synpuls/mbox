import { createContentMarkSpec, type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";

// Definition lists: `:用語:説明` (a term + description) and `::説明` (a
// continuation description). Real Hatena renders these as `<dl><dt><dd>`, one
// `<dd>` per `::`, stacked vertically: the term (dt) sits on its own row and the
// description (dd) drops to the next row, indented. mbox reproduces that stacking
// within a single source line by rendering the term as a block, so the
// description flows onto the next visual row; a `::` line is a bare indented dd.
// The reveal model hides the `:` markers on inactive lines and shows the raw
// colons on the active line for editing.
export const hatenaDefinitionLineClassName = "mbox-hatena-deflist";
export const hatenaDefinitionContinuationClassName = "mbox-hatena-deflist-cont";
export const hatenaDefinitionTermClassName = "mbox-hatena-deflist-term";

function createHatenaDefinitionSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.lines.flatMap((line) => {
    const definition = line.definition;
    if (!definition) {
      return [];
    }

    const className = definition.continuation
      ? `${hatenaDefinitionLineClassName} ${hatenaDefinitionContinuationClassName}`
      : hatenaDefinitionLineClassName;
    const specs: MboxDecorationSpec[] = [{ type: "line", from: line.from, className }];

    if (activeLines.has(line.line)) {
      return specs;
    }

    specs.push({ type: "replace", from: definition.marker.from, to: definition.marker.to });
    if (definition.term) {
      specs.push(createContentMarkSpec(definition.term.from, definition.term.to, hatenaDefinitionTermClassName));
    }
    if (definition.separator) {
      specs.push({ type: "replace", from: definition.separator.from, to: definition.separator.to });
    }
    return specs;
  });
}

export function hatenaDefinitionPlugin(): MboxPlugin {
  return {
    theme: {
      // The description (dd) is indented; the term (dt) hangs back to the left
      // edge via a negative margin so it aligns with the `:` column.
      [`.${hatenaDefinitionLineClassName}`]: { paddingLeft: "2.2em" },
      // The continuation line is a bare dd: indented like the description, no
      // term of its own.
      [`.${hatenaDefinitionContinuationClassName}`]: { paddingLeft: "2.2em" },
      // The term renders as its own block, so the description flows onto the next
      // visual row — matching Hatena's stacked <dt>/<dd>.
      [`.${hatenaDefinitionTermClassName}`]: { display: "block", marginLeft: "-2.2em", fontWeight: "700" },
    },
    name: "hatena/definition",
    decorations: hatenaDecorationProvider(createHatenaDefinitionSpecs),
  };
}
