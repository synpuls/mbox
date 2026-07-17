// The GFM notation namespace parses real GitHub-Flavored Markdown by ADAPTING an
// existing parser library instead of hand-rolling one: `mdast-util-from-markdown`
// (+ the micromark/mdast GFM extensions) turns the text into a nested syntax tree
// with byte-offset positions, and `adaptGfmDocument` flattens that tree into the
// offset-addressed, per-line `GfmDocument` the decoration plugins consume.
//
// Why flatten at all? mbox decorations are addressed by absolute document offset
// and gated by 1-based line number (the reveal model). mdast already carries both
// on every node (`position.start.offset` and `position.start.line`), so the
// adapter is mostly a projection: walk the tree once, and for each construct emit
// a flat record the matching plugin maps straight to decoration specs. Keeping the
// projection flat (rather than handing plugins the raw tree) means every plugin
// stays as simple as the example namespace's — a `flatMap` over an array.
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { Nodes, Parent, Root } from "mdast";

export interface GfmRange {
  from: number;
  to: number;
}

export interface GfmHeading {
  /** 1-based line of the heading. */
  line: number;
  /** Offset of the line start (== the first `#`). */
  from: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** The `#`..`###### ` marker including its trailing space(s). */
  marker: GfmRange;
}

export interface GfmTask {
  /** The `[ ] ` / `[x] ` checkbox including its trailing space. */
  marker: GfmRange;
  checked: boolean;
}

export interface GfmListItem {
  /** 1-based line of the item's first line. */
  line: number;
  /** Offset of the bullet marker (indentation is BEFORE this). */
  from: number;
  /** 0-based nesting depth (top-level items are depth 0). */
  depth: number;
  ordered: boolean;
  /** The `- ` / `1. ` bullet marker including its trailing space(s). */
  bullet: GfmRange;
  /** Present only for GFM task-list items. */
  task: GfmTask | null;
}

export interface GfmCodeBlock {
  /** Whole-block offsets, fence to fence — feed straight to a `lineRange` spec. */
  from: number;
  to: number;
  firstLine: number;
  lastLine: number;
  /** False for an indented code block (no fences, no header dressing). */
  fenced: boolean;
  /** The opening ```` ``` ````/`~~~` run (empty range for an indented block). */
  openingFence: GfmRange;
  /** The rest of the opening fence line (the info string) and its trimmed text. */
  info: GfmRange;
  infoValue: string;
  /** The code interior, offset-addressed; `value` is that same text. */
  content: GfmRange;
  value: string;
  /** The closing fence run, or null when the block is left unterminated. */
  closingFence: GfmRange | null;
}

export interface GfmBlockquote {
  /** Whole-container offsets — feed to a `lineRange` spec. Nested quotes nest. */
  from: number;
  to: number;
  /** 1-based nesting depth (outermost quote is depth 1). */
  depth: number;
}

export interface GfmQuoteMarker {
  /** 1-based line the `>` sits on. */
  line: number;
  from: number;
  to: number;
  /** 1-based nesting depth this particular `>` opens. */
  depth: number;
}

export type GfmInlineStyleType = "emphasis" | "strong" | "delete";

export interface GfmInlineStyle {
  type: GfmInlineStyleType;
  /** 1-based lines the span starts / ends on (differ when it crosses a break). */
  startLine: number;
  endLine: number;
  /** The opening marker (`*`, `**`, `~~`, ...). */
  open: GfmRange;
  /** The styled content between the markers. */
  content: GfmRange;
  /** The closing marker. */
  close: GfmRange;
}

export interface GfmLink {
  from: number;
  to: number;
  /** The visible label range (for a bracketed link, the text inside `[...]`). */
  textFrom: number;
  textTo: number;
  url: string;
  /** True for a bare/`www.` GFM autolink (no `[label](url)` brackets). */
  autolink: boolean;
  startLine: number;
  endLine: number;
}

// Inline code `` `text` ``. mdast's `inlineCode` node carries the literal value
// but NOT the backtick count (a span may open with one or several backticks), so
// the adapter recovers the fences by scanning the runs of `` ` `` at each end of
// the node's source range. Content is whatever sits between them.
export interface GfmInlineCode {
  open: GfmRange;
  content: GfmRange;
  close: GfmRange;
  startLine: number;
  endLine: number;
}

