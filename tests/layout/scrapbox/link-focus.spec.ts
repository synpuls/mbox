import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc } from "../kit/helpers";

test("a page link keeps its link color while its line is focused", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "[Page]", 0);

  const line = page.locator(".cm-line").first();
  await expect(line).toHaveText("[Page]");
  await expect(line.locator(".mbox-scrapbox-link")).toHaveText("[Page]");
});

test("a src-first bracketed external link keeps its link color while focused", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "[https://e.com label]", 0);

  await expect(page.locator(".cm-line").first().locator(".mbox-scrapbox-url")).toHaveText(
    "[https://e.com label]",
  );
});

test("a link-first bracketed external link keeps its link color while focused", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "[label https://e.com]", 0);

  await expect(page.locator(".cm-line").first().locator(".mbox-scrapbox-url")).toHaveText(
    "[label https://e.com]",
  );
});

test("a hashtag keeps its link color while focused", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "a #tag", 0);

  const line = page.locator(".cm-line").first();
  await expect(line).toHaveText("a #tag");
  await expect(line.locator(".mbox-scrapbox-hashtag")).toHaveText("#tag");
});
