// A pure, line-oriented parser for a SUBSET of Hatena notation (text-hatena).
// Like the example and scrapbox parsers, every node carries absolute document
// offsets ({ from, to }) because decorations and keymaps address positions in
// the whole document, not columns in a line.
//
// Supported constructs (Hatena official markers in parentheses):
//   *title / **title / ***title   headings (h3 / h4 / h5)
//   -item / +item                  unordered and ordered lists, nestable
//                                  (depth = leading marker-character count)
//   >|| ... ||<                    super-pre: a multi-line LITERAL block whose
//                                  inner lines are NOT re-parsed as Hatena syntax
//   >| ... |<                      plain pre: a multi-line LITERAL block
//   >> ... <<                      blockquote, NESTABLE (tracked as per-line depth)
//   [http://..:title=foo] / bare http:// / id:name   inline links
//   :term:description / ::description                 definition lists
//   ((content))                      inline footnotes
//   |*header|cell| / |cell|          pipe tables
//
// The two multi-line blocks are handled the way the README's "Multi-line literal
// blocks" section prescribes for scrapbox: super-pre lines are grouped once, and
// the parser leaves heading/list/definition/links/quote/footnotes null or empty
// on them, so every per-line rendering plugin naturally produces no specs for
// them and the raw literal text stays untouched.

import { findPipeOffsets } from "../pipe-table-row.js";
import { createLogicalLines, type LogicalLine } from "../logical-lines.js";

export interface HatenaRange {
  from: number;
  to: number;
}

export interface HatenaHeading {
  /**
   * The hidden prefix: the leading star run, plus a `name*` anchor attribute
   * when present (`*name1*名前1` hides `*name1*`, leaving `名前1`).
   */
  marker: HatenaRange;
  /** 3 = h3 (`*`), 4 = h4 (`**`), 5 = h5 (`***`); capped at 5. */
  level: number;
  /** The anchor name from a `*name*text` heading, else null. */
  name: string | null;
}

/**
 * A definition-list line: `:用語:説明` (a term + its description) or `::説明` (a
 * continuation description under the previous term). Each `::` line adds
 * another description under the same term.
 */
export interface HatenaDefinition {
  /** True for a `::` continuation line (no term of its own). */
  continuation: boolean;
  /** The leading `:` or `::` marker. */
  marker: HatenaRange;
  /** The term run between the two colons; null for a continuation. */
  term: HatenaRange | null;
  /** The middle `:` separating term and description; null for a continuation. */
  separator: HatenaRange | null;
}

/**
 * One inline footnote `((content))`. The notation collects these into a
 * numbered list at the article end, leaving a superscript reference in the
 * text; mbox keeps the number inline (with the content as a tooltip), so it
 * stores the whole marker span, the inner content, and the document-order
 * number.
 */
export interface HatenaFootnote {
  marker: HatenaRange;
  content: HatenaRange;
  /** The footnote body text (between the `((` `))`), for the superscript tooltip. */
  text: string;
  number: number;
}

export interface HatenaList {
  /** The leading `-`/`+` run plus one optional trailing space. */
  marker: HatenaRange;
  /** Nesting depth = number of leading marker characters. */
  depth: number;
  /** True when the innermost marker char is `+` — the ordered-list form. */
  ordered: boolean;
  /** 1-based position within the current same-depth ordered run; null if bulleted. */
  ordinal: number | null;
}

export type HatenaLinkKind = "bracket" | "url" | "id";

export interface HatenaLink {
  from: number;
  to: number;
  /**
   * The link's own destination for `bracket`/`url` kinds (already the final
   * URL the user wrote). For `id`, this is the RAW username, not a resolved
   * path -- the parser stays a pure projection of the syntax; mapping a
   * username to a destination is a host policy, so `hatenaLinkPlugin`'s
   * `idUrl` resolver applies it at decoration time (mirroring gfm/scrapbox's
   * consumer-resolver pattern).
   */
  href: string;
  /** The text to display in place of the raw syntax. */
  label: string;
  kind: HatenaLinkKind;
}

export type HatenaQuoteRole = "open" | "close" | "content";

