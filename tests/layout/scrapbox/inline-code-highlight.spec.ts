import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc } from "../kit/helpers";

test("inline code is highlighted as Ruby once loaded", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxInlineCodeHighlight" });
  await setDoc(page, "`describe User do`", 0, false);

  const keyword = page.locator(".mbox-scrapbox-code-token.tok-keyword");
  await expect(keyword).toHaveText("do");
});

test("scrapboxPlugins() does not highlight inline code without inlineCodeHighlight: true", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "`describe User do`", 0, false);

  // The highlighter is opt-in, so this configuration has no asynchronous
  // language-loading path. Wait for the ordinary inline-code decoration to
  // prove the document update has rendered before checking the absent token.
  await expect(page.locator(".mbox-scrapbox-code")).toHaveText("describe User do");
  await expect(page.locator(".mbox-scrapbox-code-token")).toHaveCount(0);
});

test("inline code keeps token colors and literal backticks on the active line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxInlineCodeHighlight" });
  await setDoc(page, "`describe User do`", 0, false);
  await expect(page.locator(".mbox-scrapbox-code-token.tok-keyword")).toHaveCount(1);

  await page.locator(".cm-content").click();

  await expect(page.locator(".mbox-scrapbox-code-token.tok-keyword")).toHaveText("do");
  await expect(page.locator(".mbox-scrapbox-code-token.tok-keyword")).toHaveCSS("color", "rgb(166, 38, 164)");
  await expect(page.locator(".cm-line")).toContainText("`describe User do`");
});
