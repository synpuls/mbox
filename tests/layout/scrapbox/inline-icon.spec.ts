import { expect, test } from "@playwright/test";
import { openLayoutFixture, routeSvgTestImage, setDoc, setSelection } from "../kit/helpers";

test.beforeEach(async ({ page }) => {
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/**", 32, 32);
});

test("a strong Scrapbox icon is taller than an inline icon and keeps its row height while active", async ({ page }) => {
  const doc = "[demo-user.icon]\n[[demo-user.icon]]\ntrailing";
  await openLayoutFixture(page, { plugins: "scrapboxIcon" });
  await setDoc(page, doc, doc.length, true);
  await expect(page.locator(".mbox-scrapbox-icon-image").first()).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".mbox-scrapbox-icon-image").evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      ),
    )
    .toBe(true);

  const idle = await page.locator(".cm-line").evaluateAll((lines) => lines.slice(0, 2).map((line) => line.getBoundingClientRect().height));
  expect(idle[1]).toBeGreaterThan(idle[0]);

  await setSelection(page, doc.indexOf("[[demo-user.icon]]"));
  const activeHeight = await page.locator(".cm-line").nth(1).evaluate((line) => line.getBoundingClientRect().height);
  expect(Math.abs(activeHeight - idle[1])).toBeLessThanOrEqual(0.5);
});
