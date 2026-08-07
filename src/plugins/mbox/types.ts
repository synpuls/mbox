export interface MboxRange {
  from: number;
  to: number;
}

export interface MboxDocument {
  blocks: MboxBlock[];
}

export type MboxBlock =
  | MboxParagraphBlock
  | MboxHeadingBlock
  | MboxListItemBlock
  | MboxTaskListItemBlock
  | MboxQuoteBlock
  | MboxCodeBlock
  | MboxTableBlock
  | MboxFootnoteDefinitionBlock;
export type MboxInlineNode =
  | MboxInlineTextNode
  | MboxInlineCodeNode
  | MboxInlineStyleNode
  | MboxWikiLinkNode
  | MboxIconNode
  | MboxFootnoteRefNode
  | MboxMarkdownLinkNode
  | MboxMarkdownImageNode
  | MboxAutoLinkNode
  | MboxEmojiNode;

export interface MboxBaseBlock {
  type: string;
  from: number;
  to: number;
  line: number;
}

export interface MboxParagraphBlock extends MboxBaseBlock {
  type: "paragraph";
  content: MboxRange;
  inline: MboxInlineNode[];
}

export interface MboxHeadingBlock extends MboxBaseBlock {
  type: "heading";
  level: number;
  marker: MboxRange;
  syntax: MboxRange;
  content: MboxRange;
  inline: MboxInlineNode[];
}

export interface MboxListItemBlock extends MboxBaseBlock {
  type: "listItem";
  depth: number;
  marker: MboxRange;
  syntax: MboxRange;
  content: MboxRange;
  inline: MboxInlineNode[];
}

export interface MboxTaskListItemBlock extends MboxBaseBlock {
  type: "taskListItem";
  depth: number;
  checked: boolean;
  marker: MboxRange;
  checkbox: MboxRange;
  syntax: MboxRange;
  content: MboxRange;
  inline: MboxInlineNode[];
}

export interface MboxQuoteBlock extends MboxBaseBlock {
  type: "quote";
  marker: MboxRange;
  syntax: MboxRange;
  content: MboxRange;
  inline: MboxInlineNode[];
}

export interface MboxCodeBlock extends MboxBaseBlock {
  type: "codeBlock";
  openingFence: MboxRange;
  info: MboxRange;
  infoValue: string;
  content: MboxRange;
  closingFence: MboxRange | null;
  value: string;
}

export interface MboxTableCell extends MboxRange {
  content: MboxRange;
  value: string;
}

export interface MboxTableRow extends MboxRange {
  cells: MboxTableCell[];
}

export interface MboxTableBlock extends MboxBaseBlock {
  type: "table";
  header: MboxTableRow;
  delimiter: MboxTableRow;
  rows: MboxTableRow[];
}

export interface MboxFootnoteDefinitionBlock extends MboxBaseBlock {
  type: "footnoteDefinition";
  label: string;
  identifier: string;
  marker: MboxRange;
  syntax: MboxRange;
  content: MboxRange;
  value: string;
}

export interface MboxInlineTextNode extends MboxRange {
  type: "text";
  value: string;
}

export interface MboxInlineCodeNode extends MboxRange {
  type: "inlineCode";
  openingMarker: MboxRange;
  closingMarker: MboxRange;
  content: MboxRange;
  value: string;
}

export interface MboxInlineStyleNode extends MboxRange {
  type: "emphasis" | "strong" | "strikethrough";
  openingMarker: MboxRange;
  closingMarker: MboxRange;
  content: MboxRange;
  value: string;
}

export interface MboxWikiLinkNode extends MboxRange {
  type: "wikiLink";
  marker: MboxRange;
  target: MboxRange;
  value: string;
}

export interface MboxIconNode extends MboxRange {
  type: "icon";
  marker: MboxRange;
  name: MboxRange;
  value: string;
}

export interface MboxFootnoteRefNode extends MboxRange {
  type: "footnoteRef";
  marker: MboxRange;
  label: MboxRange;
  identifier: string;
  value: string;
}

export interface MboxMarkdownLinkNode extends MboxRange {
  type: "markdownLink";
  label: MboxRange;
  url: MboxRange;
  markers: {
    labelOpen: MboxRange;
    labelClose: MboxRange;
    urlOpen: MboxRange;
    urlClose: MboxRange;
  };
  labelValue: string;
  urlValue: string;
}

export interface MboxMarkdownImageNode extends MboxRange {
  type: "markdownImage";
  alt: MboxRange;
  url: MboxRange;
  markers: {
    image: MboxRange;
    labelOpen: MboxRange;
    labelClose: MboxRange;
    urlOpen: MboxRange;
    urlClose: MboxRange;
  };
  altValue: string;
  urlValue: string;
}

export interface MboxAutoLinkNode extends MboxRange {
  type: "autoLink";
  url: MboxRange;
  urlValue: string;
}

export interface MboxEmojiNode extends MboxRange {
  type: "emoji";
  marker: MboxRange;
  name: MboxRange;
  value: string;
}


/** @internal */
export interface MboxBlockParserContext {
  input: string;
  lines: LogicalLine[];
  lineIndex: number;
}

/** @internal */
export interface MboxBlockParseResult {
  block: MboxBlock;
  nextLineIndex: number;
}

export type MboxBlockParser = (context: MboxBlockParserContext) => MboxBlockParseResult | null;
import type { LogicalLine } from "../logical-lines.js";
