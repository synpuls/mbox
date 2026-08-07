import { parseScrapboxLineInline, type ScrapboxInlineNode } from "./inline.js";
import { createLogicalLines } from "../logical-lines.js";

export interface ScrapboxRange {
  from: number;
  to: number;
}

export type ScrapboxListType = "none" | "bullet" | "number";

export interface ScrapboxLine {
  line: number;
  /** Raw input end, including a CR in a CRLF terminator. */
  from: number;
  to: number;
  /** Syntax-facing end; excludes only the CR in a CRLF terminator. */
  logicalTo: number;
  indent: number;
  listType: ScrapboxListType;
  marker: ScrapboxRange;
  content: ScrapboxRange;
  number: number | null;
  numberMarker: ScrapboxRange | null;
  /**
   * Inline nodes parsed once at document-parse time and shared across every
   * inline provider (link / decoration / image / formula), the way mbox and
   * hatena already bake inline into their documents. Empty on code-block lines,
   * which stay fully literal.
   */
  inline: ScrapboxInlineNode[];
}

export interface ScrapboxCodeBlock {
  type: "codeBlock";
  /** `code:tex` and `code:latex` are Cosense formula blocks, not code cards. */
  kind: "code" | "formula";
  indent: number;
  fileName: string;
  openerLine: ScrapboxLine;
  bodyLines: ScrapboxLine[];
}

export interface ScrapboxTableBlock {
  type: "table";
  indent: number;
  name: string;
  openerLine: ScrapboxLine;
  bodyLines: ScrapboxLine[];
}

export interface ScrapboxDocument {
  lines: ScrapboxLine[];
  codeBlocks: ScrapboxCodeBlock[];
  tableBlocks: ScrapboxTableBlock[];
}

const leadingWhitespaceRegExp = /^\s+/;
const tableBlockPrefix = "table:";
const numberListRegExp = /^(\d+)\. /;
const codeBlockPrefix = "code:";

/**
 * Parse Scrapbox notation text into a flat, line-oriented document model.
 *
 * Indentation follows Scrapbox semantics: the depth is the number of leading
 * whitespace characters (single-byte space, double-byte space and tab each
 * count as one level). A number list is a line whose content begins with
 * `N. `; any other indented line is a bullet, even when there is no content
 * after the leading whitespace.
 */
export function parseScrapboxDocument(input: string): ScrapboxDocument {
  const geometry = createLogicalLines(input);
  const lines: ScrapboxLine[] = [];

  for (const cell of geometry) {
    const { text, from, to, logicalTo } = cell;

    const indent = leadingWhitespaceRegExp.exec(text)?.[0].length ?? 0;
    const contentFrom = from + indent;
    const content: ScrapboxRange = { from: contentFrom, to: logicalTo };
    const contentText = text.slice(indent);
    const numberMatch = numberListRegExp.exec(contentText);

    let listType: ScrapboxListType = "none";
    let number: number | null = null;
    let numberMarker: ScrapboxRange | null = null;

    if (numberMatch) {
      listType = "number";
      number = Number.parseInt(numberMatch[1], 10);
      numberMarker = { from: contentFrom, to: contentFrom + numberMatch[0].length };
    } else if (indent >= 1) {
      // A leading space is itself a list item, even with no content after it.
      listType = "bullet";
    }

    lines.push({
      line: cell.line,
      from,
      to,
      logicalTo,
      indent,
      listType,
      marker: { from, to: contentFrom },
      content,
      number,
      numberMarker,
      inline: [],
    });

  }

  const { codeBlocks, tableBlocks } = detectBlocks(input, lines);

  // Bake each line's inline nodes into the document so every inline provider
  // (link / decoration / image / formula) reads `line.inline` instead of
  // re-parsing the line. The block-level parse is already shared through the
  // document cache; this makes the inline parse shared too, instead of running
  // once per provider. Only CODE-block lines stay fully literal (empty inline).
  // Table cells retain inline nodes because mbox renders page and external
  // links there, while individual providers leave table syntax that would break
  // the cell grid, such as images and formulas, raw.
  const literalLineNumbers = blockLineNumbers(codeBlocks);
  for (const line of lines) {
    if (!literalLineNumbers.has(line.line)) {
      line.inline = parseScrapboxLineInline(input, line);
    }
  }

  return { lines, codeBlocks, tableBlocks };
}

/**
 * Group `code:filename` and `table:name` opener lines with the more-indented
 * body lines that follow, mirroring Scrapbox's packing rule
 * (`row.indent > opener.indent`).
 */
function detectBlocks(
  input: string,
  lines: ScrapboxLine[],
): { codeBlocks: ScrapboxCodeBlock[]; tableBlocks: ScrapboxTableBlock[] } {
  const codeBlocks: ScrapboxCodeBlock[] = [];
  const tableBlocks: ScrapboxTableBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const openerLine = lines[index];
    const contentText = input.slice(openerLine.content.from, openerLine.logicalTo);
    const isCode = contentText.startsWith(codeBlockPrefix);
    const isTable = contentText.startsWith(tableBlockPrefix);
    if (!isCode && !isTable) {
      index += 1;
      continue;
    }

    const bodyLines: ScrapboxLine[] = [];
    let next = index + 1;
    while (next < lines.length && lines[next].indent > openerLine.indent) {
      bodyLines.push(lines[next]);
      next += 1;
    }

    if (isCode) {
      codeBlocks.push({
        type: "codeBlock",
        kind: contentText.slice(codeBlockPrefix.length) === "tex" || contentText.slice(codeBlockPrefix.length) === "latex" ? "formula" : "code",
        indent: openerLine.indent,
        fileName: contentText.slice(codeBlockPrefix.length),
        openerLine,
        bodyLines,
      });
    } else {
      tableBlocks.push({
        type: "table",
        indent: openerLine.indent,
        name: contentText.slice(tableBlockPrefix.length),
        openerLine,
        bodyLines,
      });
    }
    index = next;
  }

  return { codeBlocks, tableBlocks };
}

function blockLineNumbers(blocks: { openerLine: ScrapboxLine; bodyLines: ScrapboxLine[] }[]): Set<number> {
  const lineNumbers = new Set<number>();
  for (const block of blocks) {
    lineNumbers.add(block.openerLine.line);
    for (const body of block.bodyLines) {
      lineNumbers.add(body.line);
    }
  }
  return lineNumbers;
}

/**
 * The set of 1-based line numbers occupied by any code block (opener + body).
 * Other plugins use this to leave code-block content untouched.
 */
export function scrapboxCodeBlockLineNumbers(document: ScrapboxDocument): Set<number> {
  return blockLineNumbers(document.codeBlocks);
}

/** The 1-based line numbers occupied by any table block (opener + body). */
export function scrapboxTableBlockLineNumbers(document: ScrapboxDocument): Set<number> {
  return blockLineNumbers(document.tableBlocks);
}
