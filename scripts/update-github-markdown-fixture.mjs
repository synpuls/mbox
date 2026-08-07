import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Every fixture this script writes records HOW it was obtained, not just what
// came back. A recorded observation that cannot be reproduced is not evidence:
// a reader has to be able to re-run the same request and compare. `source` and
// `method` are written into the fixture itself rather than left implicit in
// this script, because the fixture is what the tests read.
const SOURCE = "https://api.github.com/markdown";
const METHOD = 'POST https://api.github.com/markdown, body {"text": <markdown>, "mode": "gfm"}, unauthenticated';

const fixtures = [
  {
    path: "tests/fixtures/gfm/inline-math-display.github.json",
    markdown: `The loss $L=\\sum_i p_i l_i$ is minimized.

$$
x^2
$$

| a | b |
| --- | --- |
| $x^2$ | y |`,
  },
  {
    path: "tests/fixtures/gfm/nested-inline-link-label.github.json",
    markdown: "A [*em* **strong** `code` ~~del~~ plain](https://example.com) link.",
  },
  {
    path: "tests/fixtures/gfm/footnote-definition-inline.github.json",
    markdown: "A footnote reference.[^note]\n\n[^note]: **bold** and `code` and a [plain link](https://example.com)",
  },
  {
    path: "tests/fixtures/gfm/inline-code-padding.github.json",
    markdown: `Paragraph: \` a \`, \`a \`, \` a\`, \`   \`, \`  a  \`, \`\ta\t\`, and \` \t \`.

Link: [\` b \`](https://example.com).

| code |
| --- |
| \` c \` |

Footnote reference.[^note]

[^note]: \` d \``,
  },
  {
    path: "tests/fixtures/gfm/inline-code-multiline-projection.github.json",
    markdown: [
      "Four spaces: `a",
      "    b`.",
      "",
      "Tab: `a",
      "\tb`.",
      "",
      "Padding: ` a ",
      " b `.",
      "",
      "Trailing space: `a  ",
      "b`.",
    ].join("\n"),
  },
  {
    path: "tests/fixtures/gfm/table-cells.github.json",
    markdown: `| header one | header two |
| --- | --- |
| long | retained | discarded |
| short |
| empty ||
| escaped \\| pipe | right |
omitted left | omitted right`,
  },
  {
    // Which emphasis lets a `$…$` run stay math. Kept in its own fixture, one
    // case per paragraph, because the oracle over it compares case by case --
    // and because a long document runs past CodeMirror's viewport in the test
    // environment, which silently drops the tail from a DOM-level oracle.
    path: "tests/fixtures/gfm/math-in-emphasis.github.json",
    markdown: `**$K$**

__$K$__

~~$K$~~

****$K$****

~~**$K$**~~

*$K$*

_$K$_

***$K$***

*a **$K$** b*

**a *$M$* b**

*x* $K$

*x* and $K$ and *y*

$a*b*c$

$a**b**c$

$a~~b~~c$

$a_b_c$

**a$K$a**

**\`$K$\`**

**~~__$K$__~~**

**~~_$K$_~~**

~~*$K$*~~

**a *b* $K$**

[**$K$**](https://e.test)

[*$K$*](https://e.test)

`,
  },
];

// Fetch EVERYTHING first, check it all, and only then write.
//
// Writing inside the loop meant a failure partway through -- a rate limit, a
// dropped connection -- left some fixtures updated and the rest at their old
// responses, with nothing on disk saying so. A mixed set is worse than a stale
// one: the tests still pass and the mismatch surfaces later as a puzzling
// oracle failure. Nothing is written unless every response arrived and passed
// the checks below.
//
// Run from the repository root; the paths above are relative to it. That alone
// would not have prevented the partial write.
const fetchedAt = new Date().toISOString();
const results = [];

for (const { path, markdown } of fixtures) {
  const response = await fetch(SOURCE, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ text: markdown, mode: "gfm" }),
  });

  if (!response.ok) {
    throw new Error(`GitHub Markdown API returned ${response.status} ${response.statusText} for ${path}; nothing written`);
  }

  const html = await response.text();
  if (html.length === 0) {
    throw new Error(`GitHub Markdown API returned an empty body for ${path}; nothing written`);
  }

  results.push({
    path,
    fixture: {
      source: SOURCE,
      method: METHOD,
      markdown,
      html,
      fetchedAt,
      githubApiVersion: response.headers.get("x-github-api-version-selected"),
    },
  });
}

if (results.length !== fixtures.length) {
  throw new Error(`expected ${fixtures.length} responses, collected ${results.length}; nothing written`);
}

for (const { path, fixture } of results) {
  const fixturePath = resolve(path);
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);
}
