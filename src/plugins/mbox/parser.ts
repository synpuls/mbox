import type {
  MboxBlock,
  MboxBlockParser,
  MboxDocument,
  MboxInlineNode,
  MboxTableRow,
} from "./types.js";

export function parseMboxDocument(input: string): MboxDocument {
  if (input.length === 0) {
    return { blocks: [] };
  }

  const blocks: MboxBlock[] = [];
  const blockParsers = [parseCodeBlockAt, parseTableAt];
  const lineStarts: number[] = [];
  const lines = input.split("\n");

  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index];
    offset = lineStarts[index];

    const customBlock = parseBlockWithParsers(blockParsers, input, lines, lineStarts, index);
    if (customBlock) {
      blocks.push(customBlock.block);
      index = customBlock.nextLineIndex;
      continue;
    }

    blocks.push(parseLine(text, offset, index + 1));
  }

  return {
    blocks,
  };
}

function parseBlockWithParsers(
  blockParsers: MboxBlockParser[],
  input: string,
  lines: string[],
  lineStarts: number[],
  lineIndex: number,
) {
  for (const blockParser of blockParsers) {
    const result = blockParser({ input, lines, lineStarts, lineIndex });
    if (result) {
      return result;
    }
  }

  return null;
}

const parseCodeBlockAt: MboxBlockParser = ({ input, lines, lineStarts, lineIndex: openingIndex }) => {
  const openingText = lines[openingIndex];
  if (!isCodeFenceLine(openingText)) {
    return null;
  }

  const openingFrom = lineStarts[openingIndex];
  const openingTo = openingFrom + openingText.length;
  const contentFrom = openingTo < input.length ? openingTo + 1 : openingTo;
  let closingIndex = -1;

  for (let index = openingIndex + 1; index < lines.length; index += 1) {
    if (isClosingCodeFenceLine(lines[index])) {
      closingIndex = index;
      break;
    }
  }

  const closingFence =
    closingIndex >= 0
      ? {
          from: lineStarts[closingIndex],
          to: lineStarts[closingIndex] + lines[closingIndex].length,
        }
      : null;
  const contentTo = closingFence?.from ?? input.length;

  return {
    block: {
      type: "codeBlock",
      from: openingFrom,
      to: closingFence?.to ?? input.length,
      line: openingIndex + 1,
      openingFence: {
        from: openingFrom,
        to: openingTo,
      },
      info: {
        from: openingFrom + 3,
        to: openingTo,
      },
      infoValue: input.slice(openingFrom + 3, openingTo),
      content: {
        from: contentFrom,
        to: contentTo,
      },
      closingFence,
      value: input.slice(contentFrom, contentTo),
    },
    nextLineIndex: closingIndex >= 0 ? closingIndex : lines.length,
  };
};

function isCodeFenceLine(text: string): boolean {
  return text.startsWith("```");
}

