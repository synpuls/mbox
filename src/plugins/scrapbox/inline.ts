import type { ScrapboxLine, ScrapboxRange } from "./parser.js";

export interface ScrapboxTextNode extends ScrapboxRange {
  type: "text";
  value: string;
}

export interface ScrapboxCodeNode extends ScrapboxRange {
  type: "code";
  openingMarker: ScrapboxRange;
  closingMarker: ScrapboxRange;
  content: ScrapboxRange;
  value: string;
}

export interface ScrapboxDecorationNode extends ScrapboxRange {
  type: "decoration";
  rawDecos: string;
  decos: string[];
  openingMarker: ScrapboxRange;
  closingMarker: ScrapboxRange;
  content: ScrapboxRange;
  children: ScrapboxInlineNode[];
}

export interface ScrapboxStrongNode extends ScrapboxRange {
  type: "strong";
  openingMarker: ScrapboxRange;
  closingMarker: ScrapboxRange;
  content: ScrapboxRange;
  children: ScrapboxInlineNode[];
}

export interface ScrapboxInternalLinkNode extends ScrapboxRange {
  type: "internalLink";
  pathType: "root" | "relative";
  href: string;
  openingMarker: ScrapboxRange;
  closingMarker: ScrapboxRange;
  target: ScrapboxRange;
}

export interface ScrapboxExternalLinkNode extends ScrapboxRange {
  type: "externalLink";
  bracketed: boolean;
  href: string;
  content: string;
  hrefRange: ScrapboxRange;
  contentRange: ScrapboxRange | null;
}

export interface ScrapboxHashTagNode extends ScrapboxRange {
  type: "hashTag";
  href: string;
  marker: ScrapboxRange;
  target: ScrapboxRange;
}

export interface ScrapboxImageNode extends ScrapboxRange {
  type: "image";
  src: string;
  link: string;
}

export interface ScrapboxStrongImageNode extends ScrapboxRange {
  type: "strongImage";
  src: string;
}

export interface ScrapboxIconNode extends ScrapboxRange {
  type: "icon";
  path: string;
  pathType: "root" | "relative";
}

export interface ScrapboxFormulaNode extends ScrapboxRange {
  type: "formula";
  expression: string;
  content: ScrapboxRange;
}

export type ScrapboxInlineNode =
  | ScrapboxTextNode
  | ScrapboxCodeNode
  | ScrapboxDecorationNode
  | ScrapboxStrongNode
  | ScrapboxInternalLinkNode
  | ScrapboxExternalLinkNode
  | ScrapboxHashTagNode
  | ScrapboxImageNode
  | ScrapboxStrongImageNode
  | ScrapboxIconNode
  | ScrapboxFormulaNode;

interface InlineMatcher {
  nestedAllowed: boolean;
  patterns: InlinePattern[];
  create: (raw: string, from: number) => ScrapboxInlineNode;
}

interface InlinePatternMatch {
  0: string;
  index: number;
}

interface InlinePatternScanner {
  exec: (text: string, from: number) => InlinePatternMatch | null;
}

type InlinePattern = RegExp | InlinePatternScanner;

const imageExtension = "(?:png|jpe?g|gif|svg|webp)";
// Gyazo URLs carry no file extension, so extension-based matching alone
// misses them; matched by host + 32-hex id instead, mirroring the reference
// parser (@progfay/scrapbox-parser)'s own Gyazo-specific pattern. Exported as
// the single definition of "what a Gyazo URL looks like" -- image.ts's
// default src resolver needs the same host+id shape (minus the optional
// `/raw` this module allows) and builds its own regex on top of this rather
// than hardcoding the pattern a second time.
export const gyazoHostAndId = "https?://(?:[0-9a-z-]+\\.)?gyazo\\.com/[0-9a-f]{32}";
const gyazoImageUrl = `${gyazoHostAndId}(?:/raw)?`;
// A bare `https://gyazo.com/<id>` (no `/raw`, no extension) is still valid
// Scrapbox image notation -- real Scrapbox (and its reference parser) treats
// it as one. Whether that raw URL is actually fetchable as-is is a rendering
// concern, not a classification one; see `ScrapboxImageSrcResolver` in
// `image.ts` for where that's handled.
const imageUrl = `(?:https?://[^\\s\\[\\]]+\\.${imageExtension}(?:\\?[^\\[\\]\\s]+)?|${gyazoImageUrl})`;
const codeRegExp = /`.*?`/;
const strongImageRegExp = new RegExp(`\\[\\[${imageUrl}\\]\\]`, "i");
const srcFirstImageRegExp = new RegExp(`\\[${imageUrl}(?:\\s+https?://[^\\s\\[\\]]+)?\\]`, "i");
const linkFirstImageRegExp = new RegExp(`\\[https?://[^\\s\\[\\]]+\\s+${imageUrl}\\]`, "i");
const imageUrlRegExp = new RegExp(`^${imageUrl}$`, "i");
const isWhitespace = (character: string) => /\s/.test(character);
const nextLineTerminator = (text: string, from: number) => {
  const positions = [text.indexOf("\n", from), text.indexOf("\r", from), text.indexOf("\u2028", from), text.indexOf("\u2029", from)].filter(
    (position) => position !== -1,
  );
  return positions.length === 0 ? -1 : Math.min(...positions);
};

