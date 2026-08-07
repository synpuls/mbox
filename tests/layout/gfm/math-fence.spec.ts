import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc } from "../kit/helpers";
import { openPlayground, setPlaygroundDoc, setPlaygroundSelection } from "../kit/playground-helpers";

test("an idle math fence renders once as a math widget and restores its raw source on focus", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "```math\nx^2\n```\nplain";

  // Keep the fence inactive to exercise the demo's injected KaTeX renderer.
  await setPlaygroundDoc(page, "gfm", doc, doc.indexOf("plain"), true);
  await expect(page.locator("#editor .mbox-gfm-math .katex")).toBeVisible();
  await expect(page.locator("#editor .mbox-gfm-code-block")).toHaveCount(0);

  await setPlaygroundSelection(page, "gfm", doc.indexOf("x^2"));
  await expect(page.locator("#editor .mbox-gfm-math")).toHaveCount(0);
  await expect(page.locator("#editor .cm-line").nth(0)).toHaveText("```math");
  await expect(page.locator("#editor .cm-line").nth(1)).toHaveText("x^2");
  await expect(page.locator("#editor .cm-line").nth(2)).toHaveText("```");
});

test("line numbers stay aligned with a hidden math fence's widget and following source line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  const doc = "```math\nx^2\n```\nplain";
  await setDoc(page, doc, doc.length, true);

  await expect(page.locator("#editor .mbox-gfm-math")).toBeVisible();
  const alignment = await page.evaluate(() => {
    const sourceLineTop = (text: string) => {
      const line = [...document.querySelectorAll<HTMLElement>("#editor .cm-line")].find((candidate) => candidate.textContent === text);
      if (!line) throw new Error(`Missing line: ${text}`);
      return line.getBoundingClientRect().top;
    };
    const math = document.querySelector<HTMLElement>("#editor .mbox-gfm-math");
    const mathLine = math?.closest<HTMLElement>(".cm-line");
    if (!mathLine) throw new Error("Missing math line");
    const gutterTop = (number: string) => {
      const gutter = [...document.querySelectorAll<HTMLElement>("#editor .cm-lineNumbers .cm-gutterElement")].find(
        (candidate) => candidate.textContent === number,
      );
      if (!gutter) throw new Error(`Missing line number: ${number}`);
      return gutter.getBoundingClientRect().top;
    };
    return { math: [mathLine.getBoundingClientRect().top, gutterTop("1")], plain: [sourceLineTop("plain"), gutterTop("4")] };
  });

  expect(alignment.math[0]).toBeCloseTo(alignment.math[1], 0);
  expect(alignment.plain[0]).toBeCloseTo(alignment.plain[1], 0);
});

// Intentionally unrun in this change: the Section 8 workflow requires the DOM
// contract above to establish the concrete markup before layout coverage, and
// forbids running Playwright. Keep the cursor on the final plain line, matching
// the established inactive-fence layout setup.
test("a blockquoted math fence renders its widget without disturbing the following line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  const doc = "> ```math\n> x^2\n> ```\nplain";
  await setDoc(page, doc, doc.length, true);

  await expect(page.locator("#editor .mbox-gfm-math")).toBeVisible();
  await expect(page.locator("#editor .cm-line").last()).toHaveText("plain");
});

test("inline math remains on the sentence's visual line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  // Short on purpose. A sentence long enough to soft-wrap puts `after` on the
  // next visual line even when the math is correctly inline (measured: 20 vs
  // 83), so a wrapping fixture would fail on a working implementation.
  const doc = "before $`x^2`$ after";
  // Leave the editor unfocused so the entire sentence remains in its rendered
  // (rather than active-source) form.
  await setDoc(page, doc, 0, false);

  const rects = await page.evaluate(({ before, after }) => {
    const fixture = window.__mboxLayoutFixture;
    const beforeRect = fixture?.coordsAtPos(before);
    const afterRect = fixture?.coordsAtPos(after);
    if (!beforeRect || !afterRect) throw new Error("Missing caret coordinates");
    return {
      before: { top: beforeRect.top, bottom: beforeRect.bottom },
      after: { top: afterRect.top, bottom: afterRect.bottom },
    };
  }, { before: 0, after: doc.indexOf("after") });

  // Text sharing a line box shares a caret top: measured, both rects are
  // {20, 37} when the math is inline, and {20, 37} vs {62, 79} when it is not.
  // Overlap would be too weak — two adjacent rows touch at a single edge and
  // would satisfy it.
  expect(Math.abs(rects.before.top - rects.after.top)).toBeLessThan(1);
});