export interface GfmImage {
  /** Whole `![alt](url)` run — feed to the image-kit as one replace target. */
  from: number;
  to: number;
  url: string;
  alt: string;
  /** 1-based line the image sits on (images are single-line inline nodes). */
  line: number;
}

export interface GfmThematicBreak {
  line: number;
  from: number;
  to: number;
}

// A hard line break — either a trailing `\` before the newline, or two trailing
// spaces. Only the backslash form has a marker character to hide; the space form
// leaves nothing to reveal, so `backslash` records which one this is.
export interface GfmHardBreak {
  line: number;
  from: number;
  backslash: boolean;
}

/** One backslash escape: the range of the `\` itself (the escaped char stays). */
export interface GfmEscape {
  line: number;
  from: number;
  to: number;
}

/** One inline `[^label]` reference. `from`..`to` covers the whole bracket run. */
export interface GfmFootnoteReference {
  line: number;
  from: number;
  to: number;
  identifier: string;
  label: string;
}

/**
 * One `[^label]: body` definition block (the body may continue over indented
 * lines). `marker` is the `[^label]:` prefix; `text` is the flattened body,
 * for use as the reference chip's tooltip.
 */
export interface GfmFootnoteDefinition {
  identifier: string;
  label: string;
  from: number;
  to: number;
  startLine: number;
  endLine: number;
  marker: GfmRange;
  text: string;
}

export interface GfmTableCell {
  from: number;
  to: number;
  /** The trimmed cell text (padding stripped) — the run rendered in the column. */
  content: GfmRange;
  value: string;
}

export interface GfmTableRow {
  from: number;
  to: number;
  cells: GfmTableCell[];
}

export type GfmTableAlign = "left" | "right" | "center" | null;

export interface GfmTable {
  /** 1-based line of the header row. Delimiter is line+1, body rows follow. */
  line: number;
  from: number;
  to: number;
  align: GfmTableAlign[];
  header: GfmTableRow;
  delimiter: GfmTableRow;
  rows: GfmTableRow[];
}

export interface GfmDocument {
  headings: GfmHeading[];
  listItems: GfmListItem[];
  codeBlocks: GfmCodeBlock[];
  blockquotes: GfmBlockquote[];
  quoteMarkers: GfmQuoteMarker[];
  inlineStyles: GfmInlineStyle[];
  inlineCodes: GfmInlineCode[];
  links: GfmLink[];
  images: GfmImage[];
  tables: GfmTable[];
  thematicBreaks: GfmThematicBreak[];
  hardBreaks: GfmHardBreak[];
  escapes: GfmEscape[];
  footnoteReferences: GfmFootnoteReference[];
  footnoteDefinitions: GfmFootnoteDefinition[];
}

// mdast marks `position.offset` optional in its types, but `fromMarkdown` always
// populates it. This helper reads the offsets we depend on and fails loudly if a
// node ever lacks them, rather than silently defaulting to 0 and mis-placing a
// decoration.
function rangeOf(node: Nodes): GfmRange {
  const position = node.position;
  if (!position || position.start.offset == null || position.end.offset == null) {
    throw new Error(`mdast node ${node.type} is missing position offsets`);
  }
  return { from: position.start.offset, to: position.end.offset };
}

function startLineOf(node: Nodes): number {
  return node.position?.start.line ?? 1;
}

function endLineOf(node: Nodes): number {
  return node.position?.end.line ?? 1;
}

function isParent(node: Nodes): node is Extract<Nodes, Parent> {
  return "children" in node && Array.isArray((node as Parent).children);
}

// The bullet/checkbox split. `prefix` is the raw text from the bullet marker up
// to the item's content (indentation already excluded, because a listItem's
// offset points AT the bullet). Group 1 is the bullet (`- `, `* `, `1. `), group
// 2 the optional GFM checkbox (`[ ] ` / `[x] `). The marker's own trailing
// whitespace is required EXCEPT at the end of the prefix (`$`): CommonMark
// accepts a bare marker with no content as a valid empty list item, and mdast
// follows that rule, so the regex must too -- otherwise a bare `-`/`*`/`+`/`1.`
// falls through to `bulletText = ""`, an empty bullet range that crashes a
// real EditorView the moment the line loses focus (gfm/list.ts's replace spec).
const listPrefixRegExp = /^((?:[-*+]|\d+[.)])(?:[ \t]+|$))(\[[ xX]\][ \t]*)?/;

