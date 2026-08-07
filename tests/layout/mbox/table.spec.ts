import { expect, test } from "@playwright/test";
import { expectFirstLineHeightStableBetweenFocusedAndUnfocused, openLayoutFixture, setDoc } from "../kit/helpers";

test("table header line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "| A | B |\n| --- | --- |\n| x | y |\nplain", 1, 38);
});

test("Japanese cells reserve their two-ch-per-character column width without crossing into the next column", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "| 日本 | B |\n| --- | --- |\n| A | C |", 0, false);

  const layout = await page.locator("#editor .mbox-table-header").evaluate((row) => {
    const cells = [...row.querySelectorAll<HTMLElement>(".mbox-table-cell")];
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
    const extraWidth = getComputedStyle(japaneseCell).getPropertyValue("--mbox-table-column-extra-width").trim();
    if (!extraWidth.endsWith("ch")) throw new Error("Expected table cell extra width to be expressed in ch");
    const extraWidthCh = Number.parseFloat(extraWidth);
    if (!Number.isFinite(extraWidthCh)) throw new Error("Expected table cell extra width to be numeric");

    return { chWidth, extraWidthCh, japaneseCellWidth: japaneseRect.width, nextCellLeft: nextRect.left, japaneseCellRight: japaneseRect.right };
  });

  // Two Japanese characters reserve 4ch; measure the demo cell chrome separately.
  expect(layout.japaneseCellWidth).toBeCloseTo(layout.chWidth * (4 + layout.extraWidthCh), 0);
  expect(layout.japaneseCellRight).toBeLessThanOrEqual(layout.nextCellLeft + 0.5);
});

test("table columns keep their computed widths without the demo stylesheet", async ({ page }) => {
  await openLayoutFixture(page);
  const doc = "| A | Much longer |\n| --- | --- |\n| x | y |\nplain";
  await setDoc(page, doc, doc.length, false);

  const disabledStylesheets = await page.evaluate(() => {
    const demoSheets = Array.from(document.styleSheets).filter((sheet) => {
      if (sheet.href?.endsWith("/demos/styles.css")) return true;
      const owner = sheet.ownerNode;
      return owner instanceof HTMLElement && owner.dataset.viteDevId?.endsWith("/demos/styles.css");
    });
    for (const sheet of demoSheets) sheet.disabled = true;
    return { count: demoSheets.length, allDisabled: demoSheets.every((sheet) => sheet.disabled) };
  });
  expect(disabledStylesheets.count, "demos/styles.css did not produce a stylesheet to disable").toBeGreaterThan(0);
  expect(disabledStylesheets.allDisabled).toBe(true);

  const widths = await page.evaluate(() => {
    const headerCells = [...document.querySelectorAll<HTMLElement>(".mbox-table-header .mbox-table-cell")];
    const bodyCells = [...document.querySelectorAll<HTMLElement>(".mbox-table-row .mbox-table-cell")];
    if (headerCells.length !== 2 || bodyCells.length !== 2) {
      throw new Error("Expected two rendered cells in both the header and body row");
    }
    return {
      header: headerCells.map((cell) => cell.getBoundingClientRect().width),
      body: bodyCells.map((cell) => cell.getBoundingClientRect().width),
    };
  });

  expect(widths.header[0]).toBeCloseTo(widths.body[0]!, 5);
  expect(widths.header[1]).toBeCloseTo(widths.body[1]!, 5);
  expect(widths.header[0]).not.toBeCloseTo(widths.header[1]!, 1);
});

test("extra wide table rows wrap without making the rendered table wider than the editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(
    page,
    [
      "| 記法 | 状態 |",
      "| --- | --- |",
      "| table | 最小対応 |",
      "| code block code block code block code block code block code block code block code block code block code block code block code block code block code block code block code block code block code block code block | syntax highlight |",
    ].join("\n"),
    0,
    false,
  );

  const layout = await page.locator("#editor .mbox-table-row").last().evaluate((row) => {
    const editor = document.querySelector("#editor .cm-content");
    const scroller = document.querySelector("#editor .cm-scroller");
    const cells = [...row.querySelectorAll(".mbox-table-cell")];
    const longCell = cells.find((cell) =>
      cell.textContent?.includes("code block code block"),
    );

    if (
      !(editor instanceof HTMLElement) ||
      !(scroller instanceof HTMLElement) ||
      !(longCell instanceof HTMLElement) ||
      cells.length === 0
    ) {
      throw new Error("Expected editor, scroller, and table cells to exist");
    }

    const range = document.createRange();
    range.selectNodeContents(longCell);
    const textRects = [...range.getClientRects()];
    const textLineTops = textRects.map((rect) => Math.round(rect.top));
    const textLeft = Math.min(...textRects.map((rect) => rect.left));
    const textRight = Math.max(...textRects.map((rect) => rect.right));
    const cellRects = cells.map((cell) => cell.getBoundingClientRect());
    const cellTops = cellRects.map((rect) => Math.round(rect.top));
    const tableLeft = Math.min(...cellRects.map((rect) => rect.left));
    const tableRight = Math.max(...cellRects.map((rect) => rect.right));
    const editorRect = editor.getBoundingClientRect();

    return {
      cellLineCount: new Set(cellTops).size,
      editorRight: editorRect.right,
      editorWidth: editorRect.width,
      lineCount: new Set(textLineTops).size,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      tableRight,
      tableVisualWidth: tableRight - tableLeft,
      textRight,
      textVisualWidth: textRight - textLeft,
    };
  });

  expect(layout.cellLineCount).toBe(1);
  expect(layout.tableVisualWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.textVisualWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.tableRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.textRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.scrollerScrollWidth).toBeLessThanOrEqual(layout.scrollerClientWidth);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageClientWidth);
  expect(layout.lineCount).toBeGreaterThan(1);
});

