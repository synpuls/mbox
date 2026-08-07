import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

// A paragraph above the heading, because focusing the heading's own line is
// what reveals the underline: a caret on `Title` makes the whole heading
// active. Starting there would leave nothing to reach.
// `before` 0–6, blank 7, `Title` 8–13, `=====` 14–19, `after` 20–25.
const doc = "before\n\nTitle\n=====\nafter";
const headingLineIndex = 2;
const underlineLineIndex = 3;
const underlineStart = 14;

// `toHaveText` collapses whitespace, and a hidden line contributes none, so it
// cannot tell a hidden underline from a visible one. Compare exact textContent.
function exactLineText(page: Page, index: number): Promise<string | null | undefined> {
  return page.evaluate((at) => document.querySelectorAll("#editor .cm-line")[at]?.textContent, index);
}

function lineDisplay(page: Page, index: number): Promise<string | undefined> {
  return page.evaluate((at) => {
    const line = document.querySelectorAll<HTMLElement>("#editor .cm-line")[at];
    return line ? getComputedStyle(line).display : undefined;
  }, index);
}

test("an idle setext underline is hidden and the heading keeps its own line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, 0, false);

  await expect.poll(() => exactLineText(page, headingLineIndex)).toBe("Title");
  await expect.poll(() => lineDisplay(page, underlineLineIndex)).toBe("none");
  await expect.poll(() => exactLineText(page, 4)).toBe("after");
});

// Section 0 measured this for a multiline math block; a setext underline is the
// same shape but only one line deep, and its own evidence is cheap. Reaching it
// must restore it in the same update -- otherwise the caret sits on a line of
// zero height with nothing painted.
test("ArrowDown reaches the hidden underline and reveals it in the same update", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, 0, true);
  await expect.poll(() => lineDisplay(page, underlineLineIndex)).toBe("none");

  // Down from `before` lands on the blank line, then on `Title` -- which
  // reveals the underline by activating the heading -- and the third press
  // reaches the underline itself.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  await expect.poll(() => lineDisplay(page, underlineLineIndex)).toBe("block");
  await expect.poll(() => exactLineText(page, underlineLineIndex)).toBe("=====");
  expect(await selectionHead(page)).toBeGreaterThanOrEqual(underlineStart);
});
