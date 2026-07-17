import { expect, test } from "@playwright/test";
import { completionReady, openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

async function editorDoc(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const view = window.__mboxLayoutFixture?.view as { state: { doc: { toString: () => string } } };
    return view.state.doc.toString();
  });
}

test("typing inside a bracket opens the native completion popup with matching titles", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0); // empty, focused

  // `[` auto-closes to `[]`, then "r" filters the title candidates.
  await page.keyboard.type("[r");

  const popup = page.locator(".cm-tooltip-autocomplete");
  await popup.waitFor();
  const labels = await popup.locator("li .cm-completionLabel").allTextContents();
  expect(labels).toContain("readme");
  expect(labels).toContain("Release Notes");
  // "demo-user" has no leading-word "r", so the filter drops it.
  expect(labels).not.toContain("demo-user");
});

test("accepting a completion inserts the title inside the brackets", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

  await page.keyboard.type("[Release N"); // narrows to the single spaced title
  await completionReady(page, "Release Notes");
  await page.keyboard.press("Enter");

  // A title with spaces is inserted whole, keeping the surrounding brackets…
  expect(await editorDoc(page)).toBe("[Release Notes]");
  // …and the caret lands just past the closing "]", outside the finished link.
  expect(await selectionHead(page)).toBe(15);
});

test("typing a #tag opens the popup and accepts to #tag", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

  await page.keyboard.type("#r");
  const popup = page.locator(".cm-tooltip-autocomplete");
  await popup.waitFor();
  expect(await popup.locator("li .cm-completionLabel").allTextContents()).toContain("readme");

  await completionReady(page, "readme");
  await page.keyboard.press("Enter"); // first candidate, "readme"
  expect(await editorDoc(page)).toBe("#readme");
});

test("scrapbox completion popup has no default CodeMirror icons", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

  await page.keyboard.type("[r");
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toBeVisible();
  await expect(popup.locator(".cm-completionIcon")).toHaveCount(0);
});

test("Tab moves the scrapbox completion selection", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

  await page.keyboard.type("[r");
  const selected = page.locator(".cm-tooltip-autocomplete li[aria-selected]");
  await completionReady(page, "readme");
  await page.keyboard.press("Tab");
  await expect(selected).toHaveText("reference");
  await page.keyboard.press("Enter");

  expect(await editorDoc(page)).toBe("[reference]");
});

test("Shift-Tab moves the scrapbox completion selection backward", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

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

  expect(await editorDoc(page)).toBe("[reference]");
});

test("scrapbox completion renders a preview image only for the candidate with iconUrl", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });
  await setDoc(page, "", 0);

  await page.keyboard.type("[r");
  const popup = page.locator(".cm-tooltip-autocomplete");
  await expect(popup).toBeVisible();

  const options = popup.locator("li.scrapbox-completion-option");
  // Case-insensitive prefix match on "r": readme, reference, roadmap, recipes, Release Notes.
  await expect(options).toHaveCount(5);
  await expect(options.nth(0)).toHaveClass(/scrapbox-completion-option-with-preview/);
  await expect(options.nth(0).locator(".scrapbox-completion-preview")).toHaveCount(1);
  await expect(options.nth(0).locator(".scrapbox-completion-preview-image")).toHaveAttribute(
    "src",
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='32'%20height='22'%20viewBox='0%200%2032%2022'%3E%3Crect%20width='32'%20height='22'%20fill='%23d92d20'/%3E%3C/svg%3E",
  );
  await expect(options.nth(0).locator(".scrapbox-completion-preview-image")).toHaveAttribute("aria-hidden", "true");
  await expect(options.nth(1)).not.toHaveClass(/scrapbox-completion-option-with-preview/);
  await expect(options.nth(1).locator(".scrapbox-completion-preview")).toHaveCount(0);
});

test("scrapbox completion is disabled inside code blocks and tables", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxComplete" });

  const codeDoc = "code:hello.js\n "; // opener + one indented (empty) body line
  await setDoc(page, codeDoc, codeDoc.length, true);
  await page.keyboard.type("[r");
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);

  const tableDoc = "table:example\n \tvalue"; // opener + one indented cell row
  await setDoc(page, tableDoc, tableDoc.indexOf("\t"), true);
  await page.keyboard.type("[r");
  await expect(page.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
});
