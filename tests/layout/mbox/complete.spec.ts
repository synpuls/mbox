import { expect, test } from "@playwright/test";
import { completionReady, currentEditorDoc, openLayoutFixture, setDoc } from "../kit/helpers";

test("mbox page-link completion waits for one typed character", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "mboxComplete" });
  await setDoc(page, "", 0, true);

  await page.keyboard.type("[");
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);

  await page.keyboard.type("r");
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toBeVisible();
  await expect(popup.locator("li .cm-completionLabel")).toHaveText(["readme", "reference", "roadmap"]);
  await expect(popup.locator(".cm-completionIcon")).toHaveCount(0);
});

test("Tab moves the mbox page-link completion selection", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "mboxComplete" });
  await setDoc(page, "", 0, true);

  await page.keyboard.type("[r");
  const selected = page.locator(".cm-tooltip-autocomplete li[aria-selected]");
  await completionReady(page, "readme");
  await page.keyboard.press("Tab");
  await expect(selected).toHaveText("reference");
  await page.keyboard.press("Enter");

  expect(await currentEditorDoc(page)).toBe("[reference]");
});

test("Shift-Tab moves the mbox page-link completion selection backward", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "mboxComplete" });
  await setDoc(page, "", 0, true);

  await page.keyboard.type("[r");
  const selected = page.locator(".cm-tooltip-autocomplete li[aria-selected]");
  await completionReady(page, "readme");
  await page.keyboard.press("Tab");
  await expect(selected).toHaveText("reference");
  await page.keyboard.press("Tab");
  await expect(selected).toHaveText("roadmap");
  await page.keyboard.press("Shift+Tab");
  await expect(selected).toHaveText("reference");
  await page.keyboard.press("Enter");

  expect(await currentEditorDoc(page)).toBe("[reference]");
});

test("mbox page-link completion renders preview images only for candidates with iconUrl", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "mboxComplete" });
  await setDoc(page, "", 0, true);

  await page.keyboard.type("[r");
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toBeVisible();

  const options = popup.locator("li.mbox-completion-option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toHaveClass(/mbox-completion-option-with-preview/);
  await expect(options.nth(0).locator(".mbox-completion-preview")).toHaveCount(1);
  await expect(options.nth(0).locator(".mbox-completion-preview-image")).toHaveAttribute(
    "src",
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='22'%20viewBox='0%200%2032%2022'%3E%3Crect%20width='32'%20height='22'%20fill='%23d92d20'/%3E%3C/svg%3E",
  );
  await expect(options.nth(0).locator(".mbox-completion-preview-image")).toHaveAttribute("aria-hidden", "true");
  await expect(options.nth(0).locator(".mbox-completion-preview-image")).toHaveCSS("width", "24px");
  await expect(options.nth(0).locator(".mbox-completion-preview-image")).toHaveCSS("height", "24px");
  await expect(options.nth(0).locator(".mbox-completion-preview-image")).toHaveCSS("object-fit", "contain");
  await expect(options.nth(1)).not.toHaveClass(/mbox-completion-option-with-preview/);
  await expect(options.nth(1).locator(".mbox-completion-preview")).toHaveCount(0);
});

test("mbox page-link completion is disabled inside code blocks and tables", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "mboxComplete" });

  const codeDoc = "```\n\n```";
  await setDoc(page, codeDoc, 4, true);
  await page.keyboard.type("[r");
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);

  const tableDoc = "| Name |\n| --- |\n|  |";
  await setDoc(page, tableDoc, tableDoc.length - 2, true);
  await page.keyboard.type("[r");
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
});