interface WalkContext {
  input: string;
  document: GfmDocument;
  listDepth: number;
  blockquoteDepth: number;
  // Line-start offsets for the whole document, computed once. Blockquote,
  // table, and code-block builders all resolve line numbers to offsets, and
  // rebuilding this per construct made the adapter O(n^2) in document size.
  lineStarts: number[];
}

function walk(node: Nodes, context: WalkContext): void {
  const frames: Array<{ node: Nodes; context: WalkContext }> = [{ node, context }];

  const pushChildren = (parent: Nodes, parentContext: WalkContext, options: { ordered?: boolean } = {}): void => {
    if (!isParent(parent)) {
      return;
    }
    const childContext = options.ordered !== undefined ? { ...parentContext, orderedList: options.ordered } : parentContext;
    for (let index = parent.children.length - 1; index >= 0; index -= 1) {
      frames.push({ node: parent.children[index] as Nodes, context: childContext });
    }
  };

  while (frames.length > 0) {
    const frame = frames.pop()!;
    node = frame.node;
    context = frame.context;

    switch (node.type) {
    case "heading": {
      const range = rangeOf(node);
      const firstChild = node.children[0];
      const markerTo = firstChild ? rangeOf(firstChild).from : range.to;
      context.document.headings.push({
        line: startLineOf(node),
        from: range.from,
        level: node.depth,
        marker: { from: range.from, to: markerTo },
      });
      // A heading's children are phrasing content, so visit them to collect
      // inline styles and links inside the heading.
      pushChildren(node, context);
      continue;
    }

    case "list": {
      // Descend with a deeper list level; each listItem reads the current depth.
      const nextContext = { ...context, listDepth: context.listDepth + 1 };
      pushChildren(node, nextContext, { ordered: Boolean(node.ordered) });
      continue;
    }

    case "listItem": {
      const range = rangeOf(node);
      const firstChild = node.children[0];
      const contentStart = firstChild ? rangeOf(firstChild).from : range.to;
      const prefix = context.input.slice(range.from, contentStart);
      const match = listPrefixRegExp.exec(prefix);
      const bulletText = match ? match[1] : "";
      const bulletTo = range.from + bulletText.length;
      let task: GfmTask | null = null;
      if (node.checked != null && match && match[2]) {
        task = {
          marker: { from: bulletTo, to: bulletTo + match[2].length },
          checked: node.checked,
        };
      }
      context.document.listItems.push({
        line: startLineOf(node),
        from: range.from,
        depth: Math.max(0, context.listDepth - 1),
        ordered: context.orderedList ?? false,
        bullet: { from: range.from, to: bulletTo },
        task,
      });
      pushChildren(node, context);
      continue;
    }

    case "code": {
      context.document.codeBlocks.push(buildGfmCodeBlock(node, context.input, context.lineStarts));
      // A code node is a literal: no children, no inline re-parse. This is the
      // free literal protection — nothing else decorates the interior.
      continue;
    }

    case "blockquote": {
      const range = rangeOf(node);
      const depth = context.blockquoteDepth + 1;
      context.document.blockquotes.push({ from: range.from, to: range.to, depth });
      // Scan the outermost blockquote's lines ONCE for their `>` markers; nested
      // blockquotes reuse the same physical lines, so scanning per-node would
      // double-count. Do it only when we cross from depth 0 into depth 1.
      if (context.blockquoteDepth === 0) {
        collectQuoteMarkers(node, context);
      }
      pushChildren(node, { ...context, blockquoteDepth: depth });
      continue;
    }

    case "emphasis":
    case "strong":
    case "delete": {
      const range = rangeOf(node);
      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      const contentFrom = firstChild ? rangeOf(firstChild).from : range.from;
      const contentTo = lastChild ? rangeOf(lastChild).to : range.to;
      context.document.inlineStyles.push({
        type: node.type,
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        open: { from: range.from, to: contentFrom },
        content: { from: contentFrom, to: contentTo },
        close: { from: contentTo, to: range.to },
      });
      pushChildren(node, context);
      continue;
    }

    case "link": {
      const range = rangeOf(node);
      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      const textFrom = firstChild ? rangeOf(firstChild).from : range.from;
      const textTo = lastChild ? rangeOf(lastChild).to : range.to;
      context.document.links.push({
        from: range.from,
        to: range.to,
        textFrom,
        textTo,
        url: node.url,
        // A bracketed markdown link starts with `[`; a GFM autolink is the bare
        // URL/`www.` run, so its first character is not a bracket.
        autolink: context.input[range.from] !== "[",
        startLine: startLineOf(node),
        endLine: endLineOf(node),
      });
      // A link's own DOM (widget) replaces the whole run, so its inner phrasing
      // is not separately decorated — do not recurse.
      continue;
    }

    case "inlineCode": {
      const range = rangeOf(node);
      const raw = context.input.slice(range.from, range.to);
      // The fences are the runs of backticks at each end; content is between them.
      let open = 0;
      while (open < raw.length && raw[open] === "`") {
        open += 1;
      }
      let close = 0;
      while (close < raw.length - open && raw[raw.length - 1 - close] === "`") {
        close += 1;
      }
      context.document.inlineCodes.push({
        open: { from: range.from, to: range.from + open },
        content: { from: range.from + open, to: range.to - close },
        close: { from: range.to - close, to: range.to },
        startLine: startLineOf(node),
        endLine: endLineOf(node),
      });
      // A code span is a literal: no children to re-decorate.
      continue;
    }

    case "image": {
      const range = rangeOf(node);
      context.document.images.push({
        from: range.from,
        to: range.to,
        url: node.url,
        alt: node.alt ?? "",
        line: startLineOf(node),
      });
      continue;
    }

    case "thematicBreak": {
      const range = rangeOf(node);
      context.document.thematicBreaks.push({ line: startLineOf(node), from: range.from, to: range.to });
      continue;
    }

    case "text": {
      // Backslash escapes exist only in the RAW source — mdast hands back the
      // decoded value — so scan this text node's raw slice for `\` + an ASCII
      // punctuation char (the CommonMark escapable set). A text node may span
      // soft line breaks, so the line is tracked through the slice's newlines.
      const range = rangeOf(node);
      const raw = context.input.slice(range.from, range.to);
      let line = startLineOf(node);
      for (let i = 0; i < raw.length - 1; i += 1) {
        if (raw[i] === "\n") {
          line += 1;
          continue;
        }
        if (raw[i] === "\\" && GFM_ESCAPABLE.includes(raw[i + 1])) {
          context.document.escapes.push({ line, from: range.from + i, to: range.from + i + 1 });
          i += 1;
        }
      }
      continue;
    }

    case "break": {
      const range = rangeOf(node);
      context.document.hardBreaks.push({
        line: startLineOf(node),
        from: range.from,
        backslash: context.input[range.from] === "\\",
      });
      continue;
    }

    case "footnoteReference": {
      const range = rangeOf(node);
      context.document.footnoteReferences.push({
        line: startLineOf(node),
        from: range.from,
        to: range.to,
        identifier: node.identifier,
        label: node.label ?? node.identifier,
      });
      continue;
    }

    case "footnoteDefinition": {
      const range = rangeOf(node);
      // The `[^label]:` marker is not a node of its own; recover it from the
      // source (the definition always begins with it).
      const markerTo = context.input.indexOf("]:", range.from) + 2;
      context.document.footnoteDefinitions.push({
        identifier: node.identifier,
        label: node.label ?? node.identifier,
        from: range.from,
        to: range.to,
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        marker: { from: range.from, to: markerTo },
        text: context.input.slice(markerTo, range.to).replace(/\s+/g, " ").trim(),
      });
      // The body is plain prose; do not recurse — footnote bodies keep their raw
      // inline text (like table cells), so nothing fights the definition styling.
      continue;
    }

    case "table": {
      context.document.tables.push(buildGfmTable(node, context.input, context.lineStarts));
      // The cells' inline text is projected raw into the column grid; do not
      // recurse, so inline styles inside a cell never fight the fixed layout
      // (matching the mbox table's raw-text presentation).
      continue;
    }

    default: {
      if (isParent(node)) {
        pushChildren(node, context);
      }
    }
  }
  }
}