// Marker characters from the character class in the decoration regexp below.
const decorationMarkerCharacters = '!"#%&\'()*+,-./{|}<>_~';
// Equivalent to /\[[!"#%&'()*+,\-./{|}<>_~]+ (?:\[[^[\]]+\]|[^\]])+\]/.
// The bracketed content alternative can consume a complete nested `[... ]`
// ahead of the single-character alternative. Tracking its reachable closing
// points keeps the greedy/backtracking choice while avoiding re-walking an
// unclosed suffix for every marker.
const decorationScanner: InlinePatternScanner = {
  exec(text, from) {
    let opening = text.indexOf("[", from);

    while (opening !== -1) {
      let markerEnd = opening + 1;
      while (decorationMarkerCharacters.includes(text[markerEnd])) markerEnd += 1;
      if (markerEnd === opening + 1 || text[markerEnd] !== " ") {
        opening = text.indexOf("[", opening + 1);
        continue;
      }

      let contentCursor = markerEnd + 1;
      let hasContent = false;
      let nestedOpening = -1;
      let lastClosing = -1;
      while (contentCursor < text.length) {
        if (text[contentCursor] === "]") {
          if (hasContent) lastClosing = contentCursor;
          // The nested alternative can consume this bracket only when the
          // most recent `[` has non-bracket content before it. Otherwise this
          // is the outer terminator (or the candidate is invalid). Keeping
          // `lastClosing` mirrors the regexp's greedy backtracking choice.
          if (nestedOpening === -1 || nestedOpening === contentCursor - 1) break;
          nestedOpening = -1;
          contentCursor += 1;
          continue;
        }
        hasContent = true;
        if (text[contentCursor] === "[") nestedOpening = contentCursor;
        contentCursor += 1;
      }
      if (lastClosing !== -1) return { 0: text.slice(opening, lastClosing + 1), index: opening };
      if (contentCursor === text.length) return null;

      opening = text.indexOf("[", opening + 1);
    }

    return null;
  },
};

// Equivalent to /\[\$ [^\]]+\]/. A formula's first `]` is its only
// possible terminator; if none exists, no later opener can match either.
const formulaScanner: InlinePatternScanner = {
  exec(text, from) {
    let opening = text.indexOf("[$ ", from);

    while (opening !== -1) {
      const contentStart = opening + 3;
      const closing = text.indexOf("]", contentStart);
      if (closing === -1) return null;
      if (closing > contentStart) return { 0: text.slice(opening, closing + 1), index: opening };
      opening = text.indexOf("[$ ", opening + 1);
    }

    return null;
  },
};

// Equivalent to /\[\[(?:[^[]|\[[^[]).*?\]*\]\]/. The first unit has an
// intentionally unusual opening-bracket rule, then `.*?` selects the first
// `]]` on the same line and `\]*` greedily absorbs the rest of that closing
// bracket run.
const strongScanner: InlinePatternScanner = {
  exec(text, from) {
    let opening = text.indexOf("[[", from);

    while (opening !== -1) {
      let contentStart = opening + 2;
      if (text[contentStart] === "[") {
        if (text[contentStart + 1] === "[" || contentStart + 1 >= text.length) {
          opening = text.indexOf("[[", opening + 1);
          continue;
        }
        contentStart += 2;
      } else if (contentStart >= text.length) {
        return null;
      } else {
        contentStart += 1;
      }

      const closing = text.indexOf("]]", contentStart);
      const lineTerminator = nextLineTerminator(text, contentStart);
      if (closing === -1 || (lineTerminator !== -1 && lineTerminator < closing)) {
        if (lineTerminator === -1) return null;
        // A candidate beginning up to three characters before the terminator
        // can consume it in the regexp's initial unit (`[[\r` or `[[[\r`).
        // All earlier candidates are blocked by `.*?`, so skip the whole
        // failed line while retaining those boundary cases.
        opening = text.indexOf("[[", Math.max(opening + 1, lineTerminator - 3));
        continue;
      }

      let closingRunEnd = closing + 2;
      while (text[closingRunEnd] === "]") closingRunEnd += 1;
      return { 0: text.slice(opening, closingRunEnd), index: opening };
    }

    return null;
  },
};