// Intentionally unrun in this change: happy-dom has no layout engine, and the
// requested workflow forbids Playwright. When run in Chromium this records the
// actual pixel values for the renderer-height/table interaction rather than
// relying on a DOM-only approximation.
test("a tall inline math renderer in a table raises its row without changing source-sized columns", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  const doc = "| $`tall`$ | x |\n| --- | --- |\n| y | z |\n\nplain";
  // Match the established table-layout fixtures: keep the entire table
  // inactive so its rendered rows, rather than its raw source, are measured.
  await setDoc(page, doc, doc.length, true);

  const measured = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("#editor .mbox-gfm-table-header");
    const body = document.querySelector<HTMLElement>("#editor .mbox-gfm-table-row");
    if (!header || !body) throw new Error("Missing measured table rows");
    const cells = [...header.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];
    const math = header.querySelector<HTMLElement>(".mbox-gfm-math");
    if (cells.length !== 2 || !math) throw new Error("Missing measured math fixture");
    const headerRect = header.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    return {
      headerHeight: headerRect.height,
      bodyHeight: bodyRect.height,
      bodyTop: bodyRect.top,
      headerBottom: headerRect.bottom,
      mathHeight: math.getBoundingClientRect().height,
      sameRowCellTops: cells.map((cell) => cell.getBoundingClientRect().top),
      columnWidths: cells.map((cell) => cell.getBoundingClientRect().width),
      sourceColumnWidths: cells.map((cell) => cell.style.getPropertyValue("--mbox-table-kit-column-width")),
    };
  });

  expect(measured.mathHeight).toBeGreaterThan(0);
  expect(measured.headerHeight).toBeGreaterThan(measured.bodyHeight);
  expect(measured.bodyTop).toBeGreaterThanOrEqual(measured.headerBottom);
  // A zero-digit tolerance permits browser sub-pixel rounding (under 0.5px)
  // while still requiring both flex cells to start on the same rendered row.
  expect(measured.sameRowCellTops[0]).toBeCloseTo(measured.sameRowCellTops[1], 0);
  expect(measured.columnWidths[0]).toBeGreaterThan(measured.columnWidths[1]);
  expect(measured.sourceColumnWidths).toEqual(["4ch", "1ch"]);
});

test("scrollIntoView accepts a position on a hidden math-fence line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  const before = Array.from({ length: 80 }, (_, index) => `before ${index}`).join("\n");
  const after = Array.from({ length: 80 }, (_, index) => `after ${index}`).join("\n");
  const doc = `${before}\n\`\`\`math\nx^2\n\`\`\`\n${after}`;
  const hiddenPosition = doc.indexOf("x^2");
  await setDoc(page, doc, doc.length, true);

  const result = await page.evaluate((position) => {
    const fixture = window.__mboxLayoutFixture;
    if (!fixture) throw new Error("Layout fixture is unavailable");
    fixture.scrollIntoView(position);
    const scrollDOM = document.querySelector<HTMLElement>("#editor .cm-scroller");
    const math = document.querySelector<HTMLElement>("#editor .mbox-gfm-math");
    if (!scrollDOM || !math) throw new Error("Math fixture did not render");
    const scrollRect = scrollDOM.getBoundingClientRect();
    const mathRect = math.getBoundingClientRect();
    return {
      doc: fixture.view && (fixture.view as { state: { doc: { toString: () => string } } }).state.doc.toString(),
      scrollTop: scrollDOM.scrollTop,
      maxScrollTop: scrollDOM.scrollHeight - scrollDOM.clientHeight,
      mathInView: mathRect.bottom >= scrollRect.top && mathRect.top <= scrollRect.bottom,
    };
  }, hiddenPosition);

  expect(result.doc).toBe(doc);
  expect(result.scrollTop).toBeGreaterThanOrEqual(0);
  expect(result.scrollTop).toBeLessThanOrEqual(result.maxScrollTop);
  expect(result.mathInView).toBe(true);
});
