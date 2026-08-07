import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, removeHostStyleRules, routeSvgTestImage, setDoc } from "../kit/helpers";

// A GFM table cell holding an image.
//
// Everything here is a COMPARISON, never an absolute pixel count. The library
// guarantees the column reservation and that the picture stays inside the cell;
// how large the picture actually ends up is the host's CSS to decide, and a
// pixel expectation here would be pinning the demo stylesheet rather than the
// library.
//
// mbox's own invention, not GitHub's: GitHub's table is auto-layout and needs
// none of this. See docs/guide.md.

const WIDE = "/__mbox-fixture-image__/wide.svg"; // 900x480
const TALL = "/__mbox-fixture-image__/tall.svg"; // 900x1600

async function routeImages(page: Page): Promise<void> {
  await routeSvgTestImage(page, "**/__mbox-fixture-image__/wide.svg", 900, 480);
  await routeSvgTestImage(page, "**/__mbox-fixture-image__/tall.svg", 900, 1600);
}

/** The grid units the first cell reserved, read off the property the kit sets. */
async function reservedUnits(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cell = document.querySelector<HTMLElement>(".mbox-gfm-table-cell");
    if (!cell) throw new Error("no rendered table cell");
    const value = getComputedStyle(cell).getPropertyValue("--mbox-table-kit-column-width");
    return Number.parseFloat(value);
  });
}

async function firstImageRect(page: Page) {
  return page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>(".mbox-gfm-table-cell .mbox-gfm-image-element");
    if (!image) throw new Error("no image inside a table cell");
    const cell = image.closest<HTMLElement>(".mbox-gfm-table-cell")!;
    const imageRect = image.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    return {
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      cellWidth: cellRect.width,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    };
  });
}

/** Whether any rendered table row is wider than the space it has. */
async function anyRowOverflows(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".mbox-gfm-table-rendered")].some((row) => row.scrollWidth > row.clientWidth + 1),
  );
}

function tableWith(columns: number, cells: string[]): string {
  const header = `| ${Array.from({ length: columns }, (_, index) => `h${index}`).join(" | ")} |`;
  const delimiter = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
  const body = `| ${cells.join(" | ")} |`;
  return `${header}\n${delimiter}\n${body}\ntrailing`;
}

/** Loads a table and waits for its images to finish, so heights are settled. */
async function openTable(page: Page, doc: string): Promise<void> {
  await openLayoutFixture(page, { plugins: "gfmImagePreview" });
  await setDoc(page, doc, doc.length);
  await expect(page.locator(".mbox-gfm-table-cell .mbox-gfm-image-element").first()).toBeVisible();
  await page.evaluate(async () => {
    await Promise.all(
      [...document.querySelectorAll<HTMLImageElement>(".mbox-gfm-image-element")].map((image) =>
        image.complete ? Promise.resolve() : new Promise((resolve) => image.addEventListener("load", resolve, { once: true })),
      ),
    );
  });
}

test.beforeEach(async ({ page }) => {
  await routeImages(page);
});

test("a cell holding an image reserves the configured number of grid units", async ({ page }) => {
  await openTable(page, tableWith(2, [`![alt](${WIDE})`, "b"]));

  // The fixture uses the default, so this is the library's own 32.
  expect(await reservedUnits(page)).toBe(32);
});

test("the picture stays inside its cell", async ({ page }) => {
  await openTable(page, tableWith(2, [`![alt](${WIDE})`, "b"]));
  const { imageWidth, cellWidth } = await firstImageRect(page);

  expect(imageWidth).toBeLessThanOrEqual(cellWidth + 1);
});

test("the picture shrinks as columns are added, and no row ever scrolls sideways", async ({ page }) => {
  const widths: number[] = [];
  for (const columns of [2, 3, 5]) {
    const cells = [`![alt](${WIDE})`, ...Array.from({ length: columns - 1 }, (_, index) => `c${index}`)];
    await openTable(page, tableWith(columns, cells));
    widths.push((await firstImageRect(page)).imageWidth);
    expect(await anyRowOverflows(page), `a row overflowed at ${columns} columns`).toBe(false);
  }

  // Monotonic, not "equal to some number": the numbers depend on host CSS, the
  // direction does not.
  expect(widths[1]).toBeLessThan(widths[0]!);
  expect(widths[2]).toBeLessThan(widths[1]!);
});

test("a tall picture stops at the height cap without being cropped", async ({ page }) => {
  await openTable(page, tableWith(2, [`![alt](${TALL})`, "b"]));
  const { imageWidth, imageHeight, naturalWidth, naturalHeight } = await firstImageRect(page);

  const cap = await page.evaluate(() => {
    const image = document.querySelector<HTMLElement>(".mbox-gfm-table-cell .mbox-gfm-image-element")!;
    return Number.parseFloat(getComputedStyle(image).maxHeight);
  });

  expect(imageHeight).toBeCloseTo(cap, 0);
  // The ratio is the proof it shrank rather than being cut off.
  expect(imageWidth / imageHeight).toBeCloseTo(naturalWidth / naturalHeight, 1);
});

test("a host can lower the height cap, and the picture keeps its proportions", async ({ page }) => {
  await openTable(page, tableWith(2, [`![alt](${TALL})`, "b"]));
  const before = await firstImageRect(page);

  await page.addStyleTag({ content: "#editor { --mbox-gfm-table-image-max-height: 96px; }" });
  const after = await firstImageRect(page);

  expect(after.imageHeight).toBeLessThan(before.imageHeight);
  expect(after.imageHeight).toBeCloseTo(96, 0);
  expect(after.imageWidth / after.imageHeight).toBeCloseTo(after.naturalWidth / after.naturalHeight, 1);
});