// This is deliberately a scanner instead of /\[https?:\/\/[^\s\[\]]+\s+[^\]]*[^\s]\]/.
// The latter preserves `[` in a label (as Scrapbox does), but a failing exec
// rescans the rest of an unclosed input from every subsequent `[`.
const hrefFirstUrlScanner: InlinePatternScanner = {
  exec(text, from) {
    let opening = text.indexOf("[", from);

    while (opening !== -1) {
      const urlStart = opening + 1;
      const schemeLength = text.startsWith("http://", urlStart) ? 7 : text.startsWith("https://", urlStart) ? 8 : 0;
      if (schemeLength === 0) {
        opening = text.indexOf("[", opening + 1);
        continue;
      }

      let urlEnd = urlStart;
      while (
        urlEnd < text.length &&
        !isWhitespace(text[urlEnd]) &&
        text[urlEnd] !== "[" &&
        text[urlEnd] !== "]"
      ) {
        urlEnd += 1;
      }
      if (urlEnd <= urlStart + schemeLength || urlEnd === text.length || !isWhitespace(text[urlEnd])) {
        opening = text.indexOf("[", opening + 1);
        continue;
      }

      let contentStart = urlEnd;
      while (contentStart < text.length && isWhitespace(text[contentStart])) contentStart += 1;
      let closing = text.indexOf("]", contentStart);
      if (closing === -1) return null;
      // The legacy regexp's final non-whitespace character can itself be a
      // closing bracket, so `]]` terminates after the second bracket.
      if (text[closing + 1] === "]") closing += 1;
      if (!isWhitespace(text[closing - 1])) return { 0: text.slice(opening, closing + 1), index: opening };

      // Every candidate before this closing bracket has the same trailing
      // whitespace, so none can match. Skip them together rather than
      // repeatedly searching the same suffix.
      opening = text.indexOf("[", closing + 1);
    }

    return null;
  },
};
const contentFirstUrlRegExp = /\[[^[\]]*[^\s]\s+https?:\/\/[^\s\[\]]+\]/;
const bracketedUrlRegExp = /\[https?:\/\/[^\s\[\]]+\]/;
const bareUrlRegExp = /https?:\/\/[^\s]+/;
const iconRegExp = /\[\/?[^[\]]+\.icon\]/i;
const internalLinkRegExp = /\[\/?[^[\]]+\]/;
const hashTagRegExp = /(?<=^|\s)#\S+/;

function textNode(value: string, from: number): ScrapboxTextNode {
  return { type: "text", from, to: from + value.length, value };
}

function normaliseDecos(rawDecos: string): string[] {
  const decos = new Set<string>(rawDecos);
  if (decos.has("*")) {
    const asteriskCount = rawDecos.split("*").length - 1;
    decos.delete("*");
    decos.add(`*-${Math.min(asteriskCount, 10)}`);
  }
  return [...decos];
}

function createCodeNode(raw: string, from: number): ScrapboxCodeNode {
  const to = from + raw.length;
  return {
    type: "code",
    from,
    to,
    openingMarker: { from, to: from + 1 },
    closingMarker: { from: to - 1, to },
    content: { from: from + 1, to: to - 1 },
    value: raw.slice(1, -1),
  };
}

function createDecorationNode(raw: string, from: number): ScrapboxDecorationNode {
  const to = from + raw.length;
  const separatorIndex = raw.indexOf(" ");
  const rawDecos = raw.slice(1, separatorIndex);
  const contentFrom = from + separatorIndex + 1;
  const contentTo = to - 1;
  return {
    type: "decoration",
    from,
    to,
    rawDecos,
    decos: normaliseDecos(rawDecos),
    openingMarker: { from, to: contentFrom },
    closingMarker: { from: contentTo, to },
    content: { from: contentFrom, to: contentTo },
    children: parseScrapboxInlineNested(raw.slice(separatorIndex + 1, -1), contentFrom, true),
  };
}

