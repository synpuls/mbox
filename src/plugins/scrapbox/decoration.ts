import { createContentMarkSpec, createReplaceSpec, type MboxDecorationSpec, type MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxDocument, ScrapboxRange } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxCodeClassName = "mbox-scrapbox-code";
export const scrapboxStrongClassName = "mbox-scrapbox-strong";
export const scrapboxEmphasisClassName = "mbox-scrapbox-em";
export const scrapboxStrikethroughClassName = "mbox-scrapbox-strikethrough";
export const scrapboxUnderlineClassName = "mbox-scrapbox-underline";
export const scrapboxDecorationClassName = "mbox-scrapbox-decoration";
export const scrapboxStrongLevelClassNamePrefix = "mbox-scrapbox-strong-level";

export const scrapboxDecorationClassNames = {
  strong: scrapboxStrongClassName,
  em: scrapboxEmphasisClassName,
  strikethrough: scrapboxStrikethroughClassName,
  underline: scrapboxUnderlineClassName,
  code: scrapboxCodeClassName,
};

function markSpec(range: ScrapboxRange, className: string): MboxDecorationSpec[] {
  return createContentMarkSpec(range.from, range.to, className);
}

function hideSpec(range: ScrapboxRange): MboxDecorationSpec[] {
  return createReplaceSpec(range.from, range.to);
}

function decorationContentClassName(decos: string[]): string {
  const classNames = [scrapboxDecorationClassName];
  for (const deco of decos) {
    if (deco.startsWith("*-")) classNames.push(scrapboxStrongClassName, `${scrapboxStrongLevelClassNamePrefix}-${deco.slice(2)}`);
    else if (deco === "/") classNames.push(scrapboxEmphasisClassName);
    else if (deco === "-") classNames.push(scrapboxStrikethroughClassName);
    else if (deco === "_") classNames.push(scrapboxUnderlineClassName);
  }
  return classNames.join(" ");
}

/**
 * The class names that must survive onto the active (revealed) line: the strong
 * weight and its font-size, plus italic, strikethrough and underline. Real
 * Scrapbox keeps all of these while you edit the text, and dropping them on focus
 * would change the glyphs under the cursor (see todo — "bold / 斜体 / 打ち消し /
 * 下線を focus の有無に関わらず適用"). Only the raw markers are revealed; the
 * decoration's own styling is unchanged. Returns an empty string when the node
 * carries none of the preserved styles (all four decoration styles qualify, so
 * in practice this is empty only for a decoration with no recognised deco char).
 */
function persistentContentClassName(decos: string[]): string {
  const classNames: string[] = [];
  for (const deco of decos) {
    if (deco.startsWith("*-"))
      classNames.push(scrapboxStrongClassName, `${scrapboxStrongLevelClassNamePrefix}-${deco.slice(2)}`);
    else if (deco === "/") classNames.push(scrapboxEmphasisClassName);
    else if (deco === "-") classNames.push(scrapboxStrikethroughClassName);
    else if (deco === "_") classNames.push(scrapboxUnderlineClassName);
  }
  return classNames.join(" ");
}

/**
 * Build the decoration specs for one inline node.
 *
 * On the active (revealed) line we emit nothing that hides syntax — the raw
 * markers stay visible and editable — and keep only the font-size mark, so the
 * text does not shrink under the cursor. Off the active line every marker is
 * hidden and the full styling is applied.
 */
function collectInlineSpecs(node: ScrapboxInlineNode, active: boolean): MboxDecorationSpec[] {
  switch (node.type) {
    case "text":
      return [];
    case "code":
      if (active) return [];
      return [
        ...hideSpec(node.openingMarker),
        ...hideSpec(node.closingMarker),
        ...markSpec(node.content, scrapboxCodeClassName),
      ];
    case "strong":
      // `[[text]]` is bold with no size change; the bold weight survives onto the
      // active line (its markers stay raw) so it does not un-bold under the
      // cursor. Children carry any nested marks through the shared inline walker.
      if (active) return markSpec(node.content, scrapboxStrongClassName);
      return [
        ...hideSpec(node.openingMarker),
        ...hideSpec(node.closingMarker),
        ...markSpec(node.content, scrapboxStrongClassName),
      ];
    case "decoration":
      if (active) {
        const className = persistentContentClassName(node.decos);
        return className ? markSpec(node.content, className) : [];
      }
      return [
        ...hideSpec(node.openingMarker),
        ...hideSpec(node.closingMarker),
        ...markSpec(node.content, decorationContentClassName(node.decos)),
      ];
    default:
      // Link nodes are handled by the scrapbox link plugin, not here.
      return [];
  }
}

function createScrapboxDecorationSpecs(
  document: ScrapboxDocument,
  activeLines: MboxActiveLineNumbers,
): MboxDecorationSpec[] {
  // Code and table blocks stay fully literal regardless of focus. Active lines
  // are not skipped outright: they still keep the font-size mark (see
  // {@link collectInlineSpecs}) so large text does not shrink under the cursor.
  const blockLineNumbers = scrapboxBlockLineNumbers(document);

  return document.lines.flatMap((line) => {
    if (blockLineNumbers.has(line.line)) return [];
    const active = activeLines.has(line.line);
    return collectScrapboxInlineNodeResults(line.inline, (node) => collectInlineSpecs(node, active));
  });
}

export function scrapboxDecorationPlugin(): MboxPlugin {
  return {
    name: "scrapbox/decoration",
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      return createScrapboxDecorationSpecs(document, context.activeLineNumbers);
    },
  };
}