test("several pictures in one cell reserve the same column as one, and do not overflow", async ({ page }) => {
  await openTable(page, tableWith(2, [`![a](${WIDE})`, "b"]));
  const single = await reservedUnits(page);

  await openTable(page, tableWith(2, [`![a](${WIDE})![b](${WIDE})`, "b"]));

  expect(await reservedUnits(page)).toBe(single);
  expect(await anyRowOverflows(page)).toBe(false);
});

test("the picture fits the cell even with the host's own image rules removed", async ({ page }) => {
  await openTable(page, tableWith(2, [`![alt](${WIDE})`, "b"]));

  // demos/styles.css sizes preview images too -- BOTH the figure and the img.
  // Removing only the figure rule leaves the demo's `max-width: 100%` on the
  // img doing the library's job, and this spec would stay green with the
  // library's own cap deleted. (It did, until the img rule was removed here
  // as well.) Overriding instead of removing would silence it differently.
  const removed =
    (await removeHostStyleRules(page, ".mbox-gfm-image-preview")) + (await removeHostStyleRules(page, ".mbox-gfm-image-element"));
  expect(removed, "the host stylesheet had no image rule to remove").toBeGreaterThan(0);

  const { imageWidth, cellWidth } = await firstImageRect(page);
  expect(imageWidth).toBeLessThanOrEqual(cellWidth + 1);
});

test("an active row shows its raw source and keeps its height", async ({ page }) => {
  const doc = tableWith(2, [`![alt](${WIDE})`, "b"]);
  await openTable(page, doc);

  const idleHeight = await page.locator(".cm-line").nth(2).evaluate((line) => line.getBoundingClientRect().height);

  // Put the caret on the image row.
  const rowStart = doc.indexOf(`| ![alt](${WIDE})`);
  await setDoc(page, doc, rowStart + 2);

  // Strict equality on textContent: toHaveText collapses whitespace, and the
  // padding around a cell is exactly what has to come back.
  const raw = await page.locator(".cm-line").nth(2).evaluate((line) => line.textContent);
  expect(raw).toBe(`| ![alt](${WIDE}) | b |`);

  // The hidden measure figure keeps the row's height; without it the row
  // collapses to a text line and everything below jumps. It settles once the
  // observer has applied the cancelling margin.
  await expect
    .poll(async () => {
      const height = await page.locator(".cm-line").nth(2).evaluate((line) => line.getBoundingClientRect().height);
      return Math.abs(height - idleHeight) / idleHeight;
    })
    .toBeLessThan(0.1);
});

test("the measure figure on an active row takes no inline space", async ({ page }) => {
  const doc = tableWith(2, [`![alt](${WIDE})`, "b"]);
  await openTable(page, doc);
  const rowStart = doc.indexOf(`| ![alt](${WIDE})`);
  await setDoc(page, doc, rowStart + 2);

  // The cancelling margin is applied by a ResizeObserver, so it lands a frame
  // after the row becomes active -- poll rather than read once.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const figure = document.querySelector<HTMLElement>(".mbox-gfm-image-measure");
        if (!figure) throw new Error("no measure figure on the active row");
        const style = getComputedStyle(figure);
        // `marginInlineEnd` is not reported by every engine's computed style;
        // the physical side is, and this suite runs left-to-right.
        const margin = Number.parseFloat(style.marginInlineEnd || style.marginRight || "0");
        return Math.abs(figure.getBoundingClientRect().width + margin);
      }),
    )
    .toBeLessThan(2);
});

// The crossing with a link-wrapped image, decided rather than left to chance.
test("a link-wrapped image in a cell reserves its column and stays inside it", async ({ page }) => {
  await openTable(page, tableWith(2, [`[![alt](${WIDE})](https://e.test/page)`, "b"]));

  expect(await reservedUnits(page)).toBe(32);
  const { imageWidth, cellWidth } = await firstImageRect(page);
  expect(imageWidth).toBeLessThanOrEqual(cellWidth + 1);
  expect(await anyRowOverflows(page)).toBe(false);
});

test("a link-wrapped image in a cell does NOT reserve the row's height while editing", async ({ page }) => {
  // Pinned as a known limitation, not as a desired shape. A bare image in a
  // cell keeps its row's height through the image plugin's hidden measure
  // figure, which is built from the parser's image list. An image inside a link
  // label is not in that list -- the link owns the whole run -- and the link
  // plugin builds no measure figure, so the row loses its picture's height the
  // moment the caret arrives. (The cell's reservation is a separate flag and
  // does count this image; the two records are not the same thing.)
  //
  // A reader who fixes this should delete this test, not adjust it.
  const doc = tableWith(2, [`[![alt](${WIDE})](https://e.test/page)`, "b"]);
  await openTable(page, doc);
  const idleHeight = await page.locator(".cm-line").nth(2).evaluate((line) => line.getBoundingClientRect().height);

  await setDoc(page, doc, doc.indexOf("| [![alt]") + 2);

  const activeHeight = await page.locator(".cm-line").nth(2).evaluate((line) => line.getBoundingClientRect().height);
  expect(activeHeight).toBeLessThan(idleHeight * 0.9);
});
