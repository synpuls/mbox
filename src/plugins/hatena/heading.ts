import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";

// The active/inactive reveal pattern — the heart of mbox. The heading style
// stays on the line whether or not it is focused, but the raw `*` / `**` / `***`
// marker is hidden with a `replace` spec only while the line is inactive; on an
// active (selected) line the marker is left alone so the user edits the real
// text. Hatena headings map to h3 / h4 / h5.
export const hatenaHeadingLineClassName = "mbox-hatena-heading";
export const hatenaHeadingClassNames = {
  h3: "mbox-hatena-h3",
  h4: "mbox-hatena-h4",
  h5: "mbox-hatena-h5",
};

function levelClassName(level: number): string {
  return `${hatenaHeadingLineClassName} ${hatenaHeadingClassNames[`h${level}` as keyof typeof hatenaHeadingClassNames]}`;
}

// `activeLines` is the public `MboxDecorationContext.activeLineNumbers` type.
function createHatenaHeadingSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return document.lines.flatMap((line) => {
    if (!line.heading) {
      return [];
    }

    // Only mark/line specs carry a className; a replace spec hides text.
    const specs: MboxDecorationSpec[] = [
      { type: "line", from: line.from, to: line.from, className: levelClassName(line.heading.level) },
    ];
    if (!activeLines.has(line.line)) {
      specs.push({ type: "replace", from: line.heading.marker.from, to: line.heading.marker.to });
    }
    return specs;
  });
}

export function hatenaHeadingPlugin(): MboxPlugin {
  return {
    name: "hatena/heading",
    decorations: hatenaDecorationProvider(createHatenaHeadingSpecs),
  };
}
