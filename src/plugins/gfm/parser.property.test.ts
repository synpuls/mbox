import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseGfmDocument, type GfmDocument } from "./parser.js";

// This property protects the adapter contract used by segmented syntax
// highlighting. Keep its seed fixed for reproducible PR runs; use FC_SEED and
// FC_NUM_RUNS to explore more inputs locally.
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260727;
const numRuns = process.env.FC_NUM_RUNS ? Number(process.env.FC_NUM_RUNS) : 200;
const codeLine = fc.stringMatching(/^[A-Za-z0-9 =;😀]*$/).filter((line) => line.length > 0);
const lineEnding = fc.constantFrom("\n", "\r\n");

type Container = "plain" | "quote" | "list";

interface GeneratedBlock {
  input: string;
  closed: boolean;
  container: Container;
  hasEmptyLine: boolean;
}

function blockArbitrary(closed: boolean, container: Container, mustContainEmptyLine: boolean, useTab: boolean, withLanguage: boolean) {
  const language = withLanguage ? fc.constantFrom("ts", "js") : fc.constant("");
  return fc.tuple(language, codeLine, codeLine, lineEnding).map(([lang, first, second, eol]) => {
    const indent = useTab ? "\t" : "  ";
    const fence = `\`\`\`${lang ?? ""}`;
    const lines = mustContainEmptyLine ? [fence, first, "", second, ...(closed ? ["```"] : [])] : [fence, first, ...(closed ? ["```"] : [])];
    const prefix = container === "quote" ? `> ${indent}` : container === "list" ? indent : "";
    const wrapped = lines.map((line) => `${prefix}${line}`);
    const input = container === "list" ? `- item${eol}${eol}${wrapped.join(eol)}` : wrapped.join(eol);
    return { input, closed, container, hasEmptyLine: mustContainEmptyLine };
  });
}

// Every generated document contains a closed block, a closed block with an empty
// line, quote/list containers, tab-or-space indentation, an optional language,
// and an unclosed block. The arbitrary text changes the source without allowing
// the structural coverage to disappear.
const structuredFencedDocument = fc.tuple(
  blockArbitrary(true, "plain", false, false, true),
  blockArbitrary(true, "quote", true, false, false),
  blockArbitrary(true, "list", true, true, true),
  blockArbitrary(false, "plain", false, false, false),
).map((blocks) => ({
  input: blocks.map((block) => block.input).join("\n\n"),
  blocks,
}));

function allOffsets(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap(allOffsets);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => (key === "from" || key === "to") && typeof child === "number" ? [child] : allOffsets(child));
}

function assertDocumentInBounds(document: GfmDocument, input: string) {
  for (const offset of allOffsets(document)) {
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(input.length);
  }
}

describe("parseGfmDocument code-block properties", () => {
  it("maps structured fenced blocks and every public offset within the supplied input", () => {
    const coverage = { closed: 0, unclosed: 0, container: 0, emptyLine: 0, crlf: 0 };

    fc.assert(
      fc.property(structuredFencedDocument, ({ input, blocks }) => {
        const document = parseGfmDocument(input);
        for (const block of document.codeBlocks) {
          expect(block.contentSegments.map(({ text }) => text).join("\n")).toBe(block.value);
        }
        assertDocumentInBounds(document, input);

        coverage.closed += document.codeBlocks.filter((block) => block.closingFence !== null).length;
        coverage.unclosed += document.codeBlocks.filter((block) => block.closingFence === null).length;
        coverage.container += blocks.filter((block) => block.container !== "plain").length;
        coverage.emptyLine += blocks.filter((block) => block.hasEmptyLine).length;
        if (input.includes("\r\n")) coverage.crlf += 1;
      }),
      { seed, numRuns },
    );

    // These checks make a generator regression visible instead of silently
    // reducing the paths the invariant exercises.
    expect(coverage.closed).toBe(numRuns * 3);
    expect(coverage.unclosed).toBe(numRuns);
    expect(coverage.container).toBe(numRuns * 2);
    expect(coverage.emptyLine).toBe(numRuns * 2);
    expect(coverage.crlf).toBeGreaterThan(0);
  });
});

describe("parseGfmDocument bare-dollar math properties", () => {
  it("never lets a scanned dollar range overlap syntax protected before scanning", () => {
    const coverage = { generated: 0, bareMath: 0, rejectedCandidates: 0, dollarBlocks: 0, protectedSyntax: 0 };
    const expression = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,12}$/);

    fc.assert(
      fc.property(expression, expression, (first, second) => {
        const protectedCandidates = [
          `\`$${second}$\``,
          `\`\`\`text\n$${first}$\n\`\`\``,
          `[^n]: footnote $${first}$`,
          `ref[^$${second}$]\n\n[^$${second}$]: note`,
          `[id]: https://example.test/$${first}$`,
          `<span>$${second}$</span>`,
          `<!-- $${first}$ -->`,
        ];
        const input = [
          `$${first}$`,
          `$$${second}$$`,
          `$$\n${first}\n$$`,
          `$${first}$ $${second}$`,
          ...protectedCandidates,
        ].join("\n\n");
        const document = parseGfmDocument(input);
        const protectedRanges = [
          ...document.inlineCodes.map((code) => ({ from: code.open.from, to: code.close.to })),
          ...document.codeBlocks.map(({ from, to }) => ({ from, to })),
          ...document.links.map(({ from, to }) => ({ from, to })),
          ...document.images.map(({ from, to }) => ({ from, to })),
          ...document.escapes.map(({ from, to }) => ({ from, to: to + 1 })),
          ...document.inlineMath.filter((math) => math.delimiter === "backtick").map(({ from, to }) => ({ from, to })),
        ];
        const bare = document.inlineMath.filter((math) => math.delimiter === "dollar");
        for (const math of bare) {
          expect(protectedRanges.some((range) => math.from < range.to && range.from < math.to)).toBe(false);
        }
        for (const candidate of protectedCandidates) {
          const from = input.indexOf(candidate);
          const to = from + candidate.length;
          expect(bare.some((math) => math.from < to && from < math.to), candidate).toBe(false);
        }
        coverage.generated += 1;
        coverage.bareMath += bare.length;
        coverage.rejectedCandidates += protectedCandidates.length;
        coverage.dollarBlocks += bare.filter((math) => math.display === "block").length;
        coverage.protectedSyntax += protectedRanges.length;
      }),
      { seed, numRuns },
    );

    // This property is only evidence when the generator exercises every
    // accept/reject route. Keep its structural coverage part of the assertion.
    expect(coverage.generated).toBe(numRuns);
    expect(coverage.bareMath).toBe(numRuns * 5);
    expect(coverage.rejectedCandidates).toBeGreaterThanOrEqual(numRuns * 7);
    expect(coverage.dollarBlocks).toBeGreaterThanOrEqual(numRuns * 2);
    expect(coverage.protectedSyntax).toBeGreaterThanOrEqual(numRuns * 2);
  });
});
