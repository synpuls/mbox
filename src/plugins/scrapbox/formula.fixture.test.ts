import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScrapboxDocument } from "./parser.js";

type CosenseFormulaFixture = {
  fetchedAt: string;
  source: string;
  statements: string[];
  languages: Array<"tex" | "latex">;
  examples: Array<{ source: string; expression: string }>;
};

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/block-formula.cosense.json",
);

function readFixture(): CosenseFormulaFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as CosenseFormulaFixture;
}

describe("Cosense formula-block evidence fixture", () => {
  it("records the documented tex/latex classification and drives mbox's source-side contract", () => {
    const fixture = readFixture();

    // Cosense's page-lines API supplies documentation and examples, not
    // rendered HTML. This is evidence recorded as of fetchedAt, not a DOM
    // oracle: the mbox expectations below are its own contract tests.
    expect(fixture.statements.some((statement) => statement.includes("code:texもしくはcode:latexを指定する"))).toBe(true);
    expect(fixture.languages).toEqual(["tex", "latex"]);
    for (const example of fixture.examples) {
      const [block] = parseScrapboxDocument(example.source).codeBlocks;
      expect(block).toMatchObject({ kind: "formula", fileName: "tex" });
      const expression = block!.bodyLines.map((line) => example.source.slice(line.from + block!.indent + 1, line.logicalTo)).join("\n");
      expect(expression).toBe(example.expression);
    }
    for (const language of fixture.languages) {
      expect(parseScrapboxDocument(`code:${language}\n x`).codeBlocks[0]).toMatchObject({ kind: "formula", fileName: language });
    }
  });
});
