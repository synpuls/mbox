import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, routeSvgTestImage, setDoc } from "../kit/helpers";

// A Scrapbox table cell holding an icon image.
//
// This fixes the host/library interaction selected by the owner on 2026-07-31.
// The measurements are deliberately relative:
// table-kit owns the `ch` reservation, while the host gives that reservation a
// box and the link theme gives an icon its 1em height.
//
// In particular, these fixtures measure a HOST contract, not a library
// contract. The host cell adds 5ch of width and 1ch horizontal padding on each
// side. A one-character icon name reserves only 1ch; that is narrower than a
// 1em image (roughly 1ch ~= 0.6em in a monospace font). Thus a 32x32 square
// icon happens to fit here because of the host box, not because mbox reserved
// enough width for it. The resolver receives the full path, but the image alt
// text and table reservation use only its final segment; this deliberate
// split is itself the 4-4 measurement subject.

function tableWithIcon(icon: string): string {
  return `table:icons\n ${icon}\tb\n c\td\ntrailing`;
}

async function openTable(page: Page, doc: string): Promise<void> {
  await openLayoutFixture(page, { plugins: "scrapboxIcon" });
  // Keep the table idle so its rendered cells (not raw source) are observed.
  await setDoc(page, doc, doc.length);
  await expect(page.locator(".mbox-scrapbox-table-cell .mbox-scrapbox-icon-image").first()).toBeVisible();
  await page.evaluate(async () => {
    await Promise.all(
      [...document.querySelectorAll<HTMLImageElement>(".mbox-scrapbox-icon-image")].map((image) =>
        image.complete ? Promise.resolve() : new Promise((resolve) => image.addEventListener("load", resolve, { once: true })),
      ),
    );
  });
}

async function reservedUnits(page: Page, iconName: string): Promise<number> {
  return page.evaluate((name) => {
    const image = document.querySelector<HTMLImageElement>(`.mbox-scrapbox-icon-image[alt="${name}"]`);
    const cell = image?.closest<HTMLElement>(".mbox-scrapbox-table-cell");
    if (!cell) throw new Error(`no rendered table cell for ${name}`);
    return Number.parseFloat(getComputedStyle(cell).getPropertyValue("--mbox-table-kit-column-width"));
  }, iconName);
}

async function iconAndCellRight(page: Page, iconName: string) {
  return page.evaluate((name) => {
    const image = document.querySelector<HTMLImageElement>(`.mbox-scrapbox-icon-image[alt="${name}"]`);
    const cell = image?.closest<HTMLElement>(".mbox-scrapbox-table-cell");
    if (!image || !cell) throw new Error(`no rendered icon cell for ${name}`);
    return { imageRight: image.getBoundingClientRect().right, cellRight: cell.getBoundingClientRect().right };
  }, iconName);
}

test.beforeEach(async ({ page }) => {
  // This is the URL form the fixture's Scrapbox icon resolver emits. The names
  // select independent routes, allowing the same spec to observe both aspect
  // ratios without ever reaching the network.
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/a.svg", 32, 32);
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/square.svg", 32, 32);
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/wide.svg", 120, 10);
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/alice%2Fabcdefghijklmnopqrstuvwx.svg", 32, 32);
});

test("short and long icon names reserve their final-segment widths in separate tables", async ({ page }) => {
  await openTable(page, tableWithIcon("[a.icon]"));
  expect(await reservedUnits(page, "a")).toBe(1);

  // This must be another table: sharing a column would make table-kit's max
  // reservation hide the short name's 1ch result.
  await openTable(page, tableWithIcon("[alice/abcdefghijklmnopqrstuvwx.icon]"));
  // The resolver route above receives the full `alice/...` path, but `alt`
  // and the table's reservation use the final segment only.
  expect(await reservedUnits(page, "abcdefghijklmnopqrstuvwx")).toBe(24);
});

test("a square icon's right edge is recorded against its cell", async ({ page }) => {
  // 32x32 SVG, `height: 1em; width: auto`; measured right edges:
  // chromium 69.02 / 144.33, firefox 69.03 / 144.37,
  // webkit 69.27 / 146.98 (imageRight / cellRight).
  // It fits under this fixture's host-cell contract; see the file comment.
  await openTable(page, tableWithIcon("[square.icon]"));
  const measured = await iconAndCellRight(page, "square");
  console.log("Scrapbox table square icon/cell right edges", measured);

  expect(measured.imageRight).toBeLessThanOrEqual(measured.cellRight + 1);
});

test("an extremely wide icon crosses its cell's right edge", async ({ page }) => {
  // This overflow is intentionally accepted. On 2026-07-31, the owner chose
  // not to add a minimum reservation, scale images inside cells, or
  // recalculate columns after loading. Keep this assertion; changing it
  // requires a new owner decision and an updated decision record.
  // 120x10 SVG, `height: 1em; width: auto`; measured right edges:
  // chromium 234.02 / 126.27, firefox 234.03 / 126.30,
  // webkit 234.27 / 128.44 (imageRight / cellRight). The image extends about
  // 106--108px beyond the cell and is nearly twice its width.
  await openTable(page, tableWithIcon("[wide.icon]"));
  const measured = await iconAndCellRight(page, "wide");
  console.log("Scrapbox table wide icon/cell right edges", measured);

  expect(measured.imageRight).toBeGreaterThan(measured.cellRight + 1);
});
