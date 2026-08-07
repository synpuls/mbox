import { describe, expect, it } from "vitest";
import { parseScrapboxDocument } from "./parser.js";
import { scrapboxLinkSkippedLineNumbers, scrapboxSkippedLineNumbers } from "./visible-lines.js";

function sorted(lineNumbers: Iterable<number>): number[] {
  return [...lineNumbers].sort((a, b) => a - b);
}

describe("scrapboxLinkSkippedLineNumbers", () => {
  it("includes code blocks and table openers, but not table body rows", () => {
    const document = parseScrapboxDocument("code:x\n body\ntable:[Page]\n [alice.icon]\tb\nafter");

    expect(sorted(scrapboxLinkSkippedLineNumbers(document))).toEqual([1, 2, 3]);
  });
});

describe("scrapboxSkippedLineNumbers", () => {
  it("combines active lines and code-block lines", () => {
    const document = parseScrapboxDocument("[* a]\ncode:x\n body\n[* b]");

    const skipped = scrapboxSkippedLineNumbers(document, new Set([1]));

    // line 1 active, lines 2-3 are the code block, line 4 is free.
    expect(sorted(skipped)).toEqual([1, 2, 3]);
  });

  it("returns just the code-block lines when nothing is active", () => {
    const document = parseScrapboxDocument("code:x\n body\nafter");

    expect(sorted(scrapboxSkippedLineNumbers(document, new Set<number>()))).toEqual([1, 2]);
  });
});