export interface HatenaQuote {
  /** 1-based nesting depth of the blockquote this line belongs to. */
  depth: number;
  role: HatenaQuoteRole;
  /** The source URL of a `>URL>` cite opener; null for `>>` or non-openers. */
  cite: string | null;
}

export type HatenaSuperPreRole = "opener" | "body" | "closer";
export type HatenaPreRole = "opener" | "body" | "closer";

export interface HatenaLine {
  line: number;
  from: number;
  to: number;
  heading: HatenaHeading | null;
  list: HatenaList | null;
  definition: HatenaDefinition | null;
  footnotes: HatenaFootnote[];
  links: HatenaLink[];
  quote: HatenaQuote | null;
  superPre: HatenaSuperPreRole | null;
  /** On a `>|lang|` opener, the captured language; null for `>||` or non-openers. */
  superPreLang: string | null;
  /** Plain `>| ... |<` pre block role; null outside a plain pre. */
  pre: HatenaPreRole | null;
}

// A table is one or more CONSECUTIVE lines that each start with `|` and are not
// inside a super-pre block. Unlike GFM there is no delimiter row and no column
// alignment syntax; a cell is a HEADER cell (per-cell) when its trimmed text
// starts with `*`, and that leading `*` is stripped from the displayed content.
export interface HatenaTableCell {
  /** Full cell span between the surrounding pipes (padding included). */
  from: number;
  to: number;
  /** True when the trimmed cell text starts with `*`. */
  header: boolean;
  /** The leading `*` marker range for a header cell, else null. */
  marker: HatenaRange | null;
  /** The DISPLAYED content range (a header's leading `*` excluded). */
  content: HatenaRange;
  /** That same displayed text — the run laid out in the column. */
  value: string;
}

export interface HatenaTableRow {
  /** 1-based line of this row. */
  line: number;
  from: number;
  to: number;
  cells: HatenaTableCell[];
}

export interface HatenaTable {
  /** 1-based line of the first row. Body rows follow one per line. */
  line: number;
  from: number;
  to: number;
  rows: HatenaTableRow[];
}

export interface HatenaDocument {
  lines: HatenaLine[];
  tables: HatenaTable[];
}

const headingRegExp = /^(\*+)/;
const listRegExp = /^([-+]+)(\s?)/;
const superPreOpen = ">||";
const superPreClose = "||<";
const quoteOpen = ">>";
const quoteClose = "<<";
const maxHeadingLevel = 5;

// Inline link patterns. Bracket links are matched first; bare URLs are then
// matched only where they do not fall inside a bracket link's range.
const bracketLinkRegExp = /\[(https?:\/\/[^\[\]\s]+?)(?::title(?:=([^\]]*))?)?\]/g;
const bareUrlRegExp = /https?:\/\/[^\s\]]+/g;
const idLinkRegExp = /id:([A-Za-z0-9_-]+)/g;

export function parseHatenaDocument(input: string): HatenaDocument {
  const lines: HatenaLine[] = [];

  // Construct syntax-facing logical lines once. A CR immediately preceding a
  // split LF is a CRLF terminator, not document syntax; a lone CR is deliberately
  // left alone (old-Mac line endings are outside this parser's contract). Raw
  // geometry still includes that CR so literal source remains addressable in the
  // original input.
  const geometry = createLogicalLines(input);
  const texts = geometry.map((line) => line.text);

  const { superPreRoles, superPreLanguages, preRoles } = detectLiteralBlocks(texts);
  // A line is literal if it belongs to EITHER a super-pre or a plain pre block.
  const literal = texts.map((_, index) => superPreRoles[index] !== null || preRoles[index] !== null);

  // Second pass: blockquote depth, tracked as a running counter that skips any
  // line living inside a literal block (its `>>`/`<<` are literal text).
  const quotes = detectQuoteDepths(texts, literal);

  for (const cell of geometry) {
    const index = cell.line - 1;
    const superPre = superPreRoles[index];
    const pre = preRoles[index];

    // Literal (super-pre / pre) lines carry no inline/line syntax of their own.
    if (literal[index]) {
      lines.push({
        line: cell.line,
        from: cell.from,
        to: cell.to,
        heading: null,
        list: null,
        definition: null,
        footnotes: [],
        links: [],
        quote: null,
        superPre,
        superPreLang: superPreLanguages[index],
        pre,
      });
      continue;
    }

    lines.push({
      line: cell.line,
      from: cell.from,
      to: cell.to,
      heading: parseHeading(cell.text, cell.from),
      list: parseList(cell.text, cell.from),
      definition: parseDefinition(cell.text, cell.from),
      footnotes: parseFootnotes(cell.text, cell.from),
      links: parseLinks(cell.text, cell.from),
      quote: quotes[index],
      superPre: null,
      superPreLang: null,
      pre: null,
    });
  }

  assignListOrdinals(lines);
  assignFootnoteNumbers(lines);
  return { lines, tables: parseTables(geometry, literal) };
}