// mdast represents a GFM table as table -> tableRow -> tableCell, but it drops the
// delimiter line (`---|---`) entirely and its cell offsets fold the pipes into the
// cell bounds. mbox's table plugin instead wants pipe-SEPARATED cells (pipes live
// in the gaps between cells) for every physical line, INCLUDING the delimiter. So
// the adapter uses mdast only to locate the table's line span and per-column
// alignment, then scans each physical line into cells the same way the mbox parser
// does — one uniform `parseGfmTableRow` for header, delimiter and body rows.
function buildGfmTable(node: Nodes, input: string, lineStarts: number[]): GfmTable {
  const range = rangeOf(node);
  const position = node.position!;
  const startLine = position.start.line;
  const endLine = position.end.line;

  const lineTextAt = (line: number): string => {
    const start = lineStarts[line - 1];
    const end = lineStarts[line] != null ? lineStarts[line] - 1 : input.length;
    return input.slice(start, end);
  };

  const header = parseGfmTableRow(lineTextAt(startLine), lineStarts[startLine - 1]);
  const delimiter = parseGfmTableRow(lineTextAt(startLine + 1), lineStarts[startLine]);
  const rows: GfmTableRow[] = [];
  for (let line = startLine + 2; line <= endLine; line += 1) {
    rows.push(parseGfmTableRow(lineTextAt(line), lineStarts[line - 1]));
  }

  const align: GfmTableAlign[] = "align" in node && Array.isArray((node as { align?: unknown[] }).align)
    ? ((node as { align: GfmTableAlign[] }).align)
    : [];

  return { line: startLine, from: range.from, to: range.to, align, header, delimiter, rows };
}

