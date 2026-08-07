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
import { decodeString } from "micromark-util-decode-string";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { Nodes, Parent, Root } from "mdast";
import { findPipeOffsets } from "../pipe-table-row.js";

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
  /** Present for a setext heading: the complete physical underline line,
   * including any blockquote or list prefix that mdast omits from the heading
   * node's content range. */
  setextUnderline?: GfmRange & { line: number };
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
  /** Fenced-code language and metadata as parsed by mdast. */
  lang: string | null;
  meta: string | null;
  /** Raw info source, retained solely for source-range presentation. */
  infoValue: string;
  /** The one GFM info-string decision shared by labels and language consumers. */
  language: GfmCodeBlockLanguage | null;
  /** The contiguous raw source interior, from the opening line break through
   * the closing fence's start. This is not the range that spells `value`:
   * mdast removes container prefixes and fence indentation from `value`, so
   * the two differ. Use `contentSegments` when line correspondence to `value`
   * is needed. */
  content: GfmRange;
  /** Source segments whose `text` values, joined with `"\\n"`, exactly equal
   * `value`. Empty lines are represented by zero-width segments. These are
   * separate from `content` because a list/blockquote prefix is absent from
   * mdast's normalized code value. `value === ""` has no segments: mdast uses
   * that same value for a block with no value lines and for one containing only
   * empty physical lines, so those source forms cannot be distinguished here. */
  contentSegments: GfmCodeBlockContentSegment[];
  value: string;
  /** The closing fence run, or null when the block is left unterminated. */
  closingFence: GfmRange | null;
}

export interface GfmCodeBlockLanguage {
  /** The decoded first info token, split as GitHub splits it. */
  id: string;
  /** The absolute document span of the raw source spelling that token. */
  span: GfmRange;
}

/** Whether this fenced code-block record represents GitHub's `math` fence. */
export function isGfmMathFence(block: GfmCodeBlock): boolean {
  // Verified with GitHub's Markdown API on 2026-07-27: `math foo` renders as
  // math, while `MATH` remains a code block. The info string's first token is
  // the language; following whitespace-separated tokens are metadata.
  return block.fenced && block.language?.id === "math";
}

export interface GfmCodeBlockContentSegment extends GfmRange {
  text: string;
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
  /** Text rendered by the link widget, with nested inline markdown projected. */
  text: string;
  /** A label-relative range tree for the link widget. It is deliberately
   * narrower than mdast: rendering this projection cannot accidentally turn
   * parsed HTML or a nested link into DOM. */
  label: readonly GfmLinkLabelNode[];
  /** Raw source for the label range only. The widget uses it with label-node
   * source ranges; keeping this local avoids handing it the mdast tree or the
   * surrounding document. */
  labelSource: string;
  url: string;
  /** True for a bare/`www.` GFM autolink (no `[label](url)` brackets). */
  autolink: boolean;
  startLine: number;
  endLine: number;
  /** True when the whole widget belongs to a GFM table cell. */
  inTableCell: boolean;
}

export type GfmLinkLabelNode =
  | GfmLinkLabelTextNode
  | GfmLinkLabelContainerNode
  | GfmLinkLabelCodeNode
  | GfmLinkLabelBreakNode
  | GfmLinkLabelDisplayTextNode
  | GfmLinkLabelUnknownNode;

interface GfmLinkLabelTextNode extends GfmRange {
  kind: "text";
}

interface GfmLinkLabelContainerNode extends GfmRange {
  kind: "emphasis" | "strong" | "delete";
  children: readonly GfmLinkLabelNode[];
}

interface GfmLinkLabelCodeNode extends GfmRange {
  kind: "inlineCode";
  content: GfmRange;
}

interface GfmLinkLabelBreakNode extends GfmRange {
  kind: "break";
}

/** A whole-source widget whose displayed label is intentionally not its raw
 * Markdown spelling. */
interface GfmLinkLabelDisplayTextNode extends GfmRange {
  kind: "image" | "footnoteReference";
  text: string;
  /**
   * An image's source URL. Present only for `kind: "image"`, so a renderer that
   * draws pictures can build one; a renderer that does not still has `text`,
   * which is the alt.
   *
   * This is a URL out of the document and is NOT checked here. The renderer
   * decides whether to fetch it, exactly as it decides for a standalone image.
   * The link's own destination stays on its separate, allowlist-checked path.
   */
  url?: string;
}

/** Any mdast kind outside the allowlist. Renderers must append its label-local source as
 * text, including a nested link; never interpret it as HTML or another DOM
 * element. */