function isClosingCodeFenceLine(text: string): boolean {
  return /^```\s*$/.test(text);
}

const parseTableAt: MboxBlockParser = ({ lines, lineStarts, lineIndex }) => {
  const headerText = lines[lineIndex];
  const delimiterText = lines[lineIndex + 1];
  if (delimiterText == null || !isTableRowLine(headerText) || !isTableDelimiterLine(delimiterText)) {
    return null;
  }

  const header = parseTableRow(headerText, lineStarts[lineIndex]);
  if (!header || header.cells.length === 0) {
    return null;
  }

  const delimiter = parseTableDelimiter(delimiterText, lineStarts[lineIndex + 1]);
  if (!delimiter || delimiter.cells.length !== header.cells.length) {
    return null;
  }

  const rows: MboxTableRow[] = [];
  let lastLineIndex = lineIndex + 1;
  for (let index = lineIndex + 2; index < lines.length; index += 1) {
    if (!isTableRowLine(lines[index])) {
      break;
    }

    const row = parseTableRow(lines[index], lineStarts[index]);
    if (!row) {
      break;
    }

    rows.push(row);
    lastLineIndex = index;
  }

  return {
    block: {
      type: "table",
      from: lineStarts[lineIndex],
      to: lineStarts[lastLineIndex] + lines[lastLineIndex].length,
      line: lineIndex + 1,
      header,
      delimiter,
      rows,
    },
    nextLineIndex: lastLineIndex,
  };
};

function isTableRowLine(text: string): boolean {
  return text.includes("|") && text.trim().length > 0;
}

function isTableDelimiterLine(text: string): boolean {
  const row = parseTableRow(text, 0);
  return Boolean(row && row.cells.length > 0 && row.cells.every((cell) => /^:?-{3,}:?$/.test(cell.value)));
}

function parseTableDelimiter(text: string, offset: number): MboxTableRow | null {
  const row = parseTableRow(text, offset);
  return row && row.cells.length > 0 && row.cells.every((cell) => /^:?-{3,}:?$/.test(cell.value)) ? row : null;
}

function parseTableRow(text: string, offset: number): MboxTableRow | null {
  const pipeIndexes = [...text].flatMap((character, index) => (character === "|" ? [index] : []));
  if (pipeIndexes.length === 0) {
    return null;
  }

  const startsWithPipe = text.trimStart().startsWith("|");
  const endsWithPipe = text.trimEnd().endsWith("|");
  const boundaries = [
    startsWithPipe ? pipeIndexes[0] : -1,
    ...pipeIndexes.slice(startsWithPipe ? 1 : 0, endsWithPipe ? -1 : undefined),
    endsWithPipe ? pipeIndexes[pipeIndexes.length - 1] : text.length,
  ];

  const cells = [];
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
      content: {
        from: offset + contentFrom,
        to: offset + contentTo,
      },
      value: text.slice(contentFrom, contentTo),
    });
  }

  return {
    from: offset,
    to: offset + text.length,
    cells,
  };
}

function parseLine(text: string, offset: number, line: number): MboxBlock {
  const heading = /^(#{1,6})(\s+)(?=\S)/.exec(text);
  if (heading) {
    const markerLength = heading[1].length;
    const contentFrom = offset + heading[0].length;

    return {
      type: "heading",
      from: offset,
      to: offset + text.length,
      line,
      level: markerLength,
      marker: {
        from: offset,
        to: offset + markerLength,
      },
      syntax: {
        from: offset,
        to: contentFrom,
      },
      content: {
        from: contentFrom,
        to: offset + text.length,
      },
      inline: parseInline(text, contentFrom - offset, offset),
    };
  }

  const emptyHeading = /^(#{1,6})(\s+)$/.exec(text);
  if (emptyHeading) {
    const markerLength = emptyHeading[1].length;
    const lineEnd = offset + text.length;

    return {
      type: "heading",
      from: offset,
      to: lineEnd,
      line,
      level: markerLength,
      marker: {
        from: offset,
        to: offset + markerLength,
      },
      syntax: {
        from: offset,
        to: lineEnd,
      },
      content: {
        from: lineEnd,
        to: lineEnd,
      },
      inline: [],
    };
  }

  const taskListItem = /^(\s*)-(\s+)\[([ xX])\]\s+(?=\S)/.exec(text);
  if (taskListItem) {
    const leadingSpaces = taskListItem[1].length;
    const markerFrom = offset + leadingSpaces;
    const checkboxFrom = markerFrom + 1 + taskListItem[2].length;
    const contentFrom = offset + taskListItem[0].length;

    return {
      type: "taskListItem",
      from: offset,
      to: offset + text.length,
      line,
      depth: leadingSpaces,
      checked: taskListItem[3].toLowerCase() === "x",
      marker: {
        from: markerFrom,
        to: markerFrom + 1,
      },
      checkbox: {
        from: checkboxFrom,
        to: checkboxFrom + 3,
      },
      syntax: {
        from: markerFrom,
        to: contentFrom,
      },
      content: {
        from: contentFrom,
        to: offset + text.length,
      },
      inline: parseInline(text, taskListItem[0].length, offset),
    };
  }

  const emptyTaskListItem = /^(\s*)-(\s+)\[([ xX])\]\s*$/.exec(text);
  if (emptyTaskListItem) {
    const leadingSpaces = emptyTaskListItem[1].length;
    const markerFrom = offset + leadingSpaces;
    const checkboxFrom = markerFrom + 1 + emptyTaskListItem[2].length;
    const lineEnd = offset + text.length;

    return {
      type: "taskListItem",
      from: offset,
      to: lineEnd,
      line,
      depth: leadingSpaces,
      checked: emptyTaskListItem[3].toLowerCase() === "x",
      marker: {
        from: markerFrom,
        to: markerFrom + 1,
      },
      checkbox: {
        from: checkboxFrom,
        to: checkboxFrom + 3,
      },
      syntax: {
        from: markerFrom,
        to: lineEnd,
      },
      content: {
        from: lineEnd,
        to: lineEnd,
      },
      inline: [],
    };
  }

  const listItem = /^(\s*)-\s+(?=\S|$)/.exec(text);
  if (listItem) {
    const leadingSpaces = listItem[1].length;
    const markerFrom = offset + leadingSpaces;

    return {
      type: "listItem",
      from: offset,
      to: offset + text.length,
      line,
      depth: leadingSpaces,
      marker: {
        from: markerFrom,
        to: markerFrom + 1,
      },
      syntax: {
        from: markerFrom,
        to: offset + listItem[0].length,
      },
      content: {
        from: offset + listItem[0].length,
        to: offset + text.length,
      },
      inline: parseInline(text, listItem[0].length, offset),
    };
  }

  const quote = /^>\s+(?=\S)/.exec(text);
  if (quote) {
    const contentFrom = offset + quote[0].length;

    return {
      type: "quote",
      from: offset,
      to: offset + text.length,
      line,
      marker: {
        from: offset,
        to: offset + 1,
      },
      syntax: {
        from: offset,
        to: contentFrom,
      },
      content: {
        from: contentFrom,
        to: offset + text.length,
      },
      inline: parseInline(text, quote[0].length, offset),
    };
  }

  const footnoteDefinition = /^\[\^([^[\]]+)\]:(\s+)(?=\S)/.exec(text);
  if (footnoteDefinition) {
    const label = footnoteDefinition[1];
    const markerLength = footnoteDefinition[0].length - footnoteDefinition[2].length;
    const contentFrom = offset + footnoteDefinition[0].length;
    // Trimmed like GFM's footnote definition text: the value doubles as the
    // reference widget's tooltip, so trailing whitespace would show up there.
    const value = text.slice(footnoteDefinition[0].length).trimEnd();

    return {
      type: "footnoteDefinition",
      from: offset,
      to: offset + text.length,
      line,
      label,
      identifier: label.toLowerCase(),
      marker: {
        from: offset,
        to: offset + markerLength,
      },
      syntax: {
        from: offset,
        to: contentFrom,
      },
      content: {
        from: contentFrom,
        to: contentFrom + value.length,
      },
      value,
    };
  }

  const content = {
    from: offset,
    to: offset + text.length,
  };

  return {
    type: "paragraph",
    from: offset,
    to: offset + text.length,
    line,
    content,
    inline: parseInline(text, 0, offset),
  };
}

class InlineScanIndex {
  private nextRawOpenBrackets: Int32Array | undefined;
  private nextRawCloseBrackets: Int32Array | undefined;
  private nextRawCloseParens: Int32Array | undefined;
  private nextUnescapedCloseBrackets: Int32Array | undefined;
  private nextUnescapedCloseParens: Int32Array | undefined;
  private nextWhitespaces: Int32Array | undefined;
  private nextDots: Int32Array | undefined;
  private autoLinkRunEnds: Int32Array | undefined;

  constructor(private readonly text: string) {}

  nextRawOpenBracket(index: number): number {
    this.nextRawOpenBrackets ??= this.buildNextIndex((character) => character === "[");
    return this.nextRawOpenBrackets[index];
  }

  nextRawCloseBracket(index: number): number {
    this.nextRawCloseBrackets ??= this.buildNextIndex((character) => character === "]");
    return this.nextRawCloseBrackets[index];
  }

  nextRawCloseParen(index: number): number {
    this.nextRawCloseParens ??= this.buildNextIndex((character) => character === ")");
    return this.nextRawCloseParens[index];
  }

  nextUnescapedCloseBracket(index: number): number {
    this.nextUnescapedCloseBrackets ??= this.buildNextUnescapedIndex("]");
    return this.nextUnescapedCloseBrackets[index];
  }

  nextUnescapedCloseParen(index: number): number {
    this.nextUnescapedCloseParens ??= this.buildNextUnescapedIndex(")");
    return this.nextUnescapedCloseParens[index];
  }

  nextWhitespace(index: number): number {
    this.nextWhitespaces ??= this.buildNextIndex((character) => /\s/.test(character));
    return this.nextWhitespaces[index];
  }

  nextDot(index: number): number {
    this.nextDots ??= this.buildNextIndex((character) => character === ".");
    return this.nextDots[index];
  }

  punctuationTrimmedAutoLinkRunEnd(index: number): number {
    const whitespaceIndex = this.nextWhitespace(index);
    const runEnd = whitespaceIndex < 0 ? this.text.length : whitespaceIndex;
    this.autoLinkRunEnds ??= new Int32Array(this.text.length + 1);
    const cachedEnd = this.autoLinkRunEnds[runEnd];

    if (cachedEnd === 0) {
      let trimmedEnd = runEnd;
      while (trimmedEnd > 0 && /[.,:;!?]/.test(this.text[trimmedEnd - 1])) {
        trimmedEnd -= 1;
      }
      this.autoLinkRunEnds[runEnd] = trimmedEnd + 1;
      return trimmedEnd;
    }

    return cachedEnd - 1;
  }

  private buildNextIndex(matches: (character: string) => boolean): Int32Array {
    const nextIndices = new Int32Array(this.text.length + 1);
    let nextIndex = -1;
    nextIndices[this.text.length] = nextIndex;

    for (let index = this.text.length - 1; index >= 0; index -= 1) {
      if (matches(this.text[index])) nextIndex = index;
      nextIndices[index] = nextIndex;
    }

    return nextIndices;
  }

  private buildNextUnescapedIndex(character: "]" | ")"): Int32Array {
    const unescaped = new Uint8Array(this.text.length);
    let precedingBackslashes = 0;
    for (let index = 0; index < this.text.length; index += 1) {
      if (this.text[index] === character && precedingBackslashes % 2 === 0) unescaped[index] = 1;
      precedingBackslashes = this.text[index] === "\\" ? precedingBackslashes + 1 : 0;
    }

    const nextIndices = new Int32Array(this.text.length + 1);
    let nextIndex = -1;
    nextIndices[this.text.length] = nextIndex;
    for (let index = this.text.length - 1; index >= 0; index -= 1) {
      if (unescaped[index]) nextIndex = index;
      nextIndices[index] = nextIndex;
    }

    return nextIndices;
  }
}

function parseInline(text: string, start: number, offset: number): MboxInlineNode[] {
  if (start >= text.length) {
    return [];
  }

  const nodes: MboxInlineNode[] = [];
  let cursor = start;
  let index = start;
  let scanIndex: InlineScanIndex | undefined;
  const getScanIndex = () => (scanIndex ??= new InlineScanIndex(text));

  while (index < text.length) {
    const node = parseInlineNodeAt(text, index, offset, getScanIndex);
    if (!node) {
      index += 1;
      continue;
    }

    if (index > cursor) {
      nodes.push(createTextNode(text, cursor, index, offset));
    }
    nodes.push(node);
    cursor = node.to - offset;
    index = cursor;
  }

  if (cursor < text.length) {
    nodes.push(createTextNode(text, cursor, text.length, offset));
  }

  return nodes;
}

function parseInlineNodeAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  if (text[index] === "`") {
    return parseInlineCodeAt(text, index, offset);
  }

  if (text[index] === "*") {
    return parseStrongAt(text, index, offset) ?? parseEmphasisAt(text, index, offset);
  }

  if (text[index] === "~") {
    return parseStrikethroughAt(text, index, offset);
  }

  if (text[index] === "!") {
    return parseMarkdownImageAt(text, index, offset, getScanIndex);
  }

  if (text[index] === "[") {
    return (
      parseMarkdownLinkAt(text, index, offset, getScanIndex) ??
      parseFootnoteRefAt(text, index, offset, getScanIndex) ??
      parseIconAt(text, index, offset, getScanIndex) ??
      parseWikiLinkAt(text, index, offset, getScanIndex)
    );
  }

  if (text[index] === ":") {
    return parseEmojiAt(text, index, offset);
  }

  if (text[index] === "h") {
    return parseAutoLinkAt(text, index, offset, getScanIndex);
  }

  return null;
}

