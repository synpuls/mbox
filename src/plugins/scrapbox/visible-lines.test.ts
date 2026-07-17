import { describe, expect, it } from "vitest";
import { parseScrapboxDocument } from "./parser.js";
import { scrapboxSkippedLineNumbers } from "./visible-lines.js";

describe("scrapboxSkippedLineNumbers", () => {
  it("combines active lines and code-block lines", () => {
    const document = parseScrapboxDocument("[* a]\ncode:x\n body\n[* b]");

    const skipped = scrapboxSkippedLineNumbers(document, new Set([1]));

    // line 1 active, lines 2-3 are the code block, line 4 is free.
    expect([...skipped].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("returns just the code-block lines when nothing is active", () => {
    const document = parseScrapboxDocument("code:x\n body\nafter");

    expect([...scrapboxSkippedLineNumbers(document, new Set<number>())].sort((a, b) => a - b)).toEqual([1, 2]);
  });
});
