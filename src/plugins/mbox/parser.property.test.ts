import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMboxDocument } from "./parser.js";

// Property tests pin only the parser's INVARIANTS — never throws, every range
// stays inside the document, inline nodes stay inside their block, reparsing
// is deterministic. Grammar and exact offsets stay in the example-based
// parser.*.test.ts files: a generated input can't carry a reviewable expected
// value, so asking more of these tests would only blur what a failure means.
//
// The default seed is fixed so the PR gate stays deterministic and a red run
// always blames the change, not the dice. Explore fresh inputs with
// FC_SEED=<n> (and more of them with FC_NUM_RUNS=<n>); when a run finds a
// counterexample, promote the shrunken document to an example-based test or
// the conformance corpus in the fixing PR.
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260717;
const numRuns = process.env.FC_NUM_RUNS ? Number(process.env.FC_NUM_RUNS) : 200;

// Random unicode alone almost never forms mbox syntax, so half the generator
// splices documents from syntax atoms; the other half stays fully random so
// the parser also meets input that looks nothing like the grammar.
const syntaxAtoms = [
  "# ",
  "###",
  "- ",
  "  - ",
  "- [ ] ",
  "- [x]",
  "> ",
  "```",
  "```js",
  "| a | b |",
  "| --- |",
  "*",
  "**",
  "~~",
  "`",
  "[",
  "]",
  "(",
  ")",
  "[Page]",
  "[name.icon]",
  "[t](u)",
  "![a](i)",
  "[^1]",
  "[^1]: ",
  ":smile:",
  ":",
  "^",
  "https://example.com",
  "text",
  "😀",
  "é",
  "\t",
  " ",
  "\n",
];
const splicedDoc = fc.array(fc.constantFrom(...syntaxAtoms), { maxLength: 40 }).map((parts) => parts.join(""));
const anyDoc = fc.oneof(splicedDoc, fc.string({ maxLength: 200 }), fc.string({ unit: "grapheme", maxLength: 80 }));

describe("parseMboxDocument properties", () => {
  it("never throws, and every block and inline range stays in bounds", () => {
    fc.assert(
      fc.property(anyDoc, (doc) => {
        const parsed = parseMboxDocument(doc);
        for (const block of parsed.blocks) {
          expect(block.from).toBeGreaterThanOrEqual(0);
          expect(block.to).toBeGreaterThanOrEqual(block.from);
          expect(block.to).toBeLessThanOrEqual(doc.length);
          if ("inline" in block) {
            for (const node of block.inline) {
              expect(node.from).toBeGreaterThanOrEqual(block.from);
              expect(node.to).toBeGreaterThanOrEqual(node.from);
              expect(node.to).toBeLessThanOrEqual(block.to);
            }
          }
        }
      }),
      { seed, numRuns },
    );
  });

  it("assigns strictly increasing, non-overlapping block start offsets", () => {
    fc.assert(
      fc.property(anyDoc, (doc) => {
        const parsed = parseMboxDocument(doc);
        for (let index = 1; index < parsed.blocks.length; index += 1) {
          expect(parsed.blocks[index]!.from).toBeGreaterThanOrEqual(parsed.blocks[index - 1]!.to);
        }
      }),
      { seed, numRuns },
    );
  });

  it("parses the same document to the same structure every time", () => {
    fc.assert(
      fc.property(anyDoc, (doc) => {
        expect(parseMboxDocument(doc)).toEqual(parseMboxDocument(doc));
      }),
      { seed, numRuns: Math.ceil(numRuns / 2) },
    );
  });
});
