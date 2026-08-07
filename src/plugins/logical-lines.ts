/**
 * One physical input line with both its raw input boundary and its
 * syntax-facing boundary. `to` remains the raw offset, including a CR that is
 * part of a CRLF terminator; `logicalTo` and `text` exclude that terminator.
 * A lone CR is source text, not a line terminator. Only Scrapbox exposes
 * `logicalTo` on its public line model: its consumers reconstruct content from
 * line offsets. Hatena and mbox consumers need the raw end for literal bodies,
 * so their public line models intentionally do not expose a logical end.
 */
export interface LogicalLine {
  text: string;
  line: number;
  from: number;
  to: number;
  logicalTo: number;
}

/** Construct syntax-facing lines without losing raw source geometry. */
export function createLogicalLines(input: string): LogicalLine[] {
  const rawLines = input.split("\n");
  let offset = 0;
  return rawLines.map((rawText, index) => {
    const from = offset;
    const to = from + rawText.length;
    offset = to + 1;
    const isCrLfTerminated = index < rawLines.length - 1 && rawText.endsWith("\r");
    const logicalTo = isCrLfTerminated ? to - 1 : to;
    return { text: input.slice(from, logicalTo), line: index + 1, from, to, logicalTo };
  });
}
