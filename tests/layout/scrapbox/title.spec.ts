import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc } from "../kit/helpers";

test("the title line is only the document's first line, and only with titleLine: true", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxTitleLine" });
  await setDoc(page, "Title\nbody\nmore", 0, false);

  const lines = page.locator(".cm-line");
  await expect(lines.nth(0)).toHaveClass(/mbox-scrapbox-title-line/);
  await expect(lines.nth(1)).not.toHaveClass(/mbox-scrapbox-title-line/);
  await expect(lines.nth(2)).not.toHaveClass(/mbox-scrapbox-title-line/);
});

test("the title line renders larger, bolder, and with extra room before the body", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxTitleLine" });
  await setDoc(page, "Title\nbody", 0, false);

  const lines = page.locator(".cm-line");
  const titleFontSize = await lines.nth(0).evaluate((el) => getComputedStyle(el).fontSize);
  const bodyFontSize = await lines.nth(1).evaluate((el) => getComputedStyle(el).fontSize);
  const titleFontWeight = await lines.nth(0).evaluate((el) => getComputedStyle(el).fontWeight);
  const titlePaddingBottom = await lines.nth(0).evaluate((el) => getComputedStyle(el).paddingBottom);

  expect(parseFloat(titleFontSize)).toBeGreaterThan(parseFloat(bodyFontSize));
  expect(titleFontWeight).toBe("700");
  expect(parseFloat(titlePaddingBottom)).toBeGreaterThan(0);
});

test("scrapboxPlugins() does not add the title line class without titleLine: true", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "Title\nbody", 0, false);

  await expect(page.locator(".cm-line").first()).not.toHaveClass(/mbox-scrapbox-title-line/);
});
