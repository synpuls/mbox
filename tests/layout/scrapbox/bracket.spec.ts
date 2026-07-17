import { expect, test } from "@playwright/test";
import { openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

async function editorDoc(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const view = window.__mboxLayoutFixture?.view as { state: { doc: { toString: () => string } } };
    return view.state.doc.toString();
  });
}

test("typing [ auto-closes the bracket and puts the caret between the pair", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "ab", 1); // caret between a and b, focused

  await page.keyboard.type("[");

  expect(await editorDoc(page)).toBe("a[]b");
  expect(await selectionHead(page)).toBe(2); // caret sits between [ and ]
});

test("typing [ around a selection wraps it and keeps it selected", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, "hello world", 0);
  await page.evaluate(() => window.__mboxLayoutFixture?.setSelection(6, 11)); // "world"

  await page.keyboard.type("[");

  expect(await editorDoc(page)).toBe("hello [world]");
  expect(await selectionHead(page)).toBe(12); // selection end shifted past the wrapped text
});