interface GfmLinkLabelUnknownNode extends GfmRange {
  kind: "unknown";
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

/** GitHub's `$`-wrapped code-span math escape hatch: `` $`…`$ ``. */
export interface GfmInlineMath {
  /** Whole delimiter run, including the adjacent dollar characters. */
  from: number;
  to: number;
  expression: string;
  /** The source spelling that introduced this math expression. */
  delimiter: "backtick" | "dollar";
  /** The inline-code source span this backtick-form math record replaced.
   * Absent for dollar-form math, which did not promote an inline-code span. */
  sourceCodeSpan?: GfmRange;
  /** Inline math replaces one line; display math owns one or more whole lines. */
  display: "inline" | "block";
  startLine: number;
  endLine: number;
  /** True when the whole widget belongs to a GFM table cell. */
  inTableCell: boolean;
}

// GitHub Docs listed `` $`…`$ `` as a second inline-math form on 2026-07-27.
// They do not specify empty content, multi-backtick fences, alphanumeric
// adjacency, or code-span whitespace normalization; GitHub's Markdown API
// returned only `<code>` for this syntax, so it could not confirm its math
// rendering path. Recognition therefore deliberately composes the documented
// dollar adjacency with mdast/CommonMark's code-span parsing, including its
// normalized literal `inlineCode.value` (which does not resolve backslashes).

export interface GfmImage {
  /** Whole `![alt](url)` run — feed to the image-kit as one replace target. */
  from: number;
  to: number;
  url: string;
  alt: string;
  /** 1-based line the image sits on (images are single-line inline nodes). */
  line: number;
  /** True when the whole widget belongs to a GFM table cell. */
  inTableCell: boolean;
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
  /** Exact text shown after text-shaped inline syntax inside the cell is hidden. */
  displayValue?: string;
  /**
   * This cell holds at least one image that will be drawn as a picture when a
   * consumer renders pictures.
   *
   * A fact about the SOURCE, deliberately: whether it is then drawn as a
   * picture or as its alt text is a plugin option, and the parser is cached per
   * state and never sees plugin options. A consumer that wants the column to
   * make room for a picture reads this and decides for itself.
   *
   * An image inside a link label counts. It is drawn inside the link's anchor
   * rather than on its own, but it still occupies the cell as a picture, so the
   * column needs the same room. (It did not count while such an image was
   * flattened to its alt text.)
   */
  hasImage?: boolean;
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
  inlineMath: GfmInlineMath[];
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

/**
 * Recovers the source ranges of an mdast inline-code node. mdast retains the
 * node's whole source range but not its opening/closing backtick run lengths,
 * so every source-to-display consumer must derive these same boundaries.
 *
 * When CommonMark's single-line ASCII-space padding rule applies, the removed
 * spaces are absorbed by the fence ranges. This lets callers hide them with
 * their markers while leaving the content range as the visible code text.
 *
 * The result says nothing about whether that happened. A boolean would be the
 * wrong shape for the multiline half anyway: a line ending becomes a single
 * space, which no boundary move can express -- that needs a display string and
 * a widget, not a flag.
 */
export interface GfmInlineCodeFenceRanges {
  open: GfmRange;
  content: GfmRange;
  close: GfmRange;
}

/** Shared GFM code-span source-to-display projection. */
export function recoverGfmInlineCodeFences(range: GfmRange, input: string): GfmInlineCodeFenceRanges {
  const raw = input.slice(range.from, range.to);
  let openLength = 0;
  while (openLength < raw.length && raw[openLength] === "`") {
    openLength += 1;
  }
  let closeLength = 0;
  while (closeLength < raw.length - openLength && raw[raw.length - 1 - closeLength] === "`") {
    closeLength += 1;
  }
  let contentFrom = range.from + openLength;
  let contentTo = range.to - closeLength;
  const content = input.slice(contentFrom, contentTo);
  // CommonMark strips exactly one ASCII space from each end, only for a
  // single physical line whose content is not all spaces. Tabs are content.
  const stripPadding = !content.includes("\n")
    && !content.includes("\r")
    && content.startsWith(" ")
    && content.endsWith(" ")
    && /[^ ]/.test(content);
  if (stripPadding) {
    contentFrom += 1;
    contentTo -= 1;
  }
  return {
    open: { from: range.from, to: contentFrom },
    content: { from: contentFrom, to: contentTo },
    close: { from: contentTo, to: range.to },
  };
}

/**
 * Projects mdast's already padding-normalized inline-code value to GitHub's
 * displayed code-span text. This is deliberately separate from fence recovery:
 * ranges describe source geometry, while a folded line ending needs a widget
 * text string and cannot be represented by moving a boundary.
 */
export function projectGfmInlineCodeDisplay(value: string): string {
  return value.replace(/(?:\r\n?|\n)[ \t]*/g, " ");
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
// falls through to `bulletText = ""`, yielding an empty bullet range instead
// of representing the bare marker's syntax.
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
  /** Source ranges that a post-walk dollar scan must never reinterpret. */
  protectedRanges: ProtectedRange[];
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

  const pushFootnoteDefinitionParagraphs = (definition: Nodes, definitionContext: WalkContext): void => {
    if (!isParent(definition)) {
      return;
    }
    // A definition may contain any flow content, but this traversal change is
    // intentionally limited to paragraphs. Once a paragraph is on the stack,
    // its phrasing children use the normal walker; sibling lists, quotes, and
    // code blocks remain raw footnote source.
    for (let index = definition.children.length - 1; index >= 0; index -= 1) {
      const child = definition.children[index] as Nodes;
      if (child.type === "paragraph") {
        frames.push({ node: child, context: definitionContext });
      }
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
      const marker = { from: range.from, to: markerTo };
      const setextUnderlineLine = marker.from === marker.to ? endLineOf(node) : null;
      context.document.headings.push({
        line: startLineOf(node),
        from: range.from,
        level: node.depth,
        marker,
        ...(setextUnderlineLine === null
          ? {}
          : {
            setextUnderline: {
              line: setextUnderlineLine,
              from: context.lineStarts[setextUnderlineLine - 1]!,
              to: lineEndOffset(context.input, context.lineStarts, setextUnderlineLine),
            },
          }),
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
        text: projectLinkText(node, context.input),
        label: node.children.map((child) => projectGfmLinkLabel(child as Nodes, context.input, textFrom)),
        labelSource: context.input.slice(textFrom, textTo),
        url: node.url,
        // A bracketed markdown link starts with `[`; a GFM autolink is the bare
        // URL/`www.` run, so its first character is not a bracket.
        autolink: context.input[range.from] !== "[",
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        inTableCell: context.inTableCell ?? false,
      });
      // A link's own DOM (widget) replaces the whole run, so its inner phrasing
      // is not separately decorated — do not recurse.
      continue;
    }

    case "inlineCode": {
      const range = rangeOf(node);
      const fences = recoverGfmInlineCodeFences(range, context.input);
      const code = {
        open: fences.open,
        content: fences.content,
        close: fences.close,
        startLine: startLineOf(node),
        endLine: endLineOf(node),
      };
      context.document.inlineCodes.push(code);
      // An inline replace decoration may not contain a line break. More
      // importantly, GitHub's inline math form is an inline construct, so a
      // code span crossing physical document lines remains ordinary code.
      // Keep this decision at collection time: both math and the bundle's
      // inline-code exclusion consume this same list.
      if (!context.inFootnoteDefinition && code.startLine === code.endLine && isGfmInlineMathRange(range, context.input)) {
        context.document.inlineMath.push({
          from: range.from - 1,
          to: range.to + 1,
          // Ordinary single-line inline code reaches CommonMark's whitespace
          // result through its source ranges; math instead uses mdast's
          // normalized value. Multiline normalization still waits for Section 8.
          expression: node.value,
          delimiter: "backtick",
          sourceCodeSpan: { from: range.from, to: range.to },
          display: "inline",
          startLine: code.startLine,
          endLine: code.endLine,
          inTableCell: context.inTableCell ?? false,
        });
      }
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
        inTableCell: context.inTableCell ?? false,
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
      let cursor = 0;
      for (const escapeOffset of gfmEscapeOffsets(raw)) {
        while (cursor < escapeOffset) {
          if (raw[cursor] === "\n") {
            line += 1;
          }
          cursor += 1;
        }
        context.document.escapes.push({ line, from: range.from + escapeOffset, to: range.from + escapeOffset + 1 });
        cursor = escapeOffset + 2;
      }
      while (cursor < raw.length) {
        if (raw[cursor] === "\n") {
          line += 1;
        }
        cursor += 1;
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
      context.protectedRanges.push(range);
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
      context.protectedRanges.push(range);
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
      // Keep the whole definition protected from bare-dollar math, but traverse
      // paragraph phrasing so ordinary inline decorations render in its body.
      // Table cells already recurse through their children; lists, quotes, and
      // code blocks deliberately remain raw here (see the limited helper).
      pushFootnoteDefinitionParagraphs(node, { ...context, inFootnoteDefinition: true });
      continue;
    }

    case "definition":
    case "html": {
      // These nodes are deliberately opaque to the dollar scanner. Footnote
      // labels/definitions, link-reference destinations, and raw HTML are
      // syntax-owned source, so replacing a `$…$` inside them would corrupt
      // the widget's host. Headings, quotes, ordinary list/table prose remain
      // scannable; setext rules, table separators/padding/pipes, and hard
      // breaks cannot form `$…$`, while autolinks are already protected as
      // links.
      context.protectedRanges.push(rangeOf(node));
      continue;
    }

    case "table": {
      context.document.tables.push(buildGfmTable(node, context.input, context.lineStarts, context.document.quoteMarkers));
      pushChildren(node, context);
      continue;
    }

    case "tableCell": {
      // Preserve normal inline traversal and carry this scope onto whole-run
      // widgets so their plugins can select table-safe rendering explicitly.
      pushChildren(node, { ...context, inTableCell: true });
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
function buildGfmTable(node: Nodes, input: string, lineStarts: number[], quoteMarkers: readonly GfmQuoteMarker[]): GfmTable {
  const range = rangeOf(node);
  const position = node.position!;
  const startLine = position.start.line;
  const endLine = position.end.line;

  // Inside a blockquote the physical line begins `> `, and the cell scanner is
  // given whole physical lines. Handing it the marker made `>` the first cell
  // and pushed every real column one place right. Start each row after the
  // line's LAST quote marker, so `>>` works the same way. Lines outside a
  // blockquote have no markers and start where they always did.
  const contentStartAt = (line: number): number => {
    let start = lineStarts[line - 1];
    for (const marker of quoteMarkers) {
      if (marker.line === line && marker.to > start) start = marker.to;
    }
    return start;
  };

  const lineTextAt = (line: number): string => {
    const start = contentStartAt(line);
    const end = lineEndOffset(input, lineStarts, line);
    return input.slice(start, end);
  };

  const header = parseGfmTableRow(lineTextAt(startLine), contentStartAt(startLine));
  const delimiter = parseGfmTableRow(lineTextAt(startLine + 1), contentStartAt(startLine + 1));
  const rows: GfmTableRow[] = [];
  for (let line = startLine + 2; line <= endLine; line += 1) {
    const text = lineTextAt(line);
    // mdast includes a lone `|` in its table node, but it does not describe a
    // cell: that one pipe is both optional row boundaries. Do not turn that
    // impossible interval into a reversed cell range; GitHub ends the table
    // before this physical line. `||` has two distinct boundaries and remains
    // a valid zero-width physical cell.
    if (!hasUsableGfmTableCell(text)) {
      break;
    }
    rows.push(parseGfmTableRow(text, contentStartAt(line)));
  }

  const align: GfmTableAlign[] = "align" in node && Array.isArray((node as { align?: unknown[] }).align)
    ? ((node as { align: GfmTableAlign[] }).align)
    : [];

  const mdastRows = isParent(node) ? node.children : [];
  applyTableDisplayValues(header, mdastRows[0] as Nodes | undefined, input);
  rows.forEach((row, index) => applyTableDisplayValues(row, mdastRows[index + 1] as Nodes | undefined, input));

  return { line: startLine, from: range.from, to: range.to, align, header, delimiter, rows };
}

// mdast gives table cells their inline children while our row scanner owns their
// source-accurate pipe/padding geometry. Pair them by row and column so the kit
// measures exactly the text left after the inline plugins hide syntax markers.
interface ProjectedTableSegment {
  /** Source offsets represented by this projected piece. */
  from: number;
  to: number;
  /** Its display text before bare-dollar math is projected. */
  text: string;
  /** Text nodes can be split at a later math range while retaining escape handling. */
  projectSourceSlice?: (from: number, to: number) => string;
}

// Kept private to the parser: table-kit only needs displayValue, while this map
// preserves the source-to-display correspondence until bare-dollar math is known.
const tableDisplaySegments = new WeakMap<GfmTableCell, ProjectedTableSegment[]>();

/**
 * Whether these inline children contain an image at all.
 *
 * A link label is descended into: an image there is drawn inside the link's
 * anchor, so it occupies the cell exactly as a bare one does. Descent used to
 * stop at a link, back when such an image was flattened to its alt text.
 */
function hasImage(children: readonly Nodes[]): boolean {
  return children.some((child) => child.type === "image" || (isParent(child) && hasImage(child.children as Nodes[])));
}

function applyTableDisplayValues(row: GfmTableRow, mdastRow: Nodes | undefined, input: string): void {
  if (!mdastRow || !isParent(mdastRow)) {
    return;
  }
  row.cells.forEach((cell, index) => {
    const mdastCell = mdastRow.children[index] as Nodes | undefined;
    if (mdastCell && isParent(mdastCell)) {
      const segments = projectTableInlineChildren(mdastCell.children as Nodes[], input);
      tableDisplaySegments.set(cell, segments);
      cell.displayValue = segments.map((segment) => segment.text).join("");
      if (hasImage(mdastCell.children as Nodes[])) {
        cell.hasImage = true;
      }
    }
  });
}

function projectTableInlineChildren(children: Nodes[], input: string): ProjectedTableSegment[] {
  const segments: ProjectedTableSegment[] = [];
  const consumedTextStarts = new Map<number, number>();
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const next = children[index + 1];
    const afterNext = children[index + 2];
    if (
      child.type === "text"
      && next?.type === "inlineCode"
      && afterNext?.type === "text"
      && input[rangeOf(child).to - 1] === "$"
      && input[rangeOf(afterNext).from] === "$"
      && isGfmInlineMathRange(rangeOf(next), input)
    ) {
      // The dollars are text siblings of mdast's inlineCode node. Consume them
      // here, alongside that exact code span, rather than doing a later string
      // replacement that could alter an identical literal elsewhere in the cell.
      const childRange = rangeOf(child);
      const before = { from: consumedTextStarts.get(index) ?? childRange.from, to: childRange.to };
      const code = rangeOf(next);
      const after = rangeOf(afterNext);
      segments.push(...projectTableInlineText(child, input, before.from, before.to - 1));
      // The complete `$`-wrapped code span is one source-addressable segment.
      // This lets the later math pass replace exactly this occurrence even when
      // equal source strings appear before or after it in the same cell.
      segments.push({ from: before.to - 1, to: after.from + 1, text: next.value });
      // Do not consume the rest of this text sibling. It may end with the
      // opening dollar for another adjacent `$`-wrapped code span.
      consumedTextStarts.set(index + 2, after.from + 1);
      index += 1;
      continue;
    }
    const childRange = rangeOf(child);
    segments.push(...projectTableInlineText(child, input, consumedTextStarts.get(index) ?? childRange.from, childRange.to));
  }
  return segments;
}

function projectTableInlineText(node: Nodes, input: string, sliceFrom?: number, sliceTo?: number): ProjectedTableSegment[] {
  const range = rangeOf(node);
  switch (node.type) {
    case "text": {
      const from = sliceFrom ?? range.from;
      const to = sliceTo ?? range.to;
      return [{ from, to, text: removeGfmEscapeBackslashes(input.slice(from, to)), projectSourceSlice: (start, end) => removeGfmEscapeBackslashes(input.slice(start, end)) }];
    }

    case "emphasis":
    case "strong":
    case "delete":
      return node.children.flatMap((child) => projectTableInlineText(child as Nodes, input));

    case "inlineCode": {
      if (isGfmInlineMathRange(range, input)) {
        // Keep this exactly equal to GfmInlineMath.expression and the widget's
        // hidden TeX fallback. It is text equality only: TableKit measures in
        // `ch`, while an arbitrary renderer's fractions, roots, or matrices
        // have no guaranteed rendered width or height.
        //
        // Decision: retain inline math widgets in tables rather than force a
        // token as Section 4B does for image previews. Inline math is intended
        // to fit within text and is useful in tables; forcing it would harm a
        // more common use than it protects. This remains an approximation:
        // renderer-dependent height/width can still disturb the fixed grid.
        return [{ from: range.from - 1, to: range.to + 1, text: node.value }];
      }
      const fences = recoverGfmInlineCodeFences(range, input);
      return [{ from: fences.content.from, to: fences.content.to, text: input.slice(fences.content.from, fences.content.to) }];
    }

    // Widgets replace their whole source spans. Their projection must match the
    // widget's visible text so table-width measurement and DOM rendering agree.
    case "link":
      return [{ from: range.from, to: range.to, text: projectLinkText(node, input) }];

    case "image":
    case "footnoteReference":
      return [{ from: range.from, to: range.to, text: projectGfmWidgetText(node) }];

    // A hard break cannot occur in a single-line pipe-table cell. Inline HTML
    // has no GFM presentation plugin, so its raw source is intentionally its
    // display width. Every other node that reaches this fallback is likewise
    // undecorated: this invariant makes raw-source width correct and requires
    // a deliberate case above when a new GFM node gains a decoration.
    case "break":
    case "html":
    default:
      return [{ from: range.from, to: range.to, text: input.slice(range.from, range.to) }];
  }
}

function isGfmInlineMathRange(range: GfmRange, input: string): boolean {
  return input[range.from - 1] === "$"
    && input[range.to] === "$"
    // The closing dollar immediately follows the code span's closing backtick,
    // so it cannot itself be escaped; only the opening dollar needs this check.
    && !isEscaped(input, range.from - 1);
}

/**
 * Whether `offset` is escaped by its preceding backslash run.
 *
 * This is the sole implementation of the backslash-run parity rule: an odd
 * number of immediately preceding backslashes escapes the character.
 */
function isEscaped(input: string, offset: number): boolean {
  let backslashes = 0;
  for (let cursor = offset - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

// An empty link label has no phrasing children. A whole-run link widget would
// otherwise replace its source with an empty DOM node, so use the exact source
// as its shared widget/table projection.
function projectLinkText(node: Extract<Nodes, { type: "link" }>, input: string): string {
  const text = node.children.flatMap((child) => projectTableInlineText(child as Nodes, input)).map((segment) => segment.text).join("");
  return text || input.slice(rangeOf(node).from, rangeOf(node).to);
}

/** Display text for inline widgets that replace their entire source range.
 * Link-label DOM and table-width projection both call this so their visible
 * strings cannot drift apart. */
function projectGfmWidgetText(node: Extract<Nodes, { type: "image" | "footnoteReference" }>): string {
  return node.type === "image" ? node.alt || node.url : node.label ?? node.identifier;
}

function projectGfmLinkLabel(node: Nodes, input: string, sourceFrom: number): GfmLinkLabelNode {
  const range = rangeOf(node);
  const relativeRange = { from: range.from - sourceFrom, to: range.to - sourceFrom };
  switch (node.type) {
    case "text":
      return { kind: "text", ...relativeRange };

    case "emphasis":
    case "strong":
    case "delete":
      return { kind: node.type, ...relativeRange, children: node.children.map((child) => projectGfmLinkLabel(child as Nodes, input, sourceFrom)) };

    case "inlineCode": {
      const fences = recoverGfmInlineCodeFences(range, input);
      return {
        kind: "inlineCode",
        ...relativeRange,
        content: { from: fences.content.from - sourceFrom, to: fences.content.to - sourceFrom },
      };
    }

    case "break":
      return { kind: "break", ...relativeRange };

    case "image":
      return { kind: "image", ...relativeRange, text: projectGfmWidgetText(node), url: node.url };

    case "footnoteReference":
      return { kind: node.type, ...relativeRange, text: projectGfmWidgetText(node) };

    // This is the parser half of the link-label trust boundary. The renderer
    // receives no mdast node and therefore only this explicit unknown kind for
    // HTML, links, and any future syntax we have not approved.
    default:
      return { kind: "unknown", ...relativeRange };
  }
}

/**
 * Offsets of backslashes that CommonMark treats as escapes in this raw text.
 *
 * This deliberately remains separate from isEscaped: it additionally owns the
 * GFM_ESCAPABLE character set and consumes escape pairs while scanning raw text,
 * whereas isEscaped answers only the shared parity question at one offset.
 */
function gfmEscapeOffsets(raw: string): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < raw.length - 1; index += 1) {
    if (raw[index] === "\\" && GFM_ESCAPABLE.includes(raw[index + 1])) {
      offsets.push(index);
      index += 1;
    }
  }
  return offsets;
}

// Keep the table-width projection coupled to the escape decoration walker above:
// both remove precisely the backslashes reported by gfmEscapeOffsets. Exported
// for the link widget, which renders label text from source ranges and must
// strip exactly the same backslashes -- a second spelling of this rule would be
// free to drift, and the anchor's text would stop matching the width model.
export function removeGfmEscapeBackslashes(raw: string): string {
  const offsets = gfmEscapeOffsets(raw);
  if (offsets.length === 0) {
    return raw;
  }
  let result = "";
  let cursor = 0;
  for (const offset of offsets) {
    result += raw.slice(cursor, offset);
    cursor = offset + 1;
  }
  return result + raw.slice(cursor);
}

// Keep these unit boundaries deliberately aligned with decodeString's public
// grammar. The decoder remains the authority: deriveGfmCodeBlockLanguage checks
// the concatenated unit decodes against one whole-string decode before using the
// mapping for a semantic decision.
const gfmInfoEscapeOrReference = /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;

function isGfmInfoTokenSeparator(value: string): boolean {
  return value === " " || value === "\t" || value === "\r" || value === "\n";
}

function fallbackGfmCodeBlockLanguage(rawInfoValue: string, lang: string | null): GfmCodeBlockLanguage | null {
  const match = /[ \t\r\n]*([^ \t\r\n]+)/.exec(rawInfoValue);
  if (!match?.[1] || match.index === undefined || lang === null) {
    return null;
  }
  const from = match.index + match[0].indexOf(match[1]);
  // A failed self-check must degrade to today's two independent projections,
  // rather than inventing a new semantic answer: mdast's decoded `lang` stays
  // authoritative for the id, while the first raw token remains the only safe
  // source span for the label. With no mdast language there is no id to expose.
  return { id: lang, span: { from, to: from + match[1].length } };
}

function deriveGfmCodeBlockLanguage(rawInfoValue: string, lang: string | null): GfmCodeBlockLanguage | null {
  const decodedParts: string[] = [];
  let token = "";
  let tokenFrom: number | null = null;
  let tokenTo = 0;
  let foundToken = false;
  let rawCursor = 0;

  const consumeUnit = (rawUnit: string, from: number, to: number): void => {
    const decodedUnit = decodeString(rawUnit);
    decodedParts.push(decodedUnit);
    for (let index = 0; index < decodedUnit.length; index += 1) {
      const character = decodedUnit[index]!;
      if (isGfmInfoTokenSeparator(character)) {
        if (tokenFrom !== null) {
          foundToken = true;
        }
        continue;
      }
      if (!foundToken) {
        if (tokenFrom === null) {
          tokenFrom = from;
        }
        token += character;
        tokenTo = to;
      }
    }
  };

  for (const match of rawInfoValue.matchAll(gfmInfoEscapeOrReference)) {
    const matchFrom = match.index!;
    for (let index = rawCursor; index < matchFrom; index += 1) {
      consumeUnit(rawInfoValue[index]!, index, index + 1);
    }
    const rawUnit = match[0];
    consumeUnit(rawUnit, matchFrom, matchFrom + rawUnit.length);
    rawCursor = matchFrom + rawUnit.length;
  }
  for (let index = rawCursor; index < rawInfoValue.length; index += 1) {
    consumeUnit(rawInfoValue[index]!, index, index + 1);
  }

  if (decodedParts.join("") !== decodeString(rawInfoValue)) {
    return fallbackGfmCodeBlockLanguage(rawInfoValue, lang);
  }
  return tokenFrom === null ? null : { id: token, span: { from: tokenFrom, to: tokenTo } };
}

function buildGfmCodeBlock(node: Nodes, input: string, lineStarts: number[]): GfmCodeBlock {
  const range = rangeOf(node);
  const firstLine = startLineOf(node);
  const lastLine = endLineOf(node);
  const value = "value" in node && typeof (node as { value?: unknown }).value === "string" ? (node as { value: string }).value : "";

  const lineTextAt = (line: number): string => {
    const start = lineStarts[line - 1];
    const end = lineEndOffset(input, lineStarts, line);
    return input.slice(start, end);
  };

  const openLineStart = lineStarts[firstLine - 1];
  const openLineText = lineTextAt(firstLine);
  // `range.from` is mdast's fence position, after any list or blockquote
  // prefix. Looking only there preserves those prefixes for their own plugins.
  const fenceMatch = /^(\`{3,}|~{3,})(.*)$/.exec(input.slice(range.from, openLineStart + openLineText.length));

  let fenced = false;
  let openingFence: GfmRange = { from: openLineStart, to: openLineStart };
  let info: GfmRange = { from: openLineStart, to: openLineStart };
  let lang: string | null = null;
  let meta: string | null = null;
  let infoValue = "";
  let language: GfmCodeBlockLanguage | null = null;
  let closingFence: GfmRange | null = null;

  if (fenceMatch) {
    fenced = true;
    const fenceChar = fenceMatch[1][0];
    const fenceLength = fenceMatch[1].length;
    const fenceFrom = range.from;
    openingFence = { from: fenceFrom, to: fenceFrom + fenceLength };
    const infoFrom = openingFence.to;
    const infoTo = openLineStart + openLineText.length;
    info = { from: infoFrom, to: infoTo };
    // Keep the info string RAW (untrimmed) so a regex match index maps straight
    // back onto the source offset; consumers trim it when they need the bare value.
    // mdast decides the semantic info fields. The raw spelling is kept only
    // for source-offset presentation such as the language-label decoration.
    lang = "lang" in node && typeof (node as { lang?: unknown }).lang === "string" ? (node as { lang: string }).lang : null;
    meta = "meta" in node && typeof (node as { meta?: unknown }).meta === "string" ? (node as { meta: string }).meta : null;
    infoValue = fenceMatch[2];
    const derivedLanguage = deriveGfmCodeBlockLanguage(infoValue, lang);
    language = derivedLanguage && {
      ...derivedLanguage,
      span: {
        from: info.from + derivedLanguage.span.from,
        to: info.from + derivedLanguage.span.to,
      },
    };

    // Ask mdast whether the last physical line is a closing fence before locating
    // its source range. Comparing the opening and closing container prefixes was
    // rejected: blockquote whitespace is intentionally flexible, and list
    // indentation is not a stable string prefix. A non-empty `value` has one
    // source line per split line; therefore a candidate on its last value line is
    // content, while a later candidate is the fence mdast excluded from `value`.
    // Treat an empty value as zero lines so an empty fenced block still closes.
    const valueLineCount = value === "" ? 0 : value.split("\n").length;
    const mdastExcludesLastLineFromValue = lastLine > firstLine + valueLineCount;

    // mdast has already validated container prefixes and the maximum three-space
    // closing indentation. The raw scan only recovers the exact fence offsets;
    // it must not make a second, looser prefix decision that can hide source text.
    if (lastLine > firstLine) {
      const closeLineText = lineTextAt(lastLine);
      const closeMatch = /(`{3,}|~{3,})\s*$/.exec(closeLineText);
      if (mdastExcludesLastLineFromValue && closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLength) {
        const closeFrom = lineStarts[lastLine - 1] + closeMatch.index;
        closingFence = { from: closeFrom, to: closeFrom + closeMatch[1].length };
      }
    }
  }

  // `content` is deliberately the contiguous raw interior, not a claim that
  // it spells `value`: mdast strips container prefixes and fence indentation.
  const contentFrom = fenced ? (firstLine < lastLine ? lineStarts[firstLine] : openingFence.to) : range.from;
  const contentTo = fenced && closingFence ? closingFence.from : range.to;
  const content: GfmRange = { from: contentFrom, to: contentTo };
  const contentSegments = buildGfmCodeBlockContentSegments(
    value,
    fenced ? firstLine + 1 : firstLine,
    fenced && closingFence ? lastLine - 1 : lastLine,
    input,
    lineStarts,
  );

  return { from: range.from, to: range.to, firstLine, lastLine, fenced, openingFence, info, lang, meta, infoValue, language, content, contentSegments, value, closingFence };
}

function buildGfmCodeBlockContentSegments(
  value: string,
  firstContentLine: number,
  lastContentLine: number,
  input: string,
  lineStarts: number[],
): GfmCodeBlockContentSegment[] {
  const valueLines = value.split("\n");
  if (value === "") {
    return [];
  }
  const segments: GfmCodeBlockContentSegment[] = [];
  for (let index = 0; index < valueLines.length; index += 1) {
    const text = valueLines[index];
    const line = firstContentLine + index;
    if (line > lastContentLine) {
      continue;
    }
    const lineStart = lineStarts[line - 1];
    const lineEnd = lineEndOffset(input, lineStarts, line);
    const rawLine = input.slice(lineStart, lineEnd);
    // A fenced-code value line is the suffix after micromark has removed the
    // container prefix and up to the opening fence's indentation.
    const from = lineStart + rawLine.length - text.length;
    segments.push({ from, to: from + text.length, text });
  }
  return segments;
}

// GFM table rows split on unescaped `|` separators; cells are the padding+content
// runs between them (leading/trailing separators are optional), and `content` is
// the trimmed inner range. This intentionally differs from mbox: the only shared
// piece is `findPipeOffsets`, its UTF-16 raw-pipe scanner. GFM defines `\|` as a
// literal cell pipe before inline parsing, so the same rule applies in code spans.
function parseGfmTableRow(text: string, offset: number): GfmTableRow {
  const pipeIndexes = findUnescapedPipeOffsets(text);
  const startsWithPipe = pipeIndexes.includes(text.length - text.trimStart().length);
  const endsWithPipe = pipeIndexes.includes(text.trimEnd().length - 1);
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

// GFM table rows split before inline parsing: a pipe is a separator only when
// it is not escaped. `isEscaped` owns the shared backslash-run parity rule;
// `findPipeOffsets` remains the shared raw scanner.
function findUnescapedPipeOffsets(text: string): number[] {
  return findPipeOffsets(text).filter((pipeOffset) => !isEscaped(text, pipeOffset));
}

function hasUsableGfmTableCell(text: string): boolean {
  const pipeIndexes = findUnescapedPipeOffsets(text);
  const firstContentOffset = text.length - text.trimStart().length;
  const lastContentOffset = text.trimEnd().length - 1;
  return !(pipeIndexes.includes(firstContentOffset) && pipeIndexes.includes(lastContentOffset) && firstContentOffset === lastContentOffset);
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
    const lineEnd = lineEndOffset(context.input, lineStarts, line);
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
    if (input[index] === "\r") {
      if (input[index + 1] === "\n") index += 1;
      starts.push(index + 1);
    } else if (input[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

/** End of a physical line, excluding LF, CRLF, or standalone CR. */
function lineEndOffset(input: string, lineStarts: number[], line: number): number {
  const nextLineStart = lineStarts[line];
  if (nextLineStart == null) {
    return input.length;
  }
  return nextLineStart - (input[nextLineStart - 2] === "\r" ? 2 : 1);
}

// Per-traversal extensions of WalkContext: `orderedList` is passed only from a
// list to its immediate items, while `inTableCell` and `inFootnoteDefinition`
// are inherited throughout their respective subtrees.
interface WalkContext {
  orderedList?: boolean;
  /**
   * Carries table-cell scope onto collected link/image records so their plugins
   * can choose table-safe rendering (for example, forcing image tokens). This
   * avoids silently restoring unsafe previews if table-specific UI is only
   * partially implemented, unlike suppressing collection at this boundary.
   */
  inTableCell?: boolean;
  /** Paragraph phrasing within a footnote stays literal for backtick math. */
  inFootnoteDefinition?: boolean;
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
    inlineMath: [],
    links: [],
    images: [],
    tables: [],
    thematicBreaks: [],
    hardBreaks: [],
    escapes: [],
    footnoteReferences: [],
    footnoteDefinitions: [],
  };
  const lineStarts = lineStartOffsets(input);
  const protectedRanges: ProtectedRange[] = [];
  walk(tree, { input, document, listDepth: 0, blockquoteDepth: 0, lineStarts, protectedRanges });
  protectedRanges.push(...collectRawHtmlElementRanges(input));
  collectBareDollarMath(document, input, lineStarts, protectedRanges);
  applyTableMathRanges(document, input);
  return document;
}

/** @internal Collect raw HTML ranges excluded from bare-dollar math scanning. */
export function collectRawHtmlElementRanges(input: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  const tags = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/g;
  const openings: Array<{ name: string; from: number; to: number; closed: boolean }> = [];
  const openingsByName = new Map<string, number[]>();
  for (let match = tags.exec(input); match; match = tags.exec(input)) {
    const raw = match[0];
    const from = match.index;
    const to = from + raw.length;
    if (raw.startsWith("<!--")) {
      ranges.push({ from, to });
      continue;
    }
    const name = match[1].toLowerCase();
    if (raw.startsWith("</")) {
      const indexes = openingsByName.get(name);
      const index = indexes?.pop();
      if (index !== undefined) {
        const opening = openings[index];
        opening.closed = true;
        ranges.push({ from: opening.from, to });
      }
    } else if (raw.endsWith("/>")) {
      ranges.push({ from, to });
    } else {
      const index = openings.length;
      openings.push({ name, from, to, closed: false });
      const indexes = openingsByName.get(name);
      if (indexes) indexes.push(index);
      else openingsByName.set(name, [index]);
    }
  }
  // An unclosed raw tag still protects its node itself; its following prose is
  // ordinary Markdown and must remain eligible for math.
  ranges.push(...openings.filter((opening) => !opening.closed).map(({ from, to }) => ({ from, to })));
  return ranges;
}

// Table parsing projects mdast children before the bare-dollar scanner runs.
// Apply the collected ranges afterwards, scoped by each cell's source offsets;
// this is deliberately range-based, never a document-wide string replacement.
function applyTableMathRanges(document: GfmDocument, input: string): void {
  for (const table of document.tables) {
    for (const row of [table.header, ...table.rows]) {
      for (const cell of row.cells) {
        const segments = tableDisplaySegments.get(cell);
        if (!segments) continue;
        const mathRanges = document.inlineMath.filter((math) =>
          math.display === "inline" && cell.content.from <= math.from && math.to <= cell.content.to,
        );
        cell.displayValue = segments.map((segment) => projectTableSegmentMath(segment, mathRanges)).join("");
      }
    }
  }
}

function projectTableSegmentMath(segment: ProjectedTableSegment, mathRanges: readonly GfmInlineMath[]): string {
  const contained = mathRanges.filter((math) => segment.from <= math.from && math.to <= segment.to);
  if (contained.length === 0) return segment.text;
  // A syntax-specific projection (such as `$` + inlineCode + `$`) spans the
  // whole math range and is already normalized; its exact source range is the
  // identity that chooses this occurrence, never its string value.
  if (!segment.projectSourceSlice) {
    return contained.length === 1 && contained[0].from === segment.from && contained[0].to === segment.to
      ? contained[0].expression
      : segment.text;
  }
  let cursor = segment.from;
  let display = "";
  for (const math of contained) {
    display += segment.projectSourceSlice(cursor, math.from);
    display += math.expression;
    cursor = math.to;
  }
  return display + segment.projectSourceSlice(cursor, segment.to);
}

/** @internal Range excluded from bare-dollar math scanning; not a package export. */
export interface ProtectedRange { from: number; to: number; }

/**
 * GitHub's dollar math extension is deliberately scanned after mdast has
 * collected literal/widget syntax.  Markdown itself has no math nodes, so a
 * raw scan is unavoidable; collecting these ranges first makes the scanner
 * monotonic instead of trying to repair false positives after the fact.
 */
function collectBareDollarMath(
  document: GfmDocument,
  input: string,
  lineStarts: number[],
  walkerProtectedRanges: ProtectedRange[],
): void {
  const protectedRanges: ProtectedRange[] = [
    ...document.inlineCodes.map((code) => ({ from: code.open.from, to: code.close.to })),
    ...document.codeBlocks.map((block) => ({ from: block.from, to: block.to })),
    ...document.links.map(({ from, to }) => ({ from, to })),
    ...document.images.map(({ from, to }) => ({ from, to })),
    // An escape protects both the slash and the escaped punctuation character.
    ...document.escapes.map(({ from, to }) => ({ from, to: Math.min(input.length, to + 1) })),
    // An escape protects both the slash and the escaped punctuation character.
    ...document.inlineMath.map(({ from, to }) => ({ from, to })),
    ...walkerProtectedRanges,
  ];
  protectedRanges.sort((left, right) => left.from - right.from || left.to - right.to);
  const mergedProtectedRanges: ProtectedRange[] = [];
  for (const range of protectedRanges) {
    const previous = mergedProtectedRanges[mergedProtectedRanges.length - 1];
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else mergedProtectedRanges.push({ ...range });
  }
  protectedRanges.splice(0, protectedRanges.length, ...mergedProtectedRanges);
  const protectedRangeIntersects = (from: number, to: number) =>
    intersectsProtected(protectedRanges, from, to);

  let openAfterConsumedSingleDollar = -1;
  for (let open = 0; open < input.length; open += 1) {
    if (input[open] !== "$" || isEscaped(input, open) || protectedRangeIntersects(open, open + 1)) continue;
    // A physical dollar run is considered only at its first character. The
    // sole exception is `$x$$x$`: accepting the first middle dollar as a
    // closer consumes it, so the second is now the next expression's opener.
    if (input[open - 1] === "$" && open !== openAfterConsumedSingleDollar) continue;
    const delimiterLength = input[open + 1] === "$" ? 2 : 1;
    // A longer run is neither of GitHub's delimiter forms.
    if (input[open + delimiterLength] === "$") continue;
    const close = findDollarClose(input, open, delimiterLength, protectedRangeIntersects);
    if (close === -1) continue;
    const to = close + delimiterLength;
    const rawExpression = input.slice(open + delimiterLength, close);
    const expression = delimiterLength === 2
      ? removeDollarBlockBoundaryNewlines(rawExpression)
      : rawExpression;
    const crossesLine = expression.includes("\n") || expression.includes("\r");
    if (delimiterLength === 1 && crossesLine) continue;
    if (delimiterLength === 1 && (expression.length === 0 || /^\s/.test(expression) || /\s$/.test(expression))) continue;
    // GitHub lets ordinary Markdown consume paired emphasis before its math
    // extension sees it (`$a*b*c$` -> `$a<em>b</em>c$`), so an overlapping
    // style usually kills the math. But not every overlap: measured against
    // the public Markdown API over thirty inputs, an `<em>` ANYWHERE in the
    // ancestry stops the math, while `<strong>` and `<del>` do not, at any
    // nesting depth.
    //
    //   `**$K$**`, `__$K$__`, `~~$K$~~`   math
    //   `*$K$*`, `_$K$_`, `***$K$***`     not math
    //   `*a **$K$** b*`                   not math -- em outside the strong
    //   `**a *$M$* b**`                   not math
    //   `*x* $K$`                         math -- the em is a sibling, not an ancestor
    //   `****$K$****`                     math
    //   `**~~__$K$__~~**`                 math -- three layers, none of them em
    //   `**~~_$K$_~~**`                   not math -- the innermost layer is em
    //
    // A LINK LABEL suppresses it outright, whatever the emphasis:
    // `[**$K$**](url)` is not math on GitHub, and is not here either -- but by
    // a different mechanism (the link's range is protected before this runs),
    // not by the rule below. The oracle covers both spellings.
    //
    // So the test is structural, not textual: a style that CONTAINS the whole
    // run and is strong or delete stands aside; anything else -- a style that
    // only crosses the run, a style INSIDE it (`$a*b*c$`), or a containing
    // emphasis -- still blocks. Nesting needs no special case: an ancestor
    // emphasis shows up here as its own containing overlap.
    if (delimiterLength === 1 && document.inlineStyles.some((style) => overlapBlocksDollarMath(style, open, to))) continue;
    if (isAsciiAlphaNumeric(input[open - 1]) || isAsciiAlphaNumeric(input[to])) continue;
    // GitHub's math extension does not activate a dollar run on a list item's
    // marker line (verified with both tight and loose list fixtures).
    if (delimiterLength === 2 && isOnListMarkerLine(input, open)) continue;

    const display = delimiterLength === 2 && isDollarBlock(input, open, to) ? "block" : "inline";
    if (display === "inline" && crossesLine) continue;
    const tableCell = findContainingTableCell(document.tables, open, to);
    document.inlineMath.push({
      from: open,
      to,
      expression,
      delimiter: "dollar",
      display,
      startLine: lineAtOffset(lineStarts, open),
      endLine: lineAtOffset(lineStarts, to - 1),
      inTableCell: tableCell,
    });
    // `open` advances past the accepted close below, so later candidates
    // cannot overlap this range; keep the searched protection index immutable.
    openAfterConsumedSingleDollar = delimiterLength === 1 ? to : -1;
    open = to - 1;
  }
  document.inlineMath.sort((left, right) => left.from - right.from || left.to - right.to);
}

/**
 * A `$$` block's delimiters each own one immediately adjacent line break, the
 * same way a fenced math block exposes only its interior value. Deliberately
 * do not trim spaces or additional blank lines: those have no verified GitHub
 * behavior and belong to the expression.
 */
function removeDollarBlockBoundaryNewlines(expression: string): string {
  const withoutOpeningNewline = expression.replace(/^(?:\r\n|\n|\r)/, "");
  return withoutOpeningNewline.replace(/(?:\r\n|\n|\r)$/, "");
}

function findDollarClose(
  input: string,
  open: number,
  delimiterLength: number,
  intersectsProtected: (from: number, to: number) => boolean,
): number {
  for (let cursor = open + delimiterLength; cursor < input.length; cursor += 1) {
    if (input[cursor] !== "$" || isEscaped(input, cursor) || intersectsProtected(cursor, cursor + delimiterLength)) continue;
    if (input.slice(cursor, cursor + delimiterLength) !== "$".repeat(delimiterLength)) continue;
    // For `$x$$x$`, the first dollar in the middle run closes the first
    // expression and the second opens the next. Runs of three or more are
    // never delimiters at any position, while a `$$` delimiter must be exactly
    // two characters long.
    if (delimiterLength === 2 && (input[cursor - 1] === "$" || input[cursor + delimiterLength] === "$")) continue;
    if (delimiterLength === 1 && isInDollarRunOfAtLeastThree(input, cursor)) continue;
    return cursor;
  }
  return -1;
}

function isInDollarRunOfAtLeastThree(input: string, offset: number): boolean {
  return (
    (input[offset - 2] === "$" && input[offset - 1] === "$") ||
    (input[offset - 1] === "$" && input[offset + 1] === "$") ||
    (input[offset + 1] === "$" && input[offset + 2] === "$")
  );
}

function isAsciiAlphaNumeric(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9]/.test(character);
}

/** @internal Return the one-based physical line containing an input offset. */
export function lineAtOffset(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** @internal Testable binary-search predicate for sorted, merged protected ranges. */
/**
 * Whether this inline style stops a `$…$` run from being math.
 *
 * See the call site for the measurements. In short: only a strong or delete
 * span that wholly contains the run lets it through.
 */
function overlapBlocksDollarMath(style: GfmInlineStyle, from: number, to: number): boolean {
  const overlaps = from < style.close.to && style.open.from < to;
  if (!overlaps) return false;
  const contains = style.content.from <= from && to <= style.content.to;
  return !(contains && (style.type === "strong" || style.type === "delete"));
}

export function intersectsProtected(
  protectedRanges: readonly ProtectedRange[],
  from: number,
  to: number,
): boolean {
  // Dollar candidates are considered in source order. A binary search keeps
  // the protected-range check sublinear even when parsing produces one range
  // per input token, avoiding the former candidate × range quadratic path.
  let low = 0;
  let high = protectedRanges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (protectedRanges[middle].to <= from) low = middle + 1;
    else high = middle;
  }
  return low < protectedRanges.length && protectedRanges[low].from < to;
}

function isDollarBlock(input: string, from: number, to: number): boolean {
  const lineStart = physicalLineStart(input, from);
  const lineEnd = physicalLineEnd(input, to);
  const before = input.slice(lineStart, from);
  const after = input.slice(to, lineEnd);
  // Quote prefixes are structural context, but list markers are content here:
  // GitHub leaves list-item dollar runs literal (verified 2026-07-27).
  const quotePrefix = /^(?:[ \t]*>[ \t]*)*$/;
  return quotePrefix.test(before) && /^[ \t]*$/.test(after);
}

function isOnListMarkerLine(input: string, offset: number): boolean {
  const lineStart = physicalLineStart(input, offset);
  return /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/.test(input.slice(lineStart, offset));
}

function physicalLineStart(input: string, offset: number): number {
  return Math.max(input.lastIndexOf("\n", offset - 1), input.lastIndexOf("\r", offset - 1)) + 1;
}

function physicalLineEnd(input: string, offset: number): number {
  const cr = input.indexOf("\r", offset);
  const lf = input.indexOf("\n", offset);
  if (cr === -1) return lf === -1 ? input.length : lf;
  if (lf === -1) return cr;
  return Math.min(cr, lf);
}

function findContainingTableCell(tables: GfmTable[], from: number, to: number): boolean {
  return tables.some((table) => [table.header, ...table.rows].some((row) =>
    row.cells.some((cell) => cell.content.from <= from && to <= cell.content.to),
  ));
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