const tableLineRegExp = /^\|/;

/**
 * Group runs of consecutive non-super-pre lines that start with `|` into tables.
 * A `|...|` line inside a literal block is literal, so it never joins a table.
 */
function parseTables(geometry: LogicalLine[], literal: boolean[]): HatenaTable[] {
  const tables: HatenaTable[] = [];
  let current: HatenaTableRow[] = [];

  const flush = () => {
    if (current.length > 0) {
      tables.push({
        line: current[0].line,
        from: current[0].from,
        to: current[current.length - 1].to,
        rows: current,
      });
      current = [];
    }
  };

  for (const cell of geometry) {
    const isTableLine = !literal[cell.line - 1] && tableLineRegExp.test(cell.text);
    if (isTableLine) {
      current.push(parseTableRow(cell.text, cell.from, cell.line));
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

/**
 * Split one `|`-delimited row into cells. The leading `|` (the trigger) and an
 * optional trailing `|` are stripped; cells are the padding+content runs between
 * the pipes. A cell whose trimmed text starts with `*` is a HEADER cell, and the
 * leading `*` becomes the `marker` (hidden on reveal) with the rest as content.
 */
function parseTableRow(text: string, offset: number, line: number): HatenaTableRow {
  const pipeIndexes = findPipeOffsets(text);
  const endsWithPipe = text.trimEnd().endsWith("|") && pipeIndexes.length > 1;
  const boundaries = [
    pipeIndexes[0],
    ...pipeIndexes.slice(1, endsWithPipe ? -1 : undefined),
    endsWithPipe ? pipeIndexes[pipeIndexes.length - 1] : text.length,
  ];

  const cells: HatenaTableCell[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const cellFrom = boundaries[index] + 1;
    const cellTo = boundaries[index + 1];
    const rawValue = text.slice(cellFrom, cellTo);
    const leadingTrim = rawValue.length - rawValue.trimStart().length;
    const trailingTrim = rawValue.length - rawValue.trimEnd().length;
    const trimFrom = cellFrom + leadingTrim;
    const trimTo = cellTo - trailingTrim;
    const header = trimFrom < trimTo && text[trimFrom] === "*";
    const marker = header ? { from: offset + trimFrom, to: offset + trimFrom + 1 } : null;
    const contentFrom = header ? trimFrom + 1 : trimFrom;
    cells.push({
      from: offset + cellFrom,
      to: offset + cellTo,
      header,
      marker,
      content: { from: offset + contentFrom, to: offset + trimTo },
      value: text.slice(contentFrom, trimTo),
    });
  }

  return { line, from: offset, to: offset + text.length, cells };
}

function parseHeading(text: string, from: number): HatenaHeading | null {
  const match = headingRegExp.exec(text);
  if (!match) {
    return null;
  }
  const stars = match[1].length;
  // An optional anchor: `name*` right after the stars, name being ASCII word
  // chars (+ hyphen). Japanese heading text never matches, so `*重要...` is safe.
  const nameMatch = /^([A-Za-z0-9_-]+)\*/.exec(text.slice(stars));
  const markerLength = stars + (nameMatch ? nameMatch[0].length : 0);
  return {
    marker: { from, to: from + markerLength },
    level: Math.min(stars + 2, maxHeadingLevel),
    name: nameMatch ? nameMatch[1] : null,
  };
}

function parseFootnotes(text: string, from: number): HatenaFootnote[] {
  const footnotes: HatenaFootnote[] = [];
  let cursor = 0;
  while (true) {
    const markerStart = text.indexOf("((", cursor);
    if (markerStart === -1) {
      break;
    }
    const close = text.indexOf("))", markerStart + 3);
    if (close === -1) {
      break;
    }
    const contentStart = markerStart + 2;
    footnotes.push({
      marker: { from: from + markerStart, to: from + close + 2 },
      content: { from: from + contentStart, to: from + close },
      text: text.slice(contentStart, close),
      number: 0, // assigned in a document-order pass once every line is parsed.
    });
    cursor = close + 2;
  }
  return footnotes;
}

/** Number footnotes 1..n across the whole document, in reading order. */
function assignFootnoteNumbers(lines: HatenaLine[]): void {
  let counter = 0;
  for (const line of lines) {
    for (const footnote of line.footnotes) {
      counter += 1;
      footnote.number = counter;
    }
  }
}

function parseDefinition(text: string, from: number): HatenaDefinition | null {
  // A `::` continuation is checked first (it also starts with `:`).
  if (text.startsWith("::")) {
    return { continuation: true, marker: { from, to: from + 2 }, term: null, separator: null };
  }
  // `:term:description` — the term is everything up to the second colon.
  const match = /^:([^:]*):/.exec(text);
  if (!match) {
    return null;
  }
  const termStart = from + 1;
  const termEnd = termStart + match[1].length;
  return {
    continuation: false,
    marker: { from, to: from + 1 },
    term: { from: termStart, to: termEnd },
    separator: { from: termEnd, to: termEnd + 1 },
  };
}

function parseList(text: string, from: number): HatenaList | null {
  const match = listRegExp.exec(text);
  if (!match) {
    return null;
  }
  const markerRun = match[1];
  const markerLength = markerRun.length + match[2].length;
  return {
    marker: { from, to: from + markerLength },
    depth: markerRun.length,
    // The innermost level's marker char decides the visible bullet: `+` = ordered.
    ordered: markerRun[markerRun.length - 1] === "+",
    ordinal: null, // assigned in a second pass once every line's list is known.
  };
}

/**
 * Number the ordered list items in document order. Each depth keeps its own
 * counter; descending to a new item at depth d clears the deeper counters (a
 * fresh sublist restarts), while the same depth continues its run across
 * sublists. A non-list line, or a change of bullet kind at that depth, breaks
 * the run and resets its counter.
 */
function assignListOrdinals(lines: HatenaLine[]): void {
  const counters: number[] = [];
  const wasOrdered: boolean[] = [];
  for (const line of lines) {
    const list = line.list;
    if (!list) {
      counters.length = 0;
      wasOrdered.length = 0;
      continue;
    }
    const depth = list.depth;
    counters.length = depth; // clear deeper counters: a new item ends any sublist
    wasOrdered.length = depth;
    if (!list.ordered) {
      counters[depth - 1] = 0;
      wasOrdered[depth - 1] = false;
      continue;
    }
    const next = wasOrdered[depth - 1] ? (counters[depth - 1] ?? 0) + 1 : 1;
    counters[depth - 1] = next;
    wasOrdered[depth - 1] = true;
    list.ordinal = next;
  }
}

/**
 * Resolve each line's super-pre role. `>||` opens a block, `||<` closes it, and
 * every line between is literal `body`. An unclosed block runs to the end of the
 * document. Returns one entry per line (null when the line is outside any block).
 */
// A super-pre opener is `>|lang|` — an empty lang (`>||`) is the plain literal
// block; a non-empty one (`>|python|`, `>|??|`) requests syntax highlighting. A
// plain pre opener is exactly `>|` (no closing pipe on the line).
const superPreOpenRegExp = /^>\|([^|]*)\|$/;
const preOpen = ">|";
const preClose = "|<";

/**
 * One unified scan resolves BOTH literal blocks — super-pre (`>|...|` … `||<`)
 * and plain pre (`>|` … `|<`) — so a `>||` inside a `>|` block stays literal and
 * vice versa (whichever opens first owns its lines until its own close).
 */
function detectLiteralBlocks(texts: string[]): {
  superPreRoles: (HatenaSuperPreRole | null)[];
  superPreLanguages: (string | null)[];
  preRoles: (HatenaPreRole | null)[];
} {
  const superPreRoles: (HatenaSuperPreRole | null)[] = new Array(texts.length).fill(null);
  const superPreLanguages: (string | null)[] = new Array(texts.length).fill(null);
  const preRoles: (HatenaPreRole | null)[] = new Array(texts.length).fill(null);
  let inside: "superpre" | "pre" | null = null;
  for (let index = 0; index < texts.length; index++) {
    const text = texts[index];
    if (inside === null) {
      const open = superPreOpenRegExp.exec(text);
      if (open) {
        superPreRoles[index] = "opener";
        superPreLanguages[index] = open[1] === "" ? null : open[1];
        inside = "superpre";
      } else if (text === preOpen) {
        preRoles[index] = "opener";
        inside = "pre";
      }
      continue;
    }
    if (inside === "superpre") {
      superPreRoles[index] = text === superPreClose ? "closer" : "body";
      if (text === superPreClose) {
        inside = null;
      }
      continue;
    }
    preRoles[index] = text === preClose ? "closer" : "body";
    if (text === preClose) {
      inside = null;
    }
  }
  return { superPreRoles, superPreLanguages, preRoles };
}

/**
 * Track blockquote nesting as a per-line depth. The line-oriented model has no
 * container node, so a `>>` opener owns the depth it introduces and a `<<` closer
 * owns the depth it removes; every line in between is `content` at the current
 * depth. Lines inside a super-pre block never affect the counter.
 */
function detectQuoteDepths(texts: string[], literal: boolean[]): (HatenaQuote | null)[] {
  const quotes: (HatenaQuote | null)[] = new Array(texts.length).fill(null);
  let depth = 0;
  for (let index = 0; index < texts.length; index++) {
    if (literal[index]) {
      continue;
    }
    const text = texts[index];
    // A cite opener `>URL>` behaves like `>>` but records the source URL.
    const cite = /^>(https?:\/\/\S+)>$/.exec(text);
    if (text === quoteOpen) {
      depth += 1;
      quotes[index] = { depth, role: "open", cite: null };
    } else if (cite) {
      depth += 1;
      quotes[index] = { depth, role: "open", cite: cite[1] };
    } else if (text === quoteClose && depth > 0) {
      quotes[index] = { depth, role: "close", cite: null };
      depth -= 1;
    } else if (depth > 0) {
      quotes[index] = { depth, role: "content", cite: null };
    }
  }
  return quotes;
}

function parseLinks(text: string, from: number): HatenaLink[] {
  const links: HatenaLink[] = [];
  const bracketRanges: HatenaRange[] = [];

  for (const match of text.matchAll(bracketLinkRegExp)) {
    const start = from + match.index;
    const end = start + match[0].length;
    bracketRanges.push({ from: start, to: end });
    const href = match[1];
    // `:title=foo` gives an explicit label; `:title` alone would need a network
    // fetch we cannot do here, so the URL itself is the label (see friction log).
    const label = match[2] !== undefined && match[2] !== "" ? match[2] : href;
    links.push({ from: start, to: end, href, label, kind: "bracket" });
  }

  let bareBracketIndex = 0;
  for (const match of text.matchAll(bareUrlRegExp)) {
    const start = from + match.index;
    const end = start + match[0].length;
    while (bracketRanges[bareBracketIndex]?.to <= start) {
      bareBracketIndex += 1;
    }
    const bracketRange = bracketRanges[bareBracketIndex];
    if (bracketRange !== undefined && start >= bracketRange.from && start < bracketRange.to) {
      continue;
    }
    links.push({ from: start, to: end, href: match[0], label: match[0], kind: "url" });
  }

  let idBracketIndex = 0;
  for (const match of text.matchAll(idLinkRegExp)) {
    const start = from + match.index;
    const end = start + match[0].length;
    while (bracketRanges[idBracketIndex]?.to <= start) {
      idBracketIndex += 1;
    }
    const bracketRange = bracketRanges[idBracketIndex];
    if (bracketRange !== undefined && start >= bracketRange.from && start < bracketRange.to) {
      continue;
    }
    // The raw username, not a resolved path -- hatenaLinkPlugin's idUrl
    // resolver decides the destination (see the HatenaLink.href doc comment).
    links.push({ from: start, to: end, href: match[1], label: match[0], kind: "id" });
  }

  return links.sort((a, b) => a.from - b.from);
}
