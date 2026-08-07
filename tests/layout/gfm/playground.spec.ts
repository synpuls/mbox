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

// This is intentionally a browser-layout check: the short row's second cell
// is a point widget, so a DOM-only test cannot establish that it participates
// in the flex row with a real, non-zero column box.
test("GFM malformed table rows discard inactive excess tails while retaining virtual cells and source", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "| a | b |\n| --- | --- |\n| 1 | 2 | 3 |\n| 9 |\n\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);

  const table = page.locator('#editor .cm-line[role="table"]');
  await expect(table).toHaveAttribute("aria-colcount", "2");
  const rows = page.locator("#editor .mbox-gfm-table-row");
  const longCells = rows.nth(0).locator(".mbox-gfm-table-cell");
  const shortCells = rows.nth(1).locator(".mbox-gfm-table-cell");
  await expect(longCells).toHaveText(["1", "2"]);
  await expect(longCells).toHaveCount(2);
  await expect(shortCells).toHaveCount(2);
  await expect(shortCells).toHaveText(["9", ""]);

  const virtualWidth = await shortCells.nth(1).evaluate((cell) => cell.getBoundingClientRect().width);
  expect(virtualWidth).toBeGreaterThan(0);

  await setPlaygroundSelection(page, "gfm", doc.indexOf("3"));
  await expect(page.locator('#editor [role="table"]')).toHaveCount(0);
  await expect(page.locator("#editor .cm-line").nth(2)).toHaveText("| 1 | 2 | 3 |");
  await setPlaygroundSelection(page, "gfm", doc.length);
  await expect.poll(() => playgroundDocString(page, "gfm")).toBe(doc);
});

test("GFM Japanese cells reserve their two-ch-per-character column width without crossing into the next column", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "| 日本 | B |\n| --- | --- |\n| A | C |\n\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);

  const layout = await page.locator("#editor .mbox-gfm-table-header").evaluate((row) => {
    const cells = [...row.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];
    if (cells.length !== 2) throw new Error("Expected two rendered table cells");

    const [japaneseCell, nextCell] = cells;
    const japaneseRect = japaneseCell.getBoundingClientRect();
    const nextRect = nextCell.getBoundingClientRect();
    const probe = document.createElement("span");
    probe.textContent = "0";
    probe.style.cssText = `font: ${getComputedStyle(japaneseCell).font}; position: absolute; visibility: hidden`;
    document.body.append(probe);
    const chWidth = probe.getBoundingClientRect().width;
    probe.remove();
    const extraWidth = getComputedStyle(japaneseCell).getPropertyValue("--mbox-gfm-table-column-extra-width").trim();
    if (!extraWidth.endsWith("ch")) throw new Error("Expected GFM table cell extra width to be expressed in ch");
    const extraWidthCh = Number.parseFloat(extraWidth);
    if (!Number.isFinite(extraWidthCh)) throw new Error("Expected GFM table cell extra width to be numeric");

    return { chWidth, extraWidthCh, japaneseCellWidth: japaneseRect.width, nextCellLeft: nextRect.left, japaneseCellRight: japaneseRect.right };
  });

  // Two Japanese characters reserve 4ch; measure the demo cell chrome separately.
  expect(layout.japaneseCellWidth).toBeCloseTo(layout.chWidth * (4 + layout.extraWidthCh), 0);
  expect(layout.japaneseCellRight).toBeLessThanOrEqual(layout.nextCellLeft + 0.5);
});

test("GFM decorated table cells reserve their rendered-text width without crossing into the next column", async ({ page }) => {
  await openPlayground(page, "gfm");

  const measureFirstColumn = async (doc: string) => {
    await setPlaygroundDoc(page, "gfm", doc, doc.length, true);
    return page.locator("#editor .mbox-gfm-table-header").evaluate((row) => {
      const cells = [...row.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];
      if (cells.length !== 2) throw new Error("Expected two rendered table cells");

      const [firstCell, nextCell] = cells;
      const firstRect = firstCell.getBoundingClientRect();
      const nextRect = nextCell.getBoundingClientRect();
      const probe = document.createElement("span");
      probe.textContent = "0";
      probe.style.cssText = `font: ${getComputedStyle(firstCell).font}; position: absolute; visibility: hidden`;
      document.body.append(probe);
      const chWidth = probe.getBoundingClientRect().width;
      probe.remove();
      const extraWidth = getComputedStyle(firstCell).getPropertyValue("--mbox-gfm-table-column-extra-width").trim();
      if (!extraWidth.endsWith("ch")) throw new Error("Expected GFM table cell extra width to be expressed in ch");
      const extraWidthCh = Number.parseFloat(extraWidth);
      if (!Number.isFinite(extraWidthCh)) throw new Error("Expected GFM table cell extra width to be numeric");

      return { chWidth, extraWidthCh, firstCellWidth: firstRect.width, firstCellRight: firstRect.right, nextCellLeft: nextRect.left };
    });
  };

  const decorated = await measureFirstColumn("| **bold** | b |\n| --- | --- |\n| x | y |\n\nplain");
  const plain = await measureFirstColumn("| bold | b |\n| --- | --- |\n| x | y |\n\nplain");

  // The markers are hidden: `**bold**` must claim the same 4ch column as `bold`.
  expect(decorated.firstCellWidth).toBeCloseTo(decorated.chWidth * (4 + decorated.extraWidthCh), 0);
  expect(decorated.firstCellWidth).toBeCloseTo(plain.firstCellWidth, 0);
  expect(decorated.firstCellRight).toBeLessThanOrEqual(decorated.nextCellLeft + 0.5);
});

test("GFM table link labels reserve their projected width without crossing into the next column", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "| [**bold** label](url) | b |\n| --- | --- |\n| x | y |\n\nplain";
  await setPlaygroundDoc(page, "gfm", doc, doc.length, true);

  const layout = await page.locator("#editor .mbox-gfm-table-header").evaluate((row) => {
    const cells = [...row.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];
    if (cells.length !== 2) throw new Error("Expected two rendered table cells");
    const [linkCell, nextCell] = cells;
    const linkRect = linkCell.getBoundingClientRect();
    const nextRect = nextCell.getBoundingClientRect();
    const probe = document.createElement("span");
    probe.textContent = "0";
    probe.style.cssText = `font: ${getComputedStyle(linkCell).font}; position: absolute; visibility: hidden`;
    document.body.append(probe);
    const chWidth = probe.getBoundingClientRect().width;
    probe.remove();
    const extraWidth = Number.parseFloat(getComputedStyle(linkCell).getPropertyValue("--mbox-gfm-table-column-extra-width"));
    if (!Number.isFinite(extraWidth)) throw new Error("Expected GFM table cell extra width to be numeric");
    return { chWidth, extraWidth, linkCellWidth: linkRect.width, linkCellRight: linkRect.right, nextCellLeft: nextRect.left };
  });

  // The anchor renders the same plain projection (`bold label`) that table-kit
  // measures: inline emphasis markup must not reserve extra source-width space.
  expect(layout.linkCellWidth).toBeCloseTo(layout.chWidth * ("bold label".length + layout.extraWidth), 0);
  expect(layout.linkCellRight).toBeLessThanOrEqual(layout.nextCellLeft + 0.5);
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
