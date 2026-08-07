import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, selectionHead, setDoc, setSelection } from "../kit/helpers";

// `x ` a ` y` — the opening fence is at 2 and the space CommonMark strips is at
// 3, so the widened `open` replace covers 2..4. Offsets, not pixels: the hidden
// space has zero width, and asserting on rects is how the hidden-line specs
// first produced tests that failed against correct code.
const doc = "x ` a ` y";
const idleText = "x a y";
const strippedLeadingSpace = 3;

// `toHaveText` collapses whitespace, which makes it useless here: a build that
// strips nothing renders "x  a  y", and that normalises to the same string as
// the stripped "x a y". Measured — both tests passed against a no-strip
// mutation until they compared `textContent` exactly.
function exactText(page: Page, selector: string): Promise<string | null | undefined> {
  return page.evaluate((query) => document.querySelector(query)?.textContent, selector);
}

test("an idle code span hides its fences and its padding together", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, 0, false);

  await expect.poll(() => exactText(page, "#editor code.mbox-gfm-code")).toBe("a");
  await expect.poll(() => exactText(page, "#editor .cm-line")).toBe(idleText);
});

// Reachability is a separate contract from stripping, and a build that strips
// nothing passes this one by construction — the display test above is what
// catches that. What this pins is that hiding a character mid-line does not put
// its offset out of reach: selecting it must activate the line, bring back the
// whole raw span, and leave the caret on the same offset.
//
// The code element itself survives the switch: only the fence replaces are
// dropped on an active line, while the content mark stays. It wraps the
// stripped content, so on an active line the padding and backticks sit outside
// the styled span.
test("selecting the stripped space activates the line and keeps the offset", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, 0, false);
  await expect.poll(() => exactText(page, "#editor .cm-line")).toBe(idleText);

  await page.evaluate(() => window.__mboxLayoutFixture?.focus());
  await setSelection(page, strippedLeadingSpace);

  await expect.poll(() => exactText(page, "#editor .cm-line")).toBe(doc);
  await expect.poll(async () => selectionHead(page)).toBe(strippedLeadingSpace);
});