function parseInlineCodeAt(text: string, index: number, offset: number): MboxInlineNode | null {
  const closeIndex = text.indexOf("`", index + 1);
  if (closeIndex < 0 || closeIndex === index + 1) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeIndex + 1;
  const contentFrom = from + 1;
  const contentTo = offset + closeIndex;

  return {
    type: "inlineCode",
    from,
    to,
    openingMarker: {
      from,
      to: from + 1,
    },
    closingMarker: {
      from: contentTo,
      to,
    },
    content: {
      from: contentFrom,
      to: contentTo,
    },
    value: text.slice(index + 1, closeIndex),
  };
}

function parseStrongAt(text: string, index: number, offset: number): MboxInlineNode | null {
  if (!text.startsWith("**", index)) {
    return null;
  }

  return parseDelimitedInlineStyleAt(text, index, offset, "**", "strong");
}

function parseEmphasisAt(text: string, index: number, offset: number): MboxInlineNode | null {
  if (text[index + 1] === "*") {
    return null;
  }

  return parseDelimitedInlineStyleAt(text, index, offset, "*", "emphasis");
}

function parseStrikethroughAt(text: string, index: number, offset: number): MboxInlineNode | null {
  if (!text.startsWith("~~", index)) {
    return null;
  }

  return parseDelimitedInlineStyleAt(text, index, offset, "~~", "strikethrough");
}

