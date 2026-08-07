import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";

// Headings are presented flush left: an unfocused ATX heading hides `# `, and an
// unfocused setext heading hides its physical underline line. The sideways shift
// when focus reveals raw source is accepted (contrast lists, where a fixed-width
// slot keeps every line stable). No marker width is reserved.
export const gfmHeadingLineClassName = "mbox-gfm-heading";
export const gfmHeadingSetextUnderlineClassName = "mbox-gfm-heading-setext-underline";
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
    const isActive = activeLines.has(heading.line) || (heading.setextUnderline !== undefined && activeLines.has(heading.setextUnderline.line));
    const levelClassName = gfmHeadingLevelClassName(heading.level);
    const markerWidth = heading.marker.to - heading.marker.from;

    if (heading.setextUnderline !== undefined) {
      const specs: MboxDecorationSpec[] = [
        {
          type: "line",
          from: heading.from,
          className: `${gfmHeadingLineClassName} ${levelClassName}`,
        },
      ];
      if (!isActive) {
        specs.push({ type: "line", from: heading.setextUnderline.from, className: gfmHeadingSetextUnderlineClassName });
      }
      return specs;
    }

    if (isActive) {
      const specs: MboxDecorationSpec[] = [
        {
          type: "line",
          from: heading.from,
          className: `${gfmHeadingLineClassName} ${levelClassName}`,
        },
      ];
      return specs;
    }

    const specs: MboxDecorationSpec[] = [
      {
        type: "line",
        from: heading.from,
        className: `${gfmHeadingLineClassName} ${levelClassName}`,
      },
      { type: "replace", from: heading.marker.from, to: heading.marker.to },
    ];
    return specs;
  });
}

const gfmHeadingTheme: MboxThemeSpec = {
  [`.${gfmHeadingSetextUnderlineClassName}`]: { display: "none" },
};

export function gfmHeadingPlugin(): MboxPlugin {
  return {
    name: "gfm/heading",
    theme: gfmHeadingTheme,
    decorations: (context) => createGfmHeadingSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers),
  };
}
