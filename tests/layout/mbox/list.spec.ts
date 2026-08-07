import { expect, test, type Page } from "@playwright/test";
import {
  coordsAtPosLeft,
  currentEditorDoc,
  expectFirstLineHeightStableBetweenFocusedAndUnfocused,
  focusedListMarkerCenterY,
  focusedListMarkerLeft,
  focusedListMarkerSlotRect,
  markerTextVisibilities,
  openLayoutFixture,
  replacementBulletLeft,
  replacementBulletSlotRect,
  setDoc,
  setSelection,
  textRangeRect,
} from "../kit/helpers";

async function composingCharRect(page: Page, character: string) {
  return page.evaluate((glyph) => {
    const line = document.querySelector("#editor .cm-line");
    if (!line) {
      throw new Error("No line to search for the composing character");
    }
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf(glyph) ?? -1;
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }
    }
    throw new Error(`No composing character "${glyph}" found on the line`);
  }, character);
}

test("list content x stays stable between focused and non-focused states", async ({ page }) => {
  await openLayoutFixture(page);

  const rootFocusedX = await coordsAtPosLeft(page, 2);
  await setSelection(page, 11);
  const rootNonFocusedX = await coordsAtPosLeft(page, 2);

  expect(rootNonFocusedX).toBeCloseTo(rootFocusedX, 0);

  const nestedFocusedX = await coordsAtPosLeft(page, 11);
  await setSelection(page, 2);
  const nestedNonFocusedX = await coordsAtPosLeft(page, 11);

  expect(nestedNonFocusedX).toBeCloseTo(nestedFocusedX, 0);
});

test("list marker and replacement bullet x stays stable between focused and non-focused states", async ({ page }) => {
  await openLayoutFixture(page);

  await setSelection(page, 2);
  const rootMarkerX = await focusedListMarkerLeft(page, 0);
  await setSelection(page, 11);
  const rootBulletX = await replacementBulletLeft(page, 0);

  expect(rootBulletX).toBeCloseTo(rootMarkerX, 0);

  const nestedMarkerX = await focusedListMarkerLeft(page, 1);
  await setSelection(page, 2);
  const nestedBulletX = await replacementBulletLeft(page, 1);

  expect(nestedBulletX).toBeCloseTo(nestedMarkerX, 0);
});

test("nested list replacement bullet x follows list depth", async ({ page }) => {
  await openLayoutFixture(page);

  await setSelection(page, 20);
  const rootBulletX = await replacementBulletLeft(page, 0);
  const nestedBulletX = await replacementBulletLeft(page, 1);

  expect(nestedBulletX).toBeGreaterThan(rootBulletX);
});

test("nested list replacement bullet slot matches the focused marker slot", async ({ page }) => {
  await openLayoutFixture(page);

  await setSelection(page, 11);
  const focusedMarkerSlot = await focusedListMarkerSlotRect(page, 1);

  await setSelection(page, 2);
  const replacementBulletSlot = await replacementBulletSlotRect(page, 1);

  expect(replacementBulletSlot.left).toBeCloseTo(focusedMarkerSlot.left, 0);
  expect(replacementBulletSlot.right).toBeCloseTo(focusedMarkerSlot.right, 0);
});

test("focused list marker vertical center matches the list text", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- テスト", 2, true);

  const markerCenterY = await focusedListMarkerCenterY(page, 0);
  const textRect = await textRangeRect(page, 0, 0, 3);
  const textCenterY = (textRect.top + textRect.bottom) / 2;

  expect(Math.abs(markerCenterY - textCenterY)).toBeLessThanOrEqual(1);
});

test("focused list marker box center matches the unfocused marker slot center", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- テスト", 2, true);

  const focusedMarker = await focusedListMarkerSlotRect(page, 0);
  const focusedCenterX = (focusedMarker.left + focusedMarker.right) / 2;

  await setDoc(page, "- テスト\nplain", "- テスト\nplain".length, true);
  const unfocusedMarker = await replacementBulletSlotRect(page, 0);
  const unfocusedCenterX = (unfocusedMarker.left + unfocusedMarker.right) / 2;

  expect(Math.abs(focusedCenterX - unfocusedCenterX)).toBeLessThanOrEqual(1);
});

test("unfocused list marker text is hidden while the bullet replacement is shown", async ({ page }) => {
  await openLayoutFixture(page);

  await setSelection(page, 20);
  expect(await markerTextVisibilities(page, 0)).toEqual(["hidden"]);

  const nestedMarkerVisibilities = await markerTextVisibilities(page, 1);
  expect(nestedMarkerVisibilities.every((visibility) => visibility === "hidden")).toBe(true);
});

test("typing on a focused empty list marker inserts content after the marker", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- ", 2, true);

  await page.keyboard.type("item");

  expect(await currentEditorDoc(page)).toBe("- item");
});

test("IME composing text on a focused empty list marker appears at the caret", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "IME composition injection uses Chromium CDP");
  await openLayoutFixture(page);
  await setDoc(page, "- ", 2, true);

  const caretEdge = await coordsAtPosLeft(page, 2);
  const client = await page.context().newCDPSession(page);
  await client.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
  await expect(page.locator("#editor .cm-line")).toContainText("あ");

  const composing = await composingCharRect(page, "あ");
  expect(composing.left).toBeGreaterThanOrEqual(caretEdge - 1);
});

test("list line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "- item\nplain", 1, 12);
});
