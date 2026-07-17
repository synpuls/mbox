import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument, HatenaLine } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";

// Blockquote (`>> ... <<`), which Hatena allows to NEST. Nesting is represented
// as a per-line depth: the parser runs a running counter (`>>` opens, `<<`
// closes) and tags every line with its 1-based depth. This plugin emits two
// layers per quote run:
//
//   - one `lineRange` wrapping the whole run — the renderer tags its boundary
//     lines `-first` / `-last`, which carry the container's top/bottom edges;
//   - a per-line `line` spec whose inline background paints one vertical bar per
//     nesting level, so a depth-N line shows N stacked bars — the outer quote's
//     bar plus its own — making the nesting read as a box within a box.
//
// The `>>` / `<<` marker lines are hidden while inactive. What still does not
// fit the line model (see docs/hatena-dogfooding-friction-log.md): per-LEVEL
// structure (a `cite=` per nesting level, inline runs spanning a boundary), and
// hidden marker lines collapse to empty styled rows rather than to nothing.
export const hatenaQuoteBlockClassName = "mbox-hatena-quote-block";
export const hatenaQuoteClassName = "mbox-hatena-quote";
export const hatenaQuoteCiteClassName = "mbox-hatena-quote-cite";
const hatenaQuoteBarColor = "#cbd5e1";
const hatenaQuoteStepEm = 0.9;
const MAX_RENDER_DEPTH = 16;

// The repeating gradient paints a bar at every step and the finite background
// size stops it at the displayed depth. The bars and box tint ride in a single
// inline background — depth-dependent, so it can't be a static theme rule.
function hatenaQuoteLineStyle(depth: number): string {
  const visualDepth = Math.min(depth, MAX_RENDER_DEPTH);
  // The box tint is TRANSLUCENT on purpose: this background sits on the
  // `.cm-line` element, above CodeMirror's selection layer, so an opaque tint
  // would hide the selection highlight (same rule as the presentation themes'
  // literal-block backgrounds). Composites on white to the old #f8fafc.
  return `padding-left:calc(${visualDepth} * ${hatenaQuoteStepEm}em + 0.5em);background:repeating-linear-gradient(to right, ${hatenaQuoteBarColor} 0 3px, transparent 3px ${hatenaQuoteStepEm}em) 0 0/calc(${visualDepth} * ${hatenaQuoteStepEm}em) 100% no-repeat,rgba(148, 163, 184, 0.06);`;
}

export class HatenaQuoteCiteWidget extends WidgetType {
  constructor(readonly url: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return this.constructor === other.constructor && this.url === (other as HatenaQuoteCiteWidget).url;
  }

  toDOM(): HTMLElement {
    const cite = document.createElement("cite");
    cite.className = hatenaQuoteCiteClassName;
    const link = document.createElement("a");
    link.href = this.url;
    link.textContent = this.url;
    link.rel = "noreferrer";
    cite.append("— ", link);
    return cite;
  }
}

function createHatenaBlockquoteSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  const runs: HatenaLine[][] = [];
  for (const line of document.lines) {
    if (!line.quote) {
      continue;
    }
    const current = runs[runs.length - 1];
    if (!current || current[current.length - 1].line !== line.line - 1) {
      runs.push([]);
    }
    runs[runs.length - 1].push(line);
  }

  return runs.flatMap((run) => {
    const specs: MboxDecorationSpec[] = [
      { type: "lineRange", from: run[0].from, to: run[run.length - 1].to, className: hatenaQuoteBlockClassName },
    ];
    for (const line of run) {
      if (!line.quote) {
        continue;
      }
      specs.push({
        type: "line",
        from: line.from,
        className: hatenaQuoteClassName,
        attributes: { style: hatenaQuoteLineStyle(line.quote.depth) },
      });
      // The `>>` / `<<` lines are pure markers; the content lines between them
      // keep their text (and any inline links). Hide a marker only while inactive.
      const isMarker = line.quote.role === "open" || line.quote.role === "close";
      if (isMarker && !activeLines.has(line.line)) {
        // A `>URL>` cite opener shows the source instead of vanishing.
        const widget = line.quote.role === "open" && line.quote.cite ? new HatenaQuoteCiteWidget(line.quote.cite) : undefined;
        specs.push({ type: "replace", from: line.from, to: line.to, widget });
      }
    }
    return specs;
  });
}

export function hatenaBlockquotePlugin(): MboxPlugin {
  return {
    theme: {
      // The bars and box tint live in the per-line inline background (they depend
      // on depth); the run only owns its top/bottom edges and the text colour.
      [`.${hatenaQuoteBlockClassName}-first`]: { borderTop: "1px solid #e2e8f0" },
      [`.${hatenaQuoteBlockClassName}-last`]: { borderBottom: "1px solid #e2e8f0" },
      [`.${hatenaQuoteClassName}`]: { color: "#475569" },
      [`.${hatenaQuoteCiteClassName}`]: { color: "#64748b", fontSize: "0.85em", fontStyle: "normal" },
      [`.${hatenaQuoteCiteClassName} a`]: { color: "inherit" },
    },
    name: "hatena/blockquote",
    decorations: hatenaDecorationProvider(createHatenaBlockquoteSpecs),
  };
}