function createStrongNode(raw: string, from: number): ScrapboxStrongNode {
  const to = from + raw.length;
  const contentFrom = from + 2;
  const contentTo = to - 2;
  return {
    type: "strong",
    from,
    to,
    openingMarker: { from, to: contentFrom },
    closingMarker: { from: contentTo, to },
    content: { from: contentFrom, to: contentTo },
    children: parseScrapboxInlineNested(raw.slice(2, -2), contentFrom, true),
  };
}

function createInternalLinkNode(raw: string, from: number): ScrapboxInternalLinkNode {
  const to = from + raw.length;
  const href = raw.slice(1, -1);
  return {
    type: "internalLink",
    from,
    to,
    pathType: href.startsWith("/") ? "root" : "relative",
    href,
    openingMarker: { from, to: from + 1 },
    closingMarker: { from: to - 1, to },
    target: { from: from + 1, to: to - 1 },
  };
}

function createExternalLinkNode(raw: string, from: number): ScrapboxExternalLinkNode | ScrapboxTextNode {
  const bracketed = raw.startsWith("[") && raw.endsWith("]");
  const inner = bracketed ? raw.slice(1, -1) : raw;
  const innerBase = bracketed ? from + 1 : from;
  const isHrefFirst = (bracketed ? /^https?:\/\/[^\s\[\]]/ : /^https?:\/\/[^\s\]]/).test(inner);
  const hrefMatch = (
    isHrefFirst
      ? bracketed
        ? /^https?:\/\/[^\s\[\]]+/
        : /^https?:\/\/[^\s\]]+/
      : bracketed
        ? /https?:\/\/[^\s\[\]]+$/
        : /https?:\/\/[^\s\]]+$/
  ).exec(inner);
  if (hrefMatch === null) return textNode(raw, from);

  const href = hrefMatch[0];
  const hrefStart = innerBase + hrefMatch.index;
  const hrefRange: ScrapboxRange = { from: hrefStart, to: hrefStart + href.length };

  const contentRaw = isHrefFirst ? inner.slice(href.length) : inner.slice(0, hrefMatch.index - 1);
  const contentStart = isHrefFirst ? innerBase + href.length : innerBase;
  const content = contentRaw.trim();
  const leadingWhitespace = contentRaw.length - contentRaw.trimStart().length;
  const contentRange: ScrapboxRange | null =
    content.length > 0 ? { from: contentStart + leadingWhitespace, to: contentStart + leadingWhitespace + content.length } : null;

  return {
    type: "externalLink",
    from,
    to: from + raw.length,
    bracketed,
    href,
    content,
    hrefRange,
    contentRange,
  };
}

function createImageNode(raw: string, from: number): ScrapboxImageNode {
  const spaceIndex = raw.search(/\s/);
  const first = spaceIndex === -1 ? raw.slice(1, -1) : raw.slice(1, spaceIndex);
  const second = spaceIndex === -1 ? "" : raw.slice(spaceIndex, -1).replace(/^\s+/, "");
  const [src, link] = imageUrlRegExp.test(second) ? [second, first] : [first, second];

  return { type: "image", from, to: from + raw.length, src, link };
}

function createStrongImageNode(raw: string, from: number): ScrapboxStrongImageNode {
  return { type: "strongImage", from, to: from + raw.length, src: raw.slice(2, -2) };
}

function createFormulaNode(raw: string, from: number): ScrapboxFormulaNode {
  const to = from + raw.length;
  return {
    type: "formula",
    from,
    to,
    expression: raw.slice(3, -1),
    content: { from: from + 3, to: to - 1 },
  };
}

function createIconNode(raw: string, from: number): ScrapboxIconNode {
  const path = raw.slice(1, -1).replace(/\.icon$/i, "");
  return {
    type: "icon",
    from,
    to: from + raw.length,
    path,
    pathType: path.startsWith("/") ? "root" : "relative",
  };
}

function createHashTagNode(raw: string, from: number): ScrapboxHashTagNode {
  const to = from + raw.length;
  return {
    type: "hashTag",
    from,
    to,
    href: raw.slice(1),
    marker: { from, to: from + 1 },
    target: { from: from + 1, to },
  };
}

