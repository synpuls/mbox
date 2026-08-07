import { expect, test, type Page } from "@playwright/test";
import { openPlayground, setPlaygroundDoc, setPlaygroundSelection } from "../kit/playground-helpers";

// FOCUS-STABILITY BASICS: moving the caret onto a line reveals its raw markers,
// and for every text construct that reveal must never change the LINE HEIGHT.
// Width shifts are a per-construct policy; a vertical jump is a bug.
//
// ONE EXCEPTION, and it is narrow: a construct that folds SEVERAL PHYSICAL LINES
// into one rendered representation gives its consumed lines zero height while
// idle, and they return to a full line when the caret enters. The document below
// moves. That is the point of the construct, not a defect, and it already
// shipped for multiline math long before it was written down here — measured, a
// `$$` block is 95px idle and 63px focused. Those constructs are measured below
// as deliberate collapse/restore, never as stable height. Everything else, and
// every single-line marker or widget swap, still owes you an unchanged height. One test per construct measures the construct line's height
// with the selection elsewhere (unfocused) and on the line (focused).
//
// The image line is the one construct whose height comes from a widget; the
// image-kit's measure widget exists precisely to hold that height while the
// line is focused, so it belongs in this suite too (with a dev-server-local
// fixture image so the load is deterministic and the raw URL never soft-wraps).

async function lineHeight(page: Page, lineIndex: number): Promise<number> {
  const height = await page.evaluate(
    (index) => document.querySelectorAll(".cm-line")[index]?.getBoundingClientRect().height,
    lineIndex,
  );
  expect(height).toBeDefined();
  return height as number;
}

/**
 * Assert the height of `doc`'s line at `lineIndex` (0-based) is identical when
 * the selection sits on the trailing plain line vs on the construct line.
 */
async function expectStableHeight(page: Page, doc: string, lineIndex: number, focusPos: number): Promise<void> {
  const fullDoc = `${doc}\nplain trailing line`;

  await setPlaygroundDoc(page, "gfm", fullDoc, fullDoc.length, true);
  const unfocused = await lineHeight(page, lineIndex);

  await setPlaygroundSelection(page, "gfm", focusPos);
  const focused = await lineHeight(page, lineIndex);

  expect(focused).toBeCloseTo(unfocused, 1);
}


test("ATX heading height is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "# Title", 0, 2);
});

test("deep ATX heading height is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "###### Sixth", 0, 8);
});

test("a setext heading's own line is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "Setext\n======", 0, 2);
});

// The exception, stated as a measurement rather than left to be discovered.
async function expectCollapseAndRestore(page: Page, doc: string, lineIndex: number, focusPos: number): Promise<void> {
  const fullDoc = `${doc}\nplain trailing line`;

  await setPlaygroundDoc(page, "gfm", fullDoc, fullDoc.length, true);
  expect(await lineHeight(page, lineIndex)).toBe(0);

  await setPlaygroundSelection(page, "gfm", focusPos);
  expect(await lineHeight(page, lineIndex)).toBeGreaterThan(0);
}

test("a setext underline collapses while idle and returns when the caret enters", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectCollapseAndRestore(page, "Setext\n======", 1, 9);
});

// The exception did not arrive with setext: this has shipped for as long as
// multiline math has, and no test named it until now.
test("a multiline math block's interior collapses while idle and returns", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectCollapseAndRestore(page, "$$\nx^2\n$$", 1, 4);
});

test("bullet and ordered list item heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "- item", 0, 3);
  await expectStableHeight(page, "1. item", 0, 4);
});

test("task list item heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "- [ ] todo", 0, 7);
  await expectStableHeight(page, "- [x] done", 0, 7);
});

test("blockquote line heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "> quoted", 0, 4);
  await expectStableHeight(page, ">> nested", 0, 5);
});

test("fenced code block line heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "```js\nconst x = 1\n```";
  await expectStableHeight(page, doc, 0, 2); // opening fence / header line
  await expectStableHeight(page, doc, 1, 8); // content line
  await expectStableHeight(page, doc, 2, doc.length - 1); // closing fence
});

test("table line heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "| a | b |\n| - | - |\n| 1 | 2 |";
  await expectStableHeight(page, doc, 0, 2); // header row
  await expectStableHeight(page, doc, 1, 12); // delimiter row
  await expectStableHeight(page, doc, 2, 22); // body row
});

test("thematic break height is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "---", 0, 1);
});

test("inline construct paragraph height is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "*em* **strong** ~~gone~~ `code` [l](https://e.com) www.e.com", 0, 2);
});

test("hard-break line height is focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  await expectStableHeight(page, "ends here\\\nnext line", 0, 3);
});

test("image preview line height is focus-stable (the measure widget holds it)", async ({ page }) => {
  await openPlayground(page, "gfm");
  // A 16x48 fixture served by the dev server: short URL (the raw markdown must
  // not soft-wrap) and a real height the measure widget has to hold on focus.
  const doc = "![tall](/tests/layout/kit/fixtures/tall.png)\nplain trailing line";

  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);
  // Wait for the image to load and size the unfocused line.
  await expect.poll(() => lineHeight(page, 0)).toBeGreaterThan(40);
  const unfocused = await lineHeight(page, 0);

  await setPlaygroundSelection(page, "gfm", 3);
  const focused = await lineHeight(page, 0);

  expect(focused).toBeCloseTo(unfocused, 1);
});

test("footnote reference and definition line heights are focus-stable", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "text[^1] more\n\n[^1]: the note";
  await expectStableHeight(page, doc, 0, 5); // reference line (chip <-> raw swap)
  await expectStableHeight(page, doc, 2, doc.length - 2); // definition line (styling only)
});