// mdast's `code` node reports only the fence-to-fence span, the language, the meta
// string and the literal value — never the offsets of the fences themselves. The
// header/Copy-button/hidden-fence presentation needs those, so the adapter recovers
// them from the source: the opening line's fence run and info string, the interior
// offsets (from the value's length), and the closing fence when the block is closed.
const codeFenceRegExp = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

function buildGfmCodeBlock(node: Nodes, input: string, lineStarts: number[]): GfmCodeBlock {
  const range = rangeOf(node);
  const firstLine = startLineOf(node);
  const lastLine = endLineOf(node);
  const value = "value" in node && typeof (node as { value?: unknown }).value === "string" ? (node as { value: string }).value : "";

  const lineTextAt = (line: number): string => {
    const start = lineStarts[line - 1];
    const end = lineStarts[line] != null ? lineStarts[line] - 1 : input.length;
    return input.slice(start, end);
  };

  const openLineStart = lineStarts[firstLine - 1];
  const openLineText = lineTextAt(firstLine);
  const fenceMatch = codeFenceRegExp.exec(openLineText);

  let fenced = false;
  let openingFence: GfmRange = { from: openLineStart, to: openLineStart };
  let info: GfmRange = { from: openLineStart, to: openLineStart };
  let infoValue = "";
  let closingFence: GfmRange | null = null;

  if (fenceMatch) {
    fenced = true;
    const indent = fenceMatch[1].length;
    const fenceChar = fenceMatch[2][0];
    const fenceLength = fenceMatch[2].length;
    const fenceFrom = openLineStart + indent;
    openingFence = { from: fenceFrom, to: fenceFrom + fenceLength };
    const infoFrom = openingFence.to;
    const infoTo = openLineStart + openLineText.length;
    info = { from: infoFrom, to: infoTo };
    // Keep the info string RAW (untrimmed) so a regex match index maps straight
    // back onto the source offset; consumers trim it when they need the bare value.
    infoValue = fenceMatch[3];

    // A closing fence is a later line that is itself a fence run of the same char.
    if (lastLine > firstLine) {
      const closeLineText = lineTextAt(lastLine);
      const closeMatch = /^(\s{0,3})(`{3,}|~{3,})\s*$/.exec(closeLineText);
      if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= fenceLength) {
        const closeFrom = lineStarts[lastLine - 1] + closeMatch[1].length;
        closingFence = { from: closeFrom, to: closeFrom + closeMatch[2].length };
      }
    }
  }

  // The interior begins on the line after the opening fence (or at the block start
  // for an indented block) and is exactly `value` long.
  const contentFrom = fenced ? (firstLine < lastLine ? lineStarts[firstLine] : openingFence.to) : range.from;
  const content: GfmRange = { from: contentFrom, to: contentFrom + value.length };

  return { from: range.from, to: range.to, firstLine, lastLine, fenced, openingFence, info, infoValue, content, value, closingFence };
}

// Reimplements the mbox parser's row splitter: cells are the padding+content runs
// BETWEEN the `|` separators (leading/trailing pipes are optional), and `content`
// is the trimmed inner range. Kept independent of the mbox namespace by design.
function parseGfmTableRow(text: string, offset: number): GfmTableRow {
  const pipeIndexes = [...text].flatMap((character, index) => (character === "|" ? [index] : []));
  const startsWithPipe = text.trimStart().startsWith("|");
  const endsWithPipe = text.trimEnd().endsWith("|");
  const boundaries = [
    startsWithPipe ? pipeIndexes[0] : -1,
    ...pipeIndexes.slice(startsWithPipe ? 1 : 0, endsWithPipe ? -1 : undefined),
    endsWithPipe ? pipeIndexes[pipeIndexes.length - 1] : text.length,
  ];

  const cells: GfmTableCell[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const cellFrom = boundaries[index] + 1;
    const cellTo = boundaries[index + 1];
    const rawValue = text.slice(cellFrom, cellTo);
    const leadingTrim = rawValue.length - rawValue.trimStart().length;
    const trailingTrim = rawValue.length - rawValue.trimEnd().length;
    const contentFrom = cellFrom + leadingTrim;
    const contentTo = cellTo - trailingTrim;
    cells.push({
      from: offset + cellFrom,
      to: offset + cellTo,
      content: { from: offset + contentFrom, to: offset + contentTo },
      value: text.slice(contentFrom, contentTo),
    });
  }

  return { from: offset, to: offset + text.length, cells };
}

// Scan every line of a top-level blockquote (its whole line span) for leading `>`
// characters, emitting one marker per `>`. Lazy-continuation lines simply have no
// `>` and contribute no marker.
function collectQuoteMarkers(node: Nodes, context: WalkContext): void {
  const position = node.position;
  if (!position) {
    return;
  }
  const lineStarts = context.lineStarts;
  for (let line = position.start.line; line <= position.end.line; line += 1) {
    const lineStart = lineStarts[line - 1];
    if (lineStart == null) {
      continue;
    }
    const lineEnd = lineStarts[line] != null ? lineStarts[line] - 1 : context.input.length;
    let cursor = lineStart;
    // Skip leading indentation.
    while (cursor < lineEnd && (context.input[cursor] === " " || context.input[cursor] === "\t")) {
      cursor += 1;
    }
    let depth = 0;
    while (cursor < lineEnd && context.input[cursor] === ">") {
      const markerFrom = cursor;
      cursor += 1;
      // A `>` optionally consumes one following space, matching `> ` reveal width.
      if (cursor < lineEnd && context.input[cursor] === " ") {
        cursor += 1;
      }
      depth += 1;
      context.document.quoteMarkers.push({ line, from: markerFrom, to: cursor, depth });
    }
  }
}

function lineStartOffsets(input: string): number[] {
  const starts = [0];
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

// A tiny per-call extension of WalkContext for the two cases that pass extra info
// down one level (a list's ordered flag to its items).
interface WalkContext {
  orderedList?: boolean;
}

/**
 * The adapter: project one mdast tree onto the flat GfmDocument. Exported next to
 * `parseGfmDocument` because it is the load-bearing seam of this notation — a host
 * that already holds an mdast tree can reuse it directly.
 */
export function adaptGfmDocument(tree: Root, input: string): GfmDocument {
  const document: GfmDocument = {
    headings: [],
    listItems: [],
    codeBlocks: [],
    blockquotes: [],
    quoteMarkers: [],
    inlineStyles: [],
    inlineCodes: [],
    links: [],
    images: [],
    tables: [],
    thematicBreaks: [],
    hardBreaks: [],
    escapes: [],
    footnoteReferences: [],
    footnoteDefinitions: [],
  };
  walk(tree, { input, document, listDepth: 0, blockquoteDepth: 0, lineStarts: lineStartOffsets(input) });
  return document;
}

const GFM_ESCAPABLE = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** Parse GFM text into the flat GfmDocument the decoration plugins read. */
export function parseGfmDocument(input: string): GfmDocument {
  const tree = fromMarkdown(input, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return adaptGfmDocument(tree, input);
}
