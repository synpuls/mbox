import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument } from "./parser.js";
import { emitLiteralBlockSpecs, hatenaDecorationProvider, literalBlockTheme } from "./shared.js";

// Plain pre (`>| ... |<`): a preformatted block for showing text as-is. mbox
// treats its interior as fully LITERAL — the parser leaves heading/list/link/
// quote null on those lines, so no other plugin decorates them. (mbox
// deliberately keeps the interior literal, matching super-pre: that is the more
// predictable behaviour for a "show this verbatim" block, and the notation's own
// reference describes a plain pre the same way, so this is not a divergence.) One lineRange styles the whole
// block; the `>|` / `|<` markers are hidden while inactive.
export const hatenaPreClassName = "mbox-hatena-pre";

function createHatenaPreSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  // A plain pre never reveals a widget in place of a marker (unlike super-pre,
  // which shows a language label), so it passes no `widgetFor`.
  return emitLiteralBlockSpecs(document, activeLines, {
    roleOf: (line) => line.pre,
    className: hatenaPreClassName,
  });
}

export function hatenaPrePlugin(): MboxPlugin {
  return {
    theme: literalBlockTheme(hatenaPreClassName),
    name: "hatena/pre",
    decorations: hatenaDecorationProvider(createHatenaPreSpecs),
  };
}
