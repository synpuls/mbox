import { expect, test } from "@playwright/test";
import {
  openPlayground,
  playgroundCoordsAtPos,
  playgroundDocString,
  setPlaygroundDoc,
  setPlaygroundSelection,
} from "../kit/playground-helpers";

// The GFM playground is the "run it" story for this notation namespace: one editor
// wired with `gfmPlugins()`, parsing real GitHub-Flavored Markdown via the mdast
// adapter. These smoke tests assert the core mbox promise on the ATX heading — the
// `# ` marker is hidden while its line is inactive, revealed on selection, and its
// content never slides sideways between the two states.
test("gfm playground mounts a CodeMirror editor", async ({ page }) => {
  await openPlayground(page, "gfm");

  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "GFM playground editor" })).toBeVisible();
});

test("unfocused heading hides its `# ` marker and reveals it on selection", async ({ page }) => {
  await openPlayground(page, "gfm");

  // Selection on line 2 keeps the heading line inactive, so its replace
  // decoration removes the raw `# ` from the DOM text entirely.
  await setPlaygroundDoc(page, "gfm", "# Title\nplain", "# Title\nplain".length, true);
  await expect(page.locator(".cm-line").first()).toHaveText("Title");

  // Move the selection onto the heading line: the marker comes back.
  await setPlaygroundSelection(page, "gfm", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("# Title");
});

// The mbox notation shows unfocused headings FLUSH LEFT: hiding `# ` moves the
// content to the line start (the focus shift is accepted for headings). Prove
// parity by comparing the unfocused heading's content x with a plain line's.
test("unfocused heading content sits flush left like a plain line", async ({ page }) => {
  await openPlayground(page, "gfm");

  const doc = "# Title\nplain";

  // Selection on the plain line leaves the heading inactive: `# ` is hidden.
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);
  const headingContentX = (await playgroundCoordsAtPos(page, "gfm", 2))?.left;
  const plainContentX = (await playgroundCoordsAtPos(page, "gfm", doc.indexOf("plain")))?.left;

  expect(headingContentX).toBeDefined();
  expect(plainContentX).toBeDefined();
  expect(headingContentX).toBeCloseTo(plainContentX as number, 0);
});

// Request 3 smoke coverage for the new constructs. The task checkbox is the one
// interactive widget — a click must dispatch the `[ ]` -> `[x]` text edit through
// the EditorView CodeMirror hands to `toDOM(view)`.
test("clicking an inactive task checkbox toggles the raw text", async ({ page }) => {
  await openPlayground(page, "gfm");

  // Task on line 1, caret on line 2, so line 1 is inactive and renders the widget.
  await setPlaygroundDoc(page, "gfm", "- [ ] todo\nplain", "- [ ] todo\nplain".length, true);

  const checkbox = page.locator('.mbox-gfm-task-checkbox input[type="checkbox"]').first();
  await expect(checkbox).toBeVisible();
  await checkbox.click();

  const docText = await playgroundDocString(page, "gfm");
  expect(docText).toContain("- [x] todo");
  await expect(checkbox).toBeFocused();
});

test("GFM task checkbox keeps its focused DOM node through two toggles", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "- [ ] todo\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);
  const selector = ".mbox-gfm-task-checkbox input";
  await page.evaluate((inputSelector) => {
    const input = document.querySelector<HTMLInputElement>(inputSelector);
    if (!input) throw new Error("No GFM task checkbox");
    input.focus();
    (window as typeof window & { gfmTaskCheckbox?: HTMLInputElement }).gfmTaskCheckbox = input;
  }, selector);

  for (const marker of ["[x]", "[ ]"]) {
    await page.locator(selector).click();
    await expect.poll(() => playgroundDocString(page, "gfm")).toBe(`- ${marker} todo\nplain`);
    await expect
      .poll(() =>
        page.evaluate((inputSelector) => {
          const input = document.querySelector<HTMLInputElement>(inputSelector);
          return {
            active: document.activeElement === input,
            ariaLabel: input?.getAttribute("aria-label"),
            checked: input?.checked,
            same: input === (window as typeof window & { gfmTaskCheckbox?: HTMLInputElement }).gfmTaskCheckbox,
          };
        }, selector),
      )
      .toEqual({
        active: true,
        ariaLabel: marker === "[x]" ? "checked task" : "unchecked task",
        checked: marker === "[x]",
        same: true,
      });
  }
});

