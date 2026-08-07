import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

// A `code:tex` / `code:latex` formula block owns its lines the way a multiline
// math block does,
// so it belongs to the focus-stability exception: the body collapses to zero
// height while idle and returns when the caret arrives. See the header of
// tests/layout/gfm/focus-stability.spec.ts.
//
// `code:js` is here as the negative control. Without it, a change that stopped
// collapsing *every* code block would still pass the first two assertions.
// A line before the block, because focusing the opener is itself what expands
// it: any caret inside the block restores the whole thing. Starting there would
// leave nothing to reach.
const formula = "before\ncode:tex\n \\frac\n  {a}\n  {b}\nafter";
const firstBodyLineIndex = 2;
const code = "code:js\n const x = 1\nafter";

function lineDisplay(page: Page, index: number): Promise<string | undefined> {
  return page.evaluate((at) => {
    const line = document.querySelectorAll<HTMLElement>("#editor .cm-line")[at];
    return line ? getComputedStyle(line).display : undefined;
  }, index);
}

function exactText(page: Page, selector: string): Promise<string | null | undefined> {
  return page.evaluate((query) => document.querySelector(query)?.textContent, selector);
}

test("an idle formula block collapses its body and keeps the following line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, formula, 0, false);

  await expect.poll(() => lineDisplay(page, firstBodyLineIndex)).toBe("none");
  await expect.poll(() => lineDisplay(page, firstBodyLineIndex + 1)).toBe("none");
  await expect.poll(() => lineDisplay(page, firstBodyLineIndex + 2)).toBe("none");
  // The line after the block is not the block's, and must survive.
  await expect.poll(() => exactText(page, "#editor .cm-line:last-child")).toBe("after");
});

test("an idle code block keeps every line", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, code, 0, false);

  await expect.poll(() => lineDisplay(page, 1)).toBe("block");
});

test("reaching a collapsed formula body restores the whole block", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, formula, 0, true);
  await expect.poll(() => lineDisplay(page, firstBodyLineIndex)).toBe("none");

  // From `before`, one press reaches the opener -- which expands the block by
  // making it active -- and the second lands on the first body line.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  await expect.poll(() => lineDisplay(page, firstBodyLineIndex)).toBe("block");
  await expect.poll(() => exactText(page, `#editor .cm-line:nth-child(${firstBodyLineIndex + 1})`)).toBe(" \\frac");
  expect(await selectionHead(page)).toBeGreaterThan(formula.indexOf("code:tex"));
});