const matchers: InlineMatcher[] = [
  { nestedAllowed: false, patterns: [codeRegExp], create: createCodeNode },
  { nestedAllowed: false, patterns: [decorationScanner], create: createDecorationNode },
  { nestedAllowed: true, patterns: [formulaScanner], create: createFormulaNode },
  { nestedAllowed: false, patterns: [strongImageRegExp], create: createStrongImageNode },
  { nestedAllowed: false, patterns: [strongScanner], create: createStrongNode },
  { nestedAllowed: true, patterns: [srcFirstImageRegExp, linkFirstImageRegExp], create: createImageNode },
  {
    nestedAllowed: true,
    patterns: [hrefFirstUrlScanner, contentFirstUrlRegExp, bracketedUrlRegExp, bareUrlRegExp],
    create: createExternalLinkNode,
  },
  { nestedAllowed: true, patterns: [iconRegExp], create: createIconNode },
  { nestedAllowed: true, patterns: [internalLinkRegExp], create: createInternalLinkNode },
  { nestedAllowed: true, patterns: [hashTagRegExp], create: createHashTagNode },
];

/**
 * Parse the inline content of a single Scrapbox line into offset-aware nodes.
 *
 * Tokens are selected by their leftmost start position. Matcher order, then
 * pattern order, breaks ties at the same position. Each pattern owns a global
 * RegExp clone and caches its next match, so its scan position only advances
 * through this input once. `nested` content skips matchers Scrapbox does not
 * re-enter (code, decoration, strong).
 */
export function parseScrapboxInline(text: string, base = 0): ScrapboxInlineNode[] {
  return parseScrapboxInlineNested(text, base, false);
}

function parseScrapboxInlineNested(text: string, base: number, nested: boolean): ScrapboxInlineNode[] {
  interface PatternScanner {
    pattern: InlinePattern;
    next: InlinePatternMatch | RegExpExecArray | null;
    initialized: boolean;
  }

  interface Candidate {
    matcher: InlineMatcher;
    raw: string;
    index: number;
  }

  const scanners = matchers.flatMap((matcher) =>
    nested && !matcher.nestedAllowed
      ? []
      : matcher.patterns.map((pattern) => {
          const scanner: PatternScanner = {
            pattern: pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`) : pattern,
            next: null,
            initialized: false,
          };
          return { matcher, scanner };
        }),
  );
  const nodes: ScrapboxInlineNode[] = [];

  let cursor = 0;
  while (cursor < text.length) {
    let candidate: Candidate | null = null;

    for (const { matcher, scanner } of scanners) {
      // A cached match stays valid until it has been consumed. RegExp scanners
      // only move their cloned lastIndex forward; custom scanners receive the
      // same cursor explicitly.
      if (!scanner.initialized || (scanner.next !== null && scanner.next.index < cursor)) {
        if (scanner.pattern instanceof RegExp) {
          scanner.pattern.lastIndex = cursor;
          scanner.next = scanner.pattern.exec(text);
        } else {
          scanner.next = scanner.pattern.exec(text, cursor);
        }
        scanner.initialized = true;
      }

      const match = scanner.next;
      if (match !== null) {
        const next = { matcher, raw: match[0], index: match.index };
        if (candidate === null || next.index < candidate.index) candidate = next;
      }

      // The old slice-and-exec parser treated every segment start as line
      // start for hashtags. Preserve that boundary-only behavior without
      // slicing: a tag at the cursor is valid even after a consumed token.
      if (scanner.pattern instanceof RegExp && scanner.pattern.source === hashTagRegExp.source && text[cursor] === "#") {
        let end = cursor + 1;
        while (end < text.length && !/\s/.test(text[end])) end += 1;
        if (end > cursor + 1 && (candidate === null || cursor < candidate.index)) {
          candidate = { matcher, raw: text.slice(cursor, end), index: cursor };
        }
      }
    }

    if (candidate === null) {
      nodes.push(textNode(text.slice(cursor), base + cursor));
      break;
    }

    if (candidate.index > cursor) nodes.push(textNode(text.slice(cursor, candidate.index), base + cursor));
    nodes.push(candidate.matcher.create(candidate.raw, base + candidate.index));
    cursor = candidate.index + candidate.raw.length;
  }

  return nodes;
}

/**
 * Parse the inline content of one already-parsed line, resolving absolute
 * offsets. Number-list markers (`N. `) are excluded from the inline region.
 */
export function parseScrapboxLineInline(input: string, line: ScrapboxLine): ScrapboxInlineNode[] {
  const start = line.numberMarker ? line.numberMarker.to : line.content.from;
  return parseScrapboxInline(input.slice(start, line.to), start);
}