test("GFM table semantics are rendered only while the whole table is inactive", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "| A | B |\n| :-- | --: |\n| 1 | 2 |\n\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);

  const table = page.locator('#editor .cm-line[role="table"]');
  await expect(table).toHaveAttribute("aria-rowcount", "2");
  await expect(table).toHaveAttribute("aria-colcount", "2");
  await expect(table).toHaveAttribute("aria-owns", "gfm-table-0-row-1");
  await expect(page.locator('#editor [role="columnheader"]')).toHaveCount(2);
  await expect(page.locator('#editor [role="cell"]')).toHaveCount(2);
  await expect(page.locator('#editor .mbox-gfm-table-delimiter')).toHaveAttribute("aria-hidden", "true");

  await setPlaygroundSelection(page, "gfm", 2);
  await expect(page.locator('#editor [role="table"]')).toHaveCount(0);
  await expect(page.locator('#editor [role="row"], #editor [role="columnheader"], #editor [role="cell"]')).toHaveCount(0);
  await expect(page.locator("#editor .cm-line").first()).toHaveText("| A | B |");
});

test("an inactive inline code span hides its backticks", async ({ page }) => {
  await openPlayground(page, "gfm");

  // Caret on line 2 keeps line 1 inactive, so the `` ` `` fences are removed.
  await setPlaygroundDoc(page, "gfm", "`code` word\nplain", "`code` word\nplain".length, true);
  await expect(page.locator(".cm-line").first()).toHaveText("code word");

  // Move the caret onto the code line: the backticks come back.
  await setPlaygroundSelection(page, "gfm", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("`code` word");
});

// Guards the demo wiring itself: the seeded catalog must render the image
// notation as an actual <img> (preview mode), not a token chip.
test("the seeded demo renders the image notation as an <img> element", async ({ page }) => {
  await openPlayground(page, "gfm");

  // CodeMirror virtualizes: scroll the catalog's image section into the render
  // window first (the seed grows over time, pushing the image further down).
  await expect
    .poll(async () => {
      await page.evaluate(() => window.scrollBy(0, 400));
      return page.evaluate(() => Boolean(document.querySelector("img.mbox-gfm-image-element")));
    })
    .toBe(true);

  const img = page.locator("img.mbox-gfm-image-element").first();
  expect(await img.getAttribute("src")).toContain("sample-image.png");
});

// Nested blockquotes must LOOK nested: each depth level adds an indent (and a
// bar), so the depth-2 content starts strictly to the right of depth-1 content.
test("a nested blockquote is indented deeper than its parent", async ({ page }) => {
  await openPlayground(page, "gfm");

  const doc = "> outer\n>> nested\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);

  const outerX = (await playgroundCoordsAtPos(page, "gfm", doc.indexOf("outer")))?.left;
  const nestedX = (await playgroundCoordsAtPos(page, "gfm", doc.indexOf("nested")))?.left;

  expect(outerX).toBeDefined();
  expect(nestedX).toBeDefined();
  expect(nestedX as number).toBeGreaterThan((outerX as number) + 5);
});

// The highlight palette must cover the common token kinds; comments are the
// canary (unstyled they render in the plain text color instead of muted gray).
test("code-block comments render in the muted comment color", async ({ page }) => {
  await openPlayground(page, "gfm");

  const doc = "```js\n// a comment\nconst ok = true;\n```";
  await setPlaygroundDoc(page, "gfm", doc, 0, true);

  const color = await page.evaluate(() => {
    const el = document.querySelector(".mbox-gfm-code-token.tok-comment");
    return el ? getComputedStyle(el).color : null;
  });

  // Deliberately changing the presentation theme fallback requires updating this expectation.
  expect(color).toBe("rgb(106, 115, 125)");
});
