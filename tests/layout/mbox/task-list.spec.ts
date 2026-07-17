import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc, setSelection } from "../kit/helpers";

test("task list line height stays stable between focused and non-focused states", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- [ ] x\nplain", 2, true);

  const focusedBox = await page.locator(".cm-line").first().boundingBox();
  if (!focusedBox) {
    throw new Error("No focused task line box");
  }

  await setSelection(page, 9);

  const nonFocusedBox = await page.locator(".cm-line").first().boundingBox();
  if (!nonFocusedBox) {
    throw new Error("No non-focused task line box");
  }

  expect(nonFocusedBox.height).toBeCloseTo(focusedBox.height, 0);
});


test("task list checkbox vertical center matches its marker slot", async ({ page }) => {
  await openLayoutFixture(page);
  for (const marker of ["[ ]", "[x]"]) {
    await setDoc(page, `- ${marker} task\nplain`, 3, true);

    await setSelection(page, 16);

    const result = await page.evaluate(() => {
      const slot = document.querySelector(".mbox-task-checkbox-slot");
      const checkbox = document.querySelector(".mbox-task-checkbox");
      const content = document.querySelector(".mbox-task-list-content");
      if (!slot || !checkbox || !content) {
        throw new Error("No task checkbox slot, checkbox, or content");
      }

      const slotRect = slot.getBoundingClientRect();
      const checkboxRect = checkbox.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        checkboxCenterY: (checkboxRect.top + checkboxRect.bottom) / 2,
        slotCenterY: (slotRect.top + slotRect.bottom) / 2,
        contentLeft: contentRect.left,
        checkboxRight: checkboxRect.right,
      };
    });

    expect(result.checkboxCenterY).toBeCloseTo(result.slotCenterY, 0);
    expect(result.contentLeft - result.checkboxRight).toBeGreaterThanOrEqual(4);
    expect(result.contentLeft - result.checkboxRight).toBeLessThanOrEqual(8);
  }
});


test("clicking task list checkbox toggles the document checkbox marker", async ({ page }) => {
  await openLayoutFixture(page);
  const doc = "- [ ] task\nplain";
  await setDoc(page, doc, doc.length, true);

  await page.locator(".mbox-task-checkbox").click({ force: true });

  const currentDoc = await page.evaluate(() => {
    const view = window.__mboxLayoutFixture?.view as { state?: { doc?: { toString: () => string } } } | undefined;
    return view?.state?.doc?.toString();
  });
  expect(currentDoc).toBe("- [x] task\nplain");
  await expect(page.locator(".mbox-task-checkbox")).toBeChecked();
  await expect(page.locator(".mbox-task-checkbox")).toBeFocused();
});

test("task list checkbox keeps its focused DOM node through two toggles", async ({ page }) => {
  await openLayoutFixture(page);
  const doc = "- [ ] task\nplain";
  await setDoc(page, doc, doc.length, true);
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(".mbox-task-checkbox");
    if (!input) throw new Error("No task checkbox");
    input.focus();
    (window as typeof window & { taskCheckbox?: HTMLInputElement }).taskCheckbox = input;
  });

  for (const marker of ["[x]", "[ ]"]) {
    await page.locator(".mbox-task-checkbox").click({ force: true });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const fixture = window.__mboxLayoutFixture as { view?: { state?: { doc: { toString: () => string } } } } | undefined;
          return fixture?.view?.state?.doc.toString();
        }),
      )
      .toBe(`- ${marker} task\nplain`);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const windowWithCheckbox = window as typeof window & { taskCheckbox?: HTMLInputElement };
          return {
            active: document.activeElement === windowWithCheckbox.taskCheckbox,
            ariaLabel: windowWithCheckbox.taskCheckbox?.getAttribute("aria-label"),
            checked: windowWithCheckbox.taskCheckbox?.checked,
            same: document.querySelector(".mbox-task-checkbox") === windowWithCheckbox.taskCheckbox,
          };
        }),
      )
      .toEqual({
        active: true,
        ariaLabel: marker === "[x]" ? "checked task" : "unchecked task",
        checked: marker === "[x]",
        same: true,
      });
  }
});
