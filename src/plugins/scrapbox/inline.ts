import type { ScrapboxLine, ScrapboxRange } from "./parser.js";
// The scanner vocabulary -- per-parse instantiation, deferred matches, the
// monotonic cursor -- lives in its own module; see its header for why each
// exists.
import {
  createMonotonicCursor,
  inlineMatchText,
  instantiateInlinePattern,
  type InlinePattern,
  type InlineScannerFactory,
  type InlinePatternScanner,
  type InlineScanMatch,
} from "./inline-scanner-kit.js";

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
  repeatCount: number;
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

const imageExtension = "(?:png|jpe?g|gif|svg|webp)";
// Gyazo URLs carry no file extension, so extension-based matching alone
// misses them; matched by the main host + 32-hex id instead. This pattern is
// the regexp classifier used by strongImageRegExp. The single-bracket scanner
// has a separate hand-written classifier below; their boundary agreement is
// locked by tests until those parsing paths can share one implementation.
//
// The recorded observation excludes i.gyazo.com without establishing every
// possible subdomain. mbox conservatively generalises that fact to exclude all
// subdomains: a simpler rule than singling out `i`, but still an implementer
// choice beyond what was observed. Scheme and id case, suffixes, and the other
// existing axes are intentionally unchanged.
const gyazoHostAndId = "https?://gyazo\\.com/[0-9a-f]{32}";
const gyazoImageUrl = `${gyazoHostAndId}(?:/raw)?`;
// mbox classifies a bare `https://gyazo.com/<id>` (no `/raw`, no extension) as
// image notation. Whether that raw URL is actually fetchable as-is is a
// rendering concern, not a classification one; see `ScrapboxImageSrcResolver`
// in `image.ts` for where that's handled.
const imageUrl = `(?:https?://[^\\s\\[\\]]+\\.${imageExtension}(?:\\?[^\\[\\]\\s]+)?|${gyazoImageUrl})`;
const codeRegExp = /`.*?`/;
const strongImageRegExp = new RegExp(`\\[\\[${imageUrl}\\]\\]`, "i");
const isWhitespace = (character: string) => /\s/.test(character);
const nextLineTerminator = (text: string, from: number) => {
  for (let position = from; position < text.length; position += 1) {
    const character = text[position];
    if (character === "\n" || character === "\r" || character === "\u2028" || character === "\u2029") return position;
  }
  return -1;
};

function asciiEqualAt(text: string, position: number, expectedLowercase: string): boolean {
  for (let index = 0; index < expectedLowercase.length; index += 1) {
    const code = text.charCodeAt(position + index);
    const lowercaseCode = code >= 65 && code <= 90 ? code + 32 : code;
    if (lowercaseCode !== expectedLowercase.charCodeAt(index)) return false;
  }
  return true;
}

function httpSchemeLengthAt(text: string, position: number): 0 | 7 | 8 {
  if (asciiEqualAt(text, position, "http://")) return 7;
  if (asciiEqualAt(text, position, "https://")) return 8;
  return 0;
}

function hasImageExtensionAt(text: string, end: number): boolean {
  return (
    (end >= 4 && asciiEqualAt(text, end - 4, ".png")) ||
    (end >= 4 && asciiEqualAt(text, end - 4, ".jpg")) ||
    (end >= 5 && asciiEqualAt(text, end - 5, ".jpeg")) ||
    (end >= 4 && asciiEqualAt(text, end - 4, ".gif")) ||
    (end >= 4 && asciiEqualAt(text, end - 4, ".svg")) ||
    (end >= 5 && asciiEqualAt(text, end - 5, ".webp"))
  );
}

