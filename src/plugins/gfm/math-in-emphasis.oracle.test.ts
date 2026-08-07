import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGfmDocument } from "./parser.js";

// Which emphasis lets a `$…$` run stay math, checked against GitHub case by
// case.
//
// The expectation is DERIVED from the fixture, never written here: for each
// case, "GitHub put a math renderer in this paragraph" is compared with "mbox's
// parser produced inline math for this input". Restating the answers in the
// test would mean two records of the same fact, and the wrong one would win.
//
// Compared at the PARSER, not through a rendered editor. A DOM-level oracle
// only sees what CodeMirror's viewport rendered, and a document with this many
// cases runs past it -- the tail would silently look like "no math" and the
// test would pass or fail for a reason that has nothing to do with the rule.
//
// Each case is its own paragraph, so GitHub's output is one `<p>` per case and
// the two sequences line up by position. That alignment is asserted first,
// below, and it is why every case here is a paragraph: a list, a blockquote or
// a table emits something other than a `<p>` and would shift every later
// comparison.
//
// So block contexts are OUT OF SCOPE for this oracle, not established as
// equivalent. Spot checks against the API showed `- **$K$**` and a table cell
// behaving as the rule predicts, but a spot check is not a fixture, and
// emphasis parsing is not always identical inside a block. Covering them means
// a structure-aware comparison, which is its own piece of work.
//
// Three layers matter here and are easy to write wrongly. `**~~**$K$**~~**`
// looks like strong > del > strong and is not: the inner `**` closes the outer
// one, leaving the math a SIBLING of two `<strong>` elements. `__` for the
// inner layer gives the real nesting.

type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/gfm/math-in-emphasis.github.json");

function readFixture(): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GitHubMarkdownFixture;
}

/** One entry per case, in document order: did GitHub render math here? */
function githubMathByCase(html: string): boolean[] {
  return html
    .split("</p>")
    .filter((block) => block.includes("<p>"))
    .map((block) => block.includes("math-renderer"));
}

/** One entry per case, in document order: did mbox parse inline math here? */
function mboxMathByCase(markdown: string): boolean[] {
  return markdown
    .split("\n\n")
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => parseGfmDocument(paragraph).inlineMath.length > 0);
}

describe("GitHub Markdown API oracle: math inside emphasis", () => {
  it("has one GitHub paragraph per case", () => {
    // The alignment below is positional, so a case that produced anything other
    // than a single paragraph would quietly shift every later comparison.
    const fixture = readFixture();
    const cases = fixture.markdown.split("\n\n").filter((paragraph) => paragraph.trim().length > 0);

    expect(githubMathByCase(fixture.html)).toHaveLength(cases.length);
  });

  it("agrees with GitHub on every case", () => {
    // This committed fixture is GitHub as observed at `fetchedAt`. It catches
    // mbox regressions; it cannot notice a later GitHub change.
    const fixture = readFixture();
    const cases = fixture.markdown.split("\n\n").filter((paragraph) => paragraph.trim().length > 0);
    const github = githubMathByCase(fixture.html);
    const mbox = mboxMathByCase(fixture.markdown);

    // Labelled by input, so a failure names the case rather than an index.
    expect(cases.map((input, index) => `${input.replace(/\n/g, " ")} -> ${mbox[index]}`)).toEqual(
      cases.map((input, index) => `${input.replace(/\n/g, " ")} -> ${github[index]}`),
    );
  });
});