function parseDelimitedInlineStyleAt(
  text: string,
  index: number,
  offset: number,
  marker: "*" | "**" | "~~",
  type: "emphasis" | "strong" | "strikethrough",
): MboxInlineNode | null {
  const closeIndex = text.indexOf(marker, index + marker.length);
  if (closeIndex < 0 || closeIndex === index + marker.length) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeIndex + marker.length;
  const contentFrom = from + marker.length;
  const contentTo = offset + closeIndex;

  return {
    type,
    from,
    to,
    openingMarker: {
      from,
      to: contentFrom,
    },
    closingMarker: {
      from: contentTo,
      to,
    },
    content: {
      from: contentFrom,
      to: contentTo,
    },
    value: text.slice(index + marker.length, closeIndex),
  };
}

function parseMarkdownLinkAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  const closeLabelIndex = getScanIndex().nextRawCloseBracket(index + 1);
  if (closeLabelIndex < 0 || text[closeLabelIndex + 1] !== "(") {
    return null;
  }

  const closeUrlIndex = getScanIndex().nextRawCloseParen(closeLabelIndex + 2);
  if (closeUrlIndex < 0) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeUrlIndex + 1;
  const labelFrom = from + 1;
  const labelTo = offset + closeLabelIndex;
  const urlFrom = offset + closeLabelIndex + 2;
  const urlTo = offset + closeUrlIndex;

  return {
    type: "markdownLink",
    from,
    to,
    label: {
      from: labelFrom,
      to: labelTo,
    },
    url: {
      from: urlFrom,
      to: urlTo,
    },
    markers: {
      labelOpen: {
        from,
        to: from + 1,
      },
      labelClose: {
        from: offset + closeLabelIndex,
        to: offset + closeLabelIndex + 1,
      },
      urlOpen: {
        from: offset + closeLabelIndex + 1,
        to: offset + closeLabelIndex + 2,
      },
      urlClose: {
        from: offset + closeUrlIndex,
        to: offset + closeUrlIndex + 1,
      },
    },
    labelValue: text.slice(index + 1, closeLabelIndex),
    urlValue: text.slice(closeLabelIndex + 2, closeUrlIndex),
  };
}

function parseMarkdownImageAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  if (text[index + 1] !== "[") {
    return null;
  }

  const closeLabelIndex = getScanIndex().nextUnescapedCloseBracket(index + 2);
  if (closeLabelIndex < 0 || text[closeLabelIndex + 1] !== "(") {
    return null;
  }

  const closeUrlIndex = getScanIndex().nextUnescapedCloseParen(closeLabelIndex + 2);
  if (closeUrlIndex < 0) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeUrlIndex + 1;
  const altFrom = from + 2;
  const altTo = offset + closeLabelIndex;
  const destinationStartIndex = closeLabelIndex + 2;
  const destinationEndIndex = imageDestinationEndIndex(text, destinationStartIndex, closeUrlIndex);
  const urlFrom = offset + destinationStartIndex;
  const urlTo = offset + destinationEndIndex;

  return {
    type: "markdownImage",
    from,
    to,
    alt: {
      from: altFrom,
      to: altTo,
    },
    url: {
      from: urlFrom,
      to: urlTo,
    },
    markers: {
      image: {
        from,
        to: from + 1,
      },
      labelOpen: {
        from: from + 1,
        to: from + 2,
      },
      labelClose: {
        from: offset + closeLabelIndex,
        to: offset + closeLabelIndex + 1,
      },
      urlOpen: {
        from: offset + closeLabelIndex + 1,
        to: offset + closeLabelIndex + 2,
      },
      urlClose: {
        from: offset + closeUrlIndex,
        to: offset + closeUrlIndex + 1,
      },
    },
    altValue: unescapeMarkdownInlineValue(text.slice(index + 2, closeLabelIndex)),
    urlValue: unescapeMarkdownInlineValue(text.slice(destinationStartIndex, destinationEndIndex)),
  };
}