function isHex(character: string): boolean {
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

function isGyazoImageToken(text: string, start: number, end: number, schemeLength: number): boolean {
  const rawSuffixLength = end >= 4 && asciiEqualAt(text, end - 4, "/raw") ? 4 : 0;
  const idEnd = end - rawSuffixLength;
  const idStart = idEnd - 32;
  const hostSuffix = "gyazo.com/";
  const hostSuffixStart = idStart - hostSuffix.length;
  if (hostSuffixStart < start + schemeLength || !asciiEqualAt(text, hostSuffixStart, hostSuffix)) return false;
  for (let position = idStart; position < idEnd; position += 1) {
    if (!isHex(text[position]!)) return false;
  }
  return hostSuffixStart === start + schemeLength;
}

function isImageUrlToken(
  text: string,
  start: number,
  end: number,
  nextQuestion: (from: number) => number,
): boolean {
  const schemeLength = httpSchemeLengthAt(text, start);
  if (schemeLength === 0) return false;

  const question = nextQuestion(start + schemeLength);
  const extensionEnd = question !== -1 && question < end ? question : end;
  const hasValidQuery = extensionEnd === end || question + 1 < end;
  if (hasValidQuery && hasImageExtensionAt(text, extensionEnd)) return true;
  return isGyazoImageToken(text, start, end, schemeLength);
}

function isExternalLinkToken(text: string, start: number, end: number): boolean {
  const schemeLength = httpSchemeLengthAt(text, start);
  const openingBracket = text.indexOf("[", start);
  return (
    schemeLength !== 0 &&
    end > start + schemeLength &&
    (openingBracket === -1 || openingBracket >= end)
  );
}

function createBracketedImageScanner(linkFirst: boolean, doubleBracket = false): InlineScannerFactory {
  return {
    createScanner() {
      let source = "";
      const openingMarker = doubleBracket ? "[[" : "[";
      const closingMarker = doubleBracket ? "]]" : "]";
      const closesNotationAt = (text: string, position: number) =>
        text.startsWith(closingMarker, position) && (!doubleBracket || text[position + closingMarker.length] !== "]");
      const findWhitespace = (from: number) => {
        for (let position = from; position < source.length; position += 1) {
          if (isWhitespace(source[position]!)) return position;
        }
        return -1;
      };
      const findNonWhitespace = (from: number) => {
        for (let position = from; position < source.length; position += 1) {
          if (!isWhitespace(source[position]!)) return position;
        }
        return -1;
      };
      let nextClosing = createMonotonicCursor((from) => source.indexOf(closingMarker, from));
      let nextQuestion = createMonotonicCursor((from) => source.indexOf("?", from));
      let nextWhitespace = createMonotonicCursor(findWhitespace);
      let nextNonWhitespace = createMonotonicCursor(findNonWhitespace);

      const setSource = (text: string) => {
        source = text;
        nextClosing = createMonotonicCursor((from) => source.indexOf(closingMarker, from));
        nextQuestion = createMonotonicCursor((from) => source.indexOf("?", from));
        nextWhitespace = createMonotonicCursor(findWhitespace);
        nextNonWhitespace = createMonotonicCursor(findNonWhitespace);
      };

      const tokenEnd = (from: number) => {
        const closing = nextClosing(from);
        const whitespace = nextWhitespace(from);
        if (closing === -1) return whitespace;
        if (whitespace === -1) return closing;
        return Math.min(closing, whitespace);
      };

      return {
        exec(text, from) {
          if (text !== source) setSource(text);
          let opening = text.indexOf(openingMarker, from);

          while (opening !== -1) {
            const firstStart = opening + openingMarker.length;
            const firstEnd = tokenEnd(firstStart);
            if (firstEnd === -1) return null;

            const firstIsImage = !linkFirst && isImageUrlToken(text, firstStart, firstEnd, nextQuestion);
            const firstIsLink = linkFirst && isExternalLinkToken(text, firstStart, firstEnd);
            if (closesNotationAt(text, firstEnd)) {
              // A one-token double-bracket image retains the existing
              // strongImage discriminator. This scanner changes only the
              // observed two-token, src-first form.
              if (firstIsImage && !doubleBracket) {
                const closing = firstEnd;
                return { index: opening, resolve: () => text.slice(opening, closing + closingMarker.length) };
              }
              opening = text.indexOf(openingMarker, opening + 1);
              continue;
            }
            if ((!firstIsImage && !firstIsLink) || !isWhitespace(text[firstEnd]!)) {
              opening = text.indexOf(openingMarker, opening + 1);
              continue;
            }

            const secondStart = nextNonWhitespace(firstEnd);
            if (secondStart === -1) return null;
            const secondEnd = tokenEnd(secondStart);
            if (secondEnd !== -1 && closesNotationAt(text, secondEnd)) {
              const secondMatches = linkFirst
                ? isImageUrlToken(text, secondStart, secondEnd, nextQuestion)
                : isExternalLinkToken(text, secondStart, secondEnd);
              if (secondMatches) {
                const closing = secondEnd;
                return { index: opening, resolve: () => text.slice(opening, closing + closingMarker.length) };
              }
            }

            opening = text.indexOf(openingMarker, opening + 1);
          }

          return null;
        },
      };
    },
  };
}

const srcFirstImageScanner = createBracketedImageScanner(false);
const linkFirstImageScanner = createBracketedImageScanner(true);
const doubleBracketSrcFirstImageScanner = createBracketedImageScanner(false, true);

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

// An inline formula ends on its line. Prefer the first ` ]` whose space is
// part of the content; if there is none, use the first bare `]`. The three
// searches advance independently: sharing them would either change their
// meanings or reintroduce a quadratic scan on a different failure path.
const formulaScanner: InlineScannerFactory = {
  createScanner() {
    let source = "";
    let nextTerminator = (from: number) => nextLineTerminator(source, from);
    let nextSpacedClosing = createMonotonicCursor((from) => source.indexOf(" ]", from));
    let nextBareClosing = createMonotonicCursor((from) => source.indexOf("]", from));

    const setSource = (text: string) => {
      source = text;
      // `nextLineTerminator` returns the first of four independently searched
      // terminators. Keep that same minimum-of-four meaning, but make each
      // search monotonic too: otherwise a present `\n` still leaves its three
      // absent peers rescanning the whole tail for every candidate.
      const nextLf = createMonotonicCursor((from) => source.indexOf("\n", from));
      const nextCr = createMonotonicCursor((from) => source.indexOf("\r", from));
      const nextLineSeparator = createMonotonicCursor((from) => source.indexOf("\u2028", from));
      const nextParagraphSeparator = createMonotonicCursor((from) => source.indexOf("\u2029", from));
      nextTerminator = (from) => {
        const positions = [nextLf(from), nextCr(from), nextLineSeparator(from), nextParagraphSeparator(from)].filter(
          (position) => position !== -1,
        );
        return positions.length === 0 ? -1 : Math.min(...positions);
      };
      nextSpacedClosing = createMonotonicCursor((from) => source.indexOf(" ]", from));
      nextBareClosing = createMonotonicCursor((from) => source.indexOf("]", from));
    };

    return {
      exec(text, from) {
        if (text !== source) setSource(text);
        let opening = text.indexOf("[$ ", from);

        while (opening !== -1) {
          const contentStart = opening + 3;
          const lineEnd = nextTerminator(contentStart);
          const spacedClosing = nextSpacedClosing(contentStart);
          const bareClosing = nextBareClosing(contentStart);
          const hasSpacedClosing = spacedClosing !== -1 && (lineEnd === -1 || spacedClosing + 1 < lineEnd);
          const hasBareClosing = bareClosing !== -1 && (lineEnd === -1 || bareClosing < lineEnd);

          // Spaced always wins, even when a bare closer appears earlier.
          if (hasSpacedClosing || hasBareClosing) {
            const closing = hasSpacedClosing ? spacedClosing + 1 : bareClosing;
            return { 0: text.slice(opening, closing + 1), index: opening };
          }

          if (lineEnd === -1) return null;
          opening = text.indexOf("[$ ", Math.max(opening + 1, lineEnd + 1));
        }

        return null;
      },
    };
  },
};

// Equivalent to /\[\[(?:[^[]|\[[^[]).*?\]*\]\]/. The first unit has an
// intentionally unusual opening-bracket rule, then `.*?` selects the first
// `]]` on the same line and `\]*` greedily absorbs the rest of that closing
// bracket run.
const strongScanner: InlineScannerFactory = {
  createScanner() {
    let source = "";
    let nextTerminator = (from: number) => nextLineTerminator(source, from);
    let nextClosing = createMonotonicCursor((from) => source.indexOf("]]", from));

    const setSource = (text: string) => {
      source = text;
      // `nextLineTerminator` returns the first of four independently searched
      // terminators. Keep that same minimum-of-four meaning, but make each
      // search monotonic too: otherwise a present `\n` still leaves its three
      // absent peers rescanning the whole tail for every candidate.
      const nextLf = createMonotonicCursor((from) => source.indexOf("\n", from));
      const nextCr = createMonotonicCursor((from) => source.indexOf("\r", from));
      const nextLineSeparator = createMonotonicCursor((from) => source.indexOf("\u2028", from));
      const nextParagraphSeparator = createMonotonicCursor((from) => source.indexOf("\u2029", from));
      nextTerminator = (from) => {
        const positions = [nextLf(from), nextCr(from), nextLineSeparator(from), nextParagraphSeparator(from)].filter(
          (position) => position !== -1,
        );
        return positions.length === 0 ? -1 : Math.min(...positions);
      };
      nextClosing = createMonotonicCursor((from) => source.indexOf("]]", from));
    };

    return {
      exec(text, from) {
        // This scanner is instantiated for each parse. Resetting here keeps a
        // cursor from becoming a plausible offset if that driver contract ever
        // changes and reuses a scanner for another input.
        if (text !== source) setSource(text);
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

          // Query the line boundary and closer independently for every candidate.
          // Their monotonic cursors advance without rescanning; their matches and
          // empty results describe different facts, so sharing one would be wrong.
          const lineTerminator = nextTerminator(contentStart);
          const closing = nextClosing(contentStart);
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
  },
};

// This is deliberately a scanner instead of /\[https?:\/\/[^\s\[\]]+\s+[^\]]*[^\s]\]/.
// The latter preserves `[` in a label, which is the behaviour mbox wants, but
// a failing exec rescans the rest of an unclosed input from every subsequent
// `[`.
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
const bareUrlScanner: InlineScannerFactory = {
  createScanner() {
    let source = "";
    let nextHttp = createMonotonicCursor((from) => source.indexOf("http://", from));
    let nextHttps = createMonotonicCursor((from) => source.indexOf("https://", from));

    const setSource = (text: string) => {
      source = text;
      nextHttp = createMonotonicCursor((from) => source.indexOf("http://", from));
      nextHttps = createMonotonicCursor((from) => source.indexOf("https://", from));
    };

    return {
      exec(text, from) {
        // The inline driver creates one scanner for each parse and keeps its
        // input fixed while advancing `from`, so normally these cursors are
        // built once. Reset them if that contract changes: a cursor position
        // from another document would otherwise be a plausible, wrong index.
        if (text !== source) setSource(text);
        let http = nextHttp(from);
        let https = nextHttps(from);

        while (http !== -1 || https !== -1) {
          const index = https === -1 || (http !== -1 && http < https) ? http : https;
          const schemeLength = index === http ? 7 : 8;

          if (index + schemeLength < text.length && !isWhitespace(text[index + schemeLength]!)) {
            return {
              index,
              resolve: () => {
                let end = index + schemeLength;
                while (end < text.length && !isWhitespace(text[end]!)) end += 1;
                return text.slice(index, end);
              },
            };
          }

          if (index === http) http = nextHttp(index + 1);
          else https = nextHttps(index + 1);
        }

        return null;
      },
    };
  },
};
// Scrapbox upstream recognizes only lowercase `.icon` (and lowercase `x`);
// mbox's own notation intentionally has a separate, case-insensitive contract.
const iconRegExp = /\[\/?[^[\]]+\.icon(?:[x*](?:[1-9]|1\d|20))?\]/;
const internalLinkRegExp = /\[\/?[^[\]]+\]/;
// A hashtag candidate is a non-whitespace run that begins with `#` and has at
// least one non-`#` character. Keep this source shared by the boundary scanner
// and the cursor scanner so they cannot silently grow different definitions.
const hashTagTokenPattern = "#(?=\\S*[^#\\s])\\S+";
const hashTagRegExp = new RegExp(`(?<=^|\\s)${hashTagTokenPattern}`);
const hashTagTokenRegExp = new RegExp(`^${hashTagTokenPattern}$`);

function isHashTagCandidate(candidate: string): boolean {
  return hashTagTokenRegExp.test(candidate);
}

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
  const content = raw.slice(2, -2);
  // A double-bracket icon is still represented as a strong node containing an
  // icon. Rendering, rather than parsing, decides whether that exact shape
  // receives the larger icon treatment.
  const bracketedContent = `[${content}]`;
  const iconMatch = iconRegExp.exec(bracketedContent);
  const icon = iconMatch?.[0] === bracketedContent ? createIconNode(bracketedContent, contentFrom - 1) : undefined;
  return {
    type: "strong",
    from,
    to,
    openingMarker: { from, to: contentFrom },
    closingMarker: { from: contentTo, to },
    content: { from: contentFrom, to: contentTo },
    children: icon === undefined ? parseScrapboxInlineNested(content, contentFrom, true) : [{ ...icon, from: contentFrom, to: contentTo }],
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
  const markerWidth = raw.startsWith("[[") ? 2 : 1;
  const spaceIndex = raw.search(/\s/);
  const first = spaceIndex === -1 ? raw.slice(markerWidth, -markerWidth) : raw.slice(markerWidth, spaceIndex);
  const second = spaceIndex === -1 ? "" : raw.slice(spaceIndex, -markerWidth).replace(/^\s+/, "");
  const secondQuestion = createMonotonicCursor((position: number) => second.indexOf("?", position));
  const [src, link] = isImageUrlToken(second, 0, second.length, secondQuestion) ? [second, first] : [first, second];

  return { type: "image", from, to: from + raw.length, src, link };
}

function createStrongImageNode(raw: string, from: number): ScrapboxStrongImageNode {
  return { type: "strongImage", from, to: from + raw.length, src: raw.slice(2, -2) };
}

function createFormulaNode(raw: string, from: number): ScrapboxFormulaNode {
  const to = from + raw.length;
  // `[$ ]` is a bare empty formula: its only space is the syntax separator,
  // before contentStart. A spaced closer needs one additional source character.
  const spacedClosing = raw.length > 4 && raw.at(-2) === " ";
  const contentTo = to - (spacedClosing ? 2 : 1);
  return {
    type: "formula",
    from,
    to,
    expression: raw.slice(3, spacedClosing ? -2 : -1),
    content: { from: from + 3, to: contentTo },
  };
}

function createIconNode(raw: string, from: number): ScrapboxIconNode {
  const content = raw.slice(1, -1);
  const repeatMatch = content.match(/[x*](\d+)$/);
  const repeatCount = repeatMatch === null ? 1 : Number(repeatMatch[1]);
  const path = content.replace(/[x*]\d+$/, "").replace(/\.icon$/, "");
  return {
    type: "icon",
    from,
    to: from + raw.length,
    path,
    pathType: path.startsWith("/") ? "root" : "relative",
    repeatCount,
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
  { nestedAllowed: false, patterns: [doubleBracketSrcFirstImageScanner], create: createImageNode },
  { nestedAllowed: false, patterns: [strongScanner], create: createStrongNode },
  { nestedAllowed: true, patterns: [srcFirstImageScanner, linkFirstImageScanner], create: createImageNode },
  {
    nestedAllowed: true,
    patterns: [hrefFirstUrlScanner, contentFirstUrlRegExp, bracketedUrlRegExp, bareUrlScanner],
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
 * through this input once. `nested` content skips the matchers mbox does not
 * re-enter (code, decoration, strong).
 */
export function parseScrapboxInline(text: string, base = 0): ScrapboxInlineNode[] {
  return parseScrapboxInlineNested(text, base, false);
}

function parseScrapboxInlineNested(text: string, base: number, nested: boolean): ScrapboxInlineNode[] {
  interface PatternScanner {
    pattern: RegExp | InlinePatternScanner;
    next: InlineScanMatch | RegExpExecArray | null;
    initialized: boolean;
  }

  // Holds the MATCH, not its text. Arbitration below compares `index` only, and
  // a deferred match has no text to read until it wins -- which is enforced by
  // the type, not by discipline.
  interface Candidate {
    matcher: InlineMatcher;
    match: InlineScanMatch | RegExpExecArray;
  }

  // Every pattern is instantiated here, once per parse. That is the default
  // structure for stateful scanners; explicit input-change resets additionally
  // guard scanners that could otherwise reuse one document's positions for
  // another when this driver contract changes.
  const scanners = matchers.flatMap((matcher) =>
    nested && !matcher.nestedAllowed
      ? []
      : matcher.patterns.map((pattern) => {
          const scanner: PatternScanner = {
            pattern: instantiateInlinePattern(pattern),
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
      if (match !== null && (candidate === null || match.index < candidate.match.index)) {
        candidate = { matcher, match };
      }

      // The old slice-and-exec parser treated every segment start as line
      // start for hashtags. Preserve that boundary-only behavior without
      // slicing: a tag at the cursor is valid even after a consumed token.
      if (scanner.pattern instanceof RegExp && scanner.pattern.source === hashTagRegExp.source && text[cursor] === "#") {
        let end = cursor + 1;
        while (end < text.length && !/\s/.test(text[end])) end += 1;
        if (end > cursor + 1 && isHashTagCandidate(text.slice(cursor, end)) && (candidate === null || cursor < candidate.match.index)) {
          candidate = { matcher, match: { index: cursor, resolve: () => text.slice(cursor, end) } };
        }
      }
    }

    if (candidate === null) {
      nodes.push(textNode(text.slice(cursor), base + cursor));
      break;
    }

    // Only now is the text produced -- for the one candidate that won.
    const raw = inlineMatchText(candidate.match);
    const index = candidate.match.index;
    if (index > cursor) nodes.push(textNode(text.slice(cursor, index), base + cursor));
    nodes.push(candidate.matcher.create(raw, base + index));
    cursor = index + raw.length;
  }

  return nodes;
}

/**
 * Parse the inline content of one already-parsed line, resolving absolute
 * offsets. Number-list markers (`N. `) are excluded from the inline region.
 */
export function parseScrapboxLineInline(input: string, line: ScrapboxLine): ScrapboxInlineNode[] {
  const start = line.numberMarker ? line.numberMarker.to : line.content.from;
  return parseScrapboxInline(input.slice(start, line.logicalTo), start);
}
