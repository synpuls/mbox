import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";

// mbox can mark a document's first line as its title -- a larger, bolder line
// with extra room before the body starts. This plugin only marks which line
// that is -- opt-in, since treating line 1 specially is an app-level
// convention (not part of the Scrapbox notation itself) and changes existing
// consumers' first-line appearance once a presentation theme styles the class. It coexists with
// whatever other line-level classes (quote/list/etc.) land on line 1 rather
// than suppressing them: writing e.g. `[**** text]` on the title line still
// applies that decoration's own em-based font-size on top of the title's,
// compounding rather than overriding (not addressed here, see dev-docs).
export const scrapboxTitleLineClassName = "mbox-scrapbox-title-line";

export function scrapboxTitlePlugin(): MboxPlugin {
  return {
    name: "scrapbox/title",
    decorations: (context) => {
      const firstLine = context.state.doc.line(1);
      const specs: MboxDecorationSpec[] = [
        { type: "line", from: firstLine.from, className: scrapboxTitleLineClassName },
      ];
      return specs;
    },
  };
}