test("long space-separated table cells wrap without horizontal overflow", async ({ page }) => {
  await openLayoutFixture(page);
  const longCell =
    "code blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode be blode blode blode blode blode blode blode blode block";
  await setDoc(
    page,
    [
      "| 記法 | 状態 |",
      "| --- | --- |",
      "| table | 最小対応 |",
      `| ${longCell} | syntax highlight |`,
    ].join("\n"),
    0,
    false,
  );

  const layout = await page.locator("#editor .mbox-table-row").last().evaluate((row, expectedLongCell) => {
    const editor = document.querySelector("#editor .cm-content");
    const scroller = document.querySelector("#editor .cm-scroller");
    const cells = [...row.querySelectorAll(".mbox-table-cell")];
    const longCellElement = cells.find((cell) => cell.textContent?.includes(expectedLongCell));

    if (
      !(editor instanceof HTMLElement) ||
      !(scroller instanceof HTMLElement) ||
      !(longCellElement instanceof HTMLElement) ||
      cells.length === 0
    ) {
      throw new Error("Expected editor, scroller, and table cells to exist");
    }

    const textNode = [...longCellElement.childNodes].find((node) => node.textContent?.includes(expectedLongCell));
    if (!textNode?.textContent) {
      throw new Error("Expected long cell text node to exist");
    }

    const textStart = textNode.textContent.indexOf(expectedLongCell);
    const range = document.createRange();
    range.setStart(textNode, textStart);
    range.setEnd(textNode, textStart + expectedLongCell.length);
    const textRects = [...range.getClientRects()];
    const textLineTops = textRects.map((rect) => Math.round(rect.top));
    const textLineLefts = new Map<number, number>();
    for (const rect of textRects) {
      const top = Math.round(rect.top);
      textLineLefts.set(top, Math.min(textLineLefts.get(top) ?? Number.POSITIVE_INFINITY, rect.left));
    }
    const textWrappedLineLefts = [...textLineLefts.values()];
    const textLeft = Math.min(...textRects.map((rect) => rect.left));
    const textRight = Math.max(...textRects.map((rect) => rect.right));
    const cellRects = cells.map((cell) => cell.getBoundingClientRect());
    const cellTops = cellRects.map((rect) => rect.top);
    const cellBottoms = cellRects.map((rect) => rect.bottom);
    const tableLeft = Math.min(...cellRects.map((rect) => rect.left));
    const tableRight = Math.max(...cellRects.map((rect) => rect.right));
    const editorRect = editor.getBoundingClientRect();

    return {
      cellBottomDelta: Math.max(...cellBottoms) - Math.min(...cellBottoms),
      cellTopDelta: Math.max(...cellTops) - Math.min(...cellTops),
      editorRight: editorRect.right,
      editorWidth: editorRect.width,
      lineCount: new Set(textLineTops).size,
      textContent: longCellElement.textContent,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      tableRight,
      tableVisualWidth: tableRight - tableLeft,
      textRight,
      textVisualWidth: textRight - textLeft,
      textWrappedLineLeftDelta: Math.max(...textWrappedLineLefts) - Math.min(...textWrappedLineLefts),
    };
  }, longCell);

  expect(layout.textContent).toBe(longCell);
  expect(layout.tableVisualWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.textVisualWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.tableRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.textRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.scrollerScrollWidth).toBeLessThanOrEqual(layout.scrollerClientWidth);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageClientWidth);
  expect(layout.lineCount).toBeGreaterThan(1);
  expect(layout.textWrappedLineLeftDelta).toBeLessThanOrEqual(0.5);
  expect(layout.cellTopDelta).toBeLessThanOrEqual(0.5);
  expect(layout.cellBottomDelta).toBeLessThanOrEqual(0.5);
});


