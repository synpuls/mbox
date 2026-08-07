import { describe, expect, it } from "vitest";
import { createLogicalLines } from "./logical-lines.js";

describe("createLogicalLines", () => {
  it.each([
    ["LF", "one\ntwo", [
      { text: "one", line: 1, from: 0, to: 3, logicalTo: 3 },
      { text: "two", line: 2, from: 4, to: 7, logicalTo: 7 },
    ]],
    ["CRLF", "one\r\ntwo\r\n", [
      { text: "one", line: 1, from: 0, to: 4, logicalTo: 3 },
      { text: "two", line: 2, from: 5, to: 9, logicalTo: 8 },
      { text: "", line: 3, from: 10, to: 10, logicalTo: 10 },
    ]],
    ["a lone final CR", "one\r", [{ text: "one\r", line: 1, from: 0, to: 4, logicalTo: 4 }]],
    ["a lone CR before LF content", "one\rtwo\n", [{ text: "one\rtwo", line: 1, from: 0, to: 7, logicalTo: 7 }, { text: "", line: 2, from: 8, to: 8, logicalTo: 8 }]],
  ])("keeps raw geometry and exposes the syntax-facing end for %s", (_name, input, expected) => {
    expect(createLogicalLines(input)).toEqual(expected);
  });

  const boundaryCases = [
    ["empty input", "", [{ text: "", line: 1, from: 0, to: 0, logicalTo: 0 }]],
    ["LF without a trailing newline", "a\nb", [
      { text: "a", line: 1, from: 0, to: 1, logicalTo: 1 },
      { text: "b", line: 2, from: 2, to: 3, logicalTo: 3 },
    ]],
    ["LF with a trailing newline", "a\nb\n", [
      { text: "a", line: 1, from: 0, to: 1, logicalTo: 1 },
      { text: "b", line: 2, from: 2, to: 3, logicalTo: 3 },
      { text: "", line: 3, from: 4, to: 4, logicalTo: 4 },
    ]],
    ["CRLF without a trailing newline", "a\r\nb", [
      { text: "a", line: 1, from: 0, to: 2, logicalTo: 1 },
      { text: "b", line: 2, from: 3, to: 4, logicalTo: 4 },
    ]],
    ["CRLF with a trailing newline", "a\r\nb\r\n", [
      { text: "a", line: 1, from: 0, to: 2, logicalTo: 1 },
      { text: "b", line: 2, from: 3, to: 5, logicalTo: 4 },
      { text: "", line: 3, from: 6, to: 6, logicalTo: 6 },
    ]],
    ["consecutive empty CRLF lines", "\r\n\r\n", [
      { text: "", line: 1, from: 0, to: 1, logicalTo: 0 },
      { text: "", line: 2, from: 2, to: 3, logicalTo: 2 },
      { text: "", line: 3, from: 4, to: 4, logicalTo: 4 },
    ]],
    ["an empty CRLF line between content", "a\r\n\r\nb", [
      { text: "a", line: 1, from: 0, to: 2, logicalTo: 1 },
      { text: "", line: 2, from: 3, to: 4, logicalTo: 3 },
      { text: "b", line: 3, from: 5, to: 6, logicalTo: 6 },
    ]],
    ["a non-BMP character", "😀\r\nb", [
      { text: "😀", line: 1, from: 0, to: 3, logicalTo: 2 },
      { text: "b", line: 2, from: 4, to: 5, logicalTo: 5 },
    ]],
    ["a lone CR in the middle of a line", "a\rb", [{ text: "a\rb", line: 1, from: 0, to: 3, logicalTo: 3 }]],
    ["a final lone CR", "a\r", [{ text: "a\r", line: 1, from: 0, to: 2, logicalTo: 2 }]],
    ["mixed CRLF and LF terminators", "a\r\nb\nc\r\n", [
      { text: "a", line: 1, from: 0, to: 2, logicalTo: 1 },
      { text: "b", line: 2, from: 3, to: 4, logicalTo: 4 },
      { text: "c", line: 3, from: 5, to: 7, logicalTo: 6 },
      { text: "", line: 4, from: 8, to: 8, logicalTo: 8 },
    ]],
  ] as const;

  it.each(boundaryCases)("fixes the full boundary contract for %s", (_name, input, expected) => {
    expect(createLogicalLines(input)).toEqual(expected);
  });

  it.each(boundaryCases)("derives text and raw geometry correctly for %s", (_name, input, expected) => {
    const rawLines = input.split("\n");

    for (const [index, { text, from, to, logicalTo }] of expected.entries()) {
      expect(text).toBe(input.slice(from, logicalTo));
      expect(to - from).toBe(rawLines[index].length);
    }
  });

  it.each(boundaryCases)("keeps every line within the input's raw and logical boundaries for %s", (_name, input) => {
    for (const { from, to, logicalTo } of createLogicalLines(input)) {
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThanOrEqual(logicalTo);
      expect(logicalTo).toBeLessThanOrEqual(to);
      expect(to).toBeLessThanOrEqual(input.length);
    }
  });

  it.each(boundaryCases)("only removes the CR immediately before an LF from a logical boundary for %s", (_name, input) => {
    for (const { logicalTo, to } of createLogicalLines(input)) {
      if (logicalTo !== to) {
        expect(to).toBe(logicalTo + 1);
        expect(input[logicalTo]).toBe("\r");
        expect(input[to]).toBe("\n");
      }
    }
  });

  const lineEndingPairs = boundaryCases
    .map(([name, input]) => [name, input.replaceAll("\r\n", "\n")] as const)
    .filter(([, input]) => input.includes("\n") && !input.includes("\r"));

  it.each(lineEndingPairs)("keeps text and line numbers identical when %s changes from LF to CRLF", (_name, lfInput) => {
    const crlfInput = lfInput.replaceAll("\n", "\r\n");
    const visibleLineData = (input: string) => createLogicalLines(input).map(({ text, line }) => ({ text, line }));

    expect(visibleLineData(crlfInput)).toEqual(visibleLineData(lfInput));
  });
});