function unescapeMarkdownInlineValue(value: string): string {
  return value.replace(/\\([\\\]\)])/g, "$1");
}

function readFlatBracketContent(
  text: string,
  openIndex: number,
  contentStartIndex: number,
  scanIndex: InlineScanIndex,
): { content: string; closeIndex: number } | null {
  const closeIndex = scanIndex.nextRawCloseBracket(contentStartIndex);
  if (closeIndex < 0 || closeIndex === contentStartIndex) return null;

  const nestedOpenIndex = scanIndex.nextRawOpenBracket(contentStartIndex);
  if (nestedOpenIndex >= 0 && nestedOpenIndex < closeIndex) return null;

  return { content: text.slice(contentStartIndex, closeIndex), closeIndex };
}

function imageDestinationEndIndex(text: string, startIndex: number, endIndex: number): number {
  let index = startIndex;
  while (index < endIndex && text[index] !== " " && text[index] !== "\t" && text[index] !== "\n") {
    index += 1;
  }

  return index;
}

function parseWikiLinkAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  const bracketContent = readFlatBracketContent(text, index, index + 1, getScanIndex());
  if (!bracketContent) {
    return null;
  }

  const { content, closeIndex } = bracketContent;
  if (isMarkdownLinkOrImageLabel(text, index, closeIndex + 1)) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeIndex + 1;
  const targetFrom = from + 1;
  const targetTo = offset + closeIndex;

  return {
    type: "wikiLink",
    from,
    to,
    marker: {
      from,
      to: from + 1,
    },
    target: {
      from: targetFrom,
      to: targetTo,
    },
    value: content,
  };
}

function parseFootnoteRefAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  if (text[index + 1] !== "^") {
    return null;
  }

  const bracketContent = readFlatBracketContent(text, index, index + 2, getScanIndex());
  if (!bracketContent) {
    return null;
  }

  const { content, closeIndex } = bracketContent;
  if (isMarkdownLinkOrImageLabel(text, index, closeIndex + 1)) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeIndex + 1;
  const labelFrom = from + 2;
  const labelTo = offset + closeIndex;

  return {
    type: "footnoteRef",
    from,
    to,
    marker: {
      from,
      to: from + 2,
    },
    label: {
      from: labelFrom,
      to: labelTo,
    },
    identifier: content.toLowerCase(),
    value: content,
  };
}

function parseIconAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  const bracketContent = readFlatBracketContent(text, index, index + 1, getScanIndex());
  if (!bracketContent) {
    return null;
  }

  const { content, closeIndex } = bracketContent;
  if (isMarkdownLinkOrImageLabel(text, index, closeIndex + 1)) {
    return null;
  }

  const iconSuffix = ".icon";
  if (!content.toLowerCase().endsWith(iconSuffix) || content.length === iconSuffix.length) {
    return null;
  }

  const from = offset + index;
  const to = offset + closeIndex + 1;
  const nameFrom = from + 1;
  const nameTo = offset + closeIndex - iconSuffix.length;

  return {
    type: "icon",
    from,
    to,
    marker: {
      from,
      to: from + 1,
    },
    name: {
      from: nameFrom,
      to: nameTo,
    },
    value: content.slice(0, -iconSuffix.length),
  };
}

function parseEmojiAt(text: string, index: number, offset: number): MboxInlineNode | null {
  const match = /^:([A-Za-z0-9_+-]+):/.exec(text.slice(index));
  if (!match) {
    return null;
  }

  const from = offset + index;
  const to = from + match[0].length;
  const nameFrom = from + 1;
  const nameTo = nameFrom + match[1].length;

  return {
    type: "emoji",
    from,
    to,
    marker: {
      from,
      to,
    },
    name: {
      from: nameFrom,
      to: nameTo,
    },
    value: match[1],
  };
}

function parseAutoLinkAt(
  text: string,
  index: number,
  offset: number,
  getScanIndex: () => InlineScanIndex,
): MboxInlineNode | null {
  if (!startsWithHttpScheme(text, index) || !hasAutoLinkBoundary(text, index)) {
    return null;
  }

  const scanIndex = getScanIndex();
  const punctuationTrimmedEnd = scanIndex.punctuationTrimmedAutoLinkRunEnd(index);
  const nextDot = scanIndex.nextDot(index);
  if (nextDot < 0 || nextDot >= punctuationTrimmedEnd) {
    return null;
  }

  const whitespaceIndex = scanIndex.nextWhitespace(index);
  const runEnd = whitespaceIndex < 0 ? text.length : whitespaceIndex;
  const end = trimAutoLinkEnd(text, index, runEnd);

  if (end <= index) {
    return null;
  }

  const from = offset + index;
  const to = offset + end;

  return {
    type: "autoLink",
    from,
    to,
    url: {
      from,
      to,
    },
    urlValue: text.slice(index, end),
  };
}

function startsWithHttpScheme(text: string, index: number): boolean {
  return text.startsWith("https://", index) || text.startsWith("http://", index);
}

function hasAutoLinkBoundary(text: string, index: number): boolean {
  return index === 0 || /\s|[([{"']/.test(text[index - 1]);
}

function trimAutoLinkEnd(text: string, from: number, to: number): number {
  let end = to;
  while (end > from && /[.,:;!?]/.test(text[end - 1])) {
    end -= 1;
  }

  let openParens = 0;
  let closeParens = 0;
  for (let index = from; index < end; index += 1) {
    if (text[index] === "(") openParens += 1;
    if (text[index] === ")") closeParens += 1;
  }

  while (end > from && text[end - 1] === ")" && closeParens > openParens) {
    end -= 1;
    closeParens -= 1;
  }

  return end;
}

function isMarkdownLinkOrImageLabel(text: string, from: number, to: number): boolean {
  return text[from - 1] === "!" || text[to] === "(";
}

function createTextNode(text: string, from: number, to: number, offset: number): MboxInlineNode {
  return {
    type: "text",
    from: offset + from,
    to: offset + to,
    value: text.slice(from, to),
  };
}