test("long URL table cells wrap without horizontal overflow", async ({ page }) => {
  await openLayoutFixture(page);
  const longURL =
    "https://example.com/very/long/path/that/should/wrap/inside/the/table/cell/without/creating/horizontal/overflow";
  await setDoc(
    page,
    [
      "| URL | 状態 |",
      "| --- | --- |",
      `| ${longURL} | ok |`,
    ].join("\n"),
    0,
    false,
  );

  const layout = await page.locator("#editor .mbox-table-row").last().evaluate((row, expectedLongURL) => {
    const editor = document.querySelector("#editor .cm-content");
    const scroller = document.querySelector("#editor .cm-scroller");
    const cells = [...row.querySelectorAll(".mbox-table-cell")];
    const longCellElement = cells.find((cell) => cell.textContent?.includes(expectedLongURL));

    if (
      !(editor instanceof HTMLElement) ||
      !(scroller instanceof HTMLElement) ||
      !(longCellElement instanceof HTMLElement) ||
      cells.length === 0
    ) {
      throw new Error("Expected editor, scroller, and table cells to exist");
    }

    const textNode = [...longCellElement.childNodes].find((node) => node.textContent?.includes(expectedLongURL));
    if (!textNode?.textContent) {
      throw new Error("Expected long URL cell text node to exist");
    }

    const textStart = textNode.textContent.indexOf(expectedLongURL);
    const range = document.createRange();
    range.setStart(textNode, textStart);
    range.setEnd(textNode, textStart + expectedLongURL.length);
    const textRects = [...range.getClientRects()];
    const textLineLefts = new Map<number, number>();
    for (const rect of textRects) {
      const top = Math.round(rect.top);
      textLineLefts.set(top, Math.min(textLineLefts.get(top) ?? Number.POSITIVE_INFINITY, rect.left));
    }
    const textWrappedLineLefts = [...textLineLefts.values()];
    const cellRects = cells.map((cell) => cell.getBoundingClientRect());
    const cellTops = cellRects.map((rect) => rect.top);
    const cellBottoms = cellRects.map((rect) => rect.bottom);
    const tableLeft = Math.min(...cellRects.map((rect) => rect.left));
    const tableRight = Math.max(...cellRects.map((rect) => rect.right));
    const textRight = Math.max(...textRects.map((rect) => rect.right));
    const editorRect = editor.getBoundingClientRect();

    return {
      cellBottomDelta: Math.max(...cellBottoms) - Math.min(...cellBottoms),
      cellTopDelta: Math.max(...cellTops) - Math.min(...cellTops),
      editorRight: editorRect.right,
      editorWidth: editorRect.width,
      lineCount: textWrappedLineLefts.length,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
      tableRight,
      tableVisualWidth: tableRight - tableLeft,
      textContent: longCellElement.textContent,
      textRight,
      textWrappedLineLeftDelta: Math.max(...textWrappedLineLefts) - Math.min(...textWrappedLineLefts),
    };
  }, longURL);

  expect(layout.textContent).toBe(longURL);
  expect(layout.tableVisualWidth).toBeLessThanOrEqual(layout.editorWidth);
  expect(layout.tableRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.textRight).toBeLessThanOrEqual(layout.editorRight);
  expect(layout.scrollerScrollWidth).toBeLessThanOrEqual(layout.scrollerClientWidth);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageClientWidth);
  expect(layout.lineCount).toBeGreaterThan(1);
  expect(layout.textWrappedLineLeftDelta).toBeLessThanOrEqual(0.5);
  expect(layout.cellTopDelta).toBeLessThanOrEqual(0.5);
  expect(layout.cellBottomDelta).toBeLessThanOrEqual(0.5);
});


test("focused extra wide table rows do not create horizontal editor overflow", async ({ page }) => {
  await openLayoutFixture(page);
  const doc = [
    "| 記法 | 状態 |",
    "| --- | --- |",
    "| table | 最小対応 |",
    "| code blocode blocode blocode blocode blocode blocode blocode blocode blocode block | syntax hightax hightax hightax hightax hightax hightax hightax hightax highlight |",
  ].join("\n");
  await setDoc(page, doc, doc.indexOf("syntax hightax"), true);

  const layout = await page.locator("#editor .mbox-table-row").last().evaluate((row) => {
    const scroller = document.querySelector("#editor .cm-scroller");
    const cells = [...row.querySelectorAll(".mbox-table-cell")];
    const secondCell = cells[1];

    if (!(scroller instanceof HTMLElement) || !(secondCell instanceof HTMLElement)) {
      throw new Error("Expected scroller and focused table cells to exist");
    }

    const cellRects = cells.map((cell) => cell.getBoundingClientRect());
    const cellTops = cellRects.map((rect) => Math.round(rect.top));
    const secondCellRange = document.createRange();
    secondCellRange.selectNodeContents(secondCell);
    const secondCellLineTops = [...secondCellRange.getClientRects()].map((rect) => Math.round(rect.top));

    return {
      rendered: row.classList.contains("mbox-table-rendered"),
      rawCellCount: cells.filter((cell) => cell.classList.contains("mbox-table-raw-cell")).length,
      cellLineCount: new Set(cellTops).size,
      secondCellLineCount: new Set(secondCellLineTops).size,
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
    };
  });

  expect(layout.rendered).toBe(false);
  expect(layout.rawCellCount).toBe(2);
  expect(layout.cellLineCount).toBeGreaterThan(1);
  expect(layout.secondCellLineCount).toBeGreaterThanOrEqual(1);
  expect(layout.scrollerScrollWidth).toBeLessThanOrEqual(layout.scrollerClientWidth);
});
