import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";

// ATX headings, presented the way the mbox notation presents its own: an
// unfocused heading is FLUSH LEFT — hiding `# ` moves the content to the line
// start, and the sideways shift when focus reveals the raw marker is an accepted
// part of the presentation (contrast lists, where a fixed-width slot keeps every
// line stable). No marker width is reserved.
export const gfmHeadingLineClassName = "mbox-gfm-heading";
export const gfmHeadingClassNames = {
  h1: "mbox-gfm-h1",
  h2: "mbox-gfm-h2",
  h3: "mbox-gfm-h3",
  h4: "mbox-gfm-h4",
  h5: "mbox-gfm-h5",
  h6: "mbox-gfm-h6",
};
const gfmHeadingLevelClassName = (level: number): string =>
  gfmHeadingClassNames[`h${level}` as keyof typeof gfmHeadingClassNames];

function createGfmHeadingSpecs(document: GfmDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.headings.flatMap((heading) => {
    const isActive = activeLines.has(heading.line);
    const levelClassName = gfmHeadingLevelClassName(heading.level);
    const markerWidth = heading.marker.to - heading.marker.from;

    // A setext heading (`Title` / `=====`) has no `#` marker — mdast reports its
    // marker range as zero width because the underline lives on the NEXT line and
    // there is no primitive to hide a whole line. We style the TEXT line like a
    // heading and leave the underline visible as a literal (documented in index.ts).
    if (isActive || markerWidth === 0) {
      const specs: MboxDecorationSpec[] = [
        {
          type: "line",
          from: heading.from,
          to: heading.from,
          className: `${gfmHeadingLineClassName} ${levelClassName}`,
        },
      ];
      return specs;
    }

    const specs: MboxDecorationSpec[] = [
      {
        type: "line",
        from: heading.from,
        to: heading.from,
        className: `${gfmHeadingLineClassName} ${levelClassName}`,
      },
      { type: "replace", from: heading.marker.from, to: heading.marker.to },
    ];
    return specs;
  });
}

export function gfmHeadingPlugin(): MboxPlugin {
  return {
    name: "gfm/heading",
    decorations: (context) => createGfmHeadingSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
