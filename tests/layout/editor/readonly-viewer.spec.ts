import { expect, test } from "@playwright/test";
import { clickLineLeft, currentEditorDoc, openLayoutFixture, setDoc } from "../kit/helpers";

// The readOnly option's whole promise is "a viewer that never reveals raw
// syntax". EditorState.readOnly alone would NOT deliver it: the editor would
// still take focus on click and the focused line would swap to its raw form.
// These tests pin the viewer behavior in a real browser.

test("readOnly keeps every line rendered, even after clicking a line", async ({ page }) => {
  await openLayoutFixture(page, { readonly: true });
  await setDoc(page, "# heading\nplain", 0, false);

  const content = page.locator("#editor .cm-content");
  await expect(content).toContainText("heading");
  await expect(content).not.toContainText("# heading");

  await clickLineLeft(page, 0);

  await expect(content).toContainText("heading");
  await expect(content).not.toContainText("# heading");
});

test("readOnly rejects typing", async ({ page }) => {
  await openLayoutFixture(page, { readonly: true });
  await setDoc(page, "# heading\nplain", 0, false);

  await clickLineLeft(page, 0);
  await page.keyboard.type("x");

  expect(await currentEditorDoc(page)).toBe("# heading\nplain");
});

test("readOnly still allows selecting rendered text with the mouse", async ({ page }) => {
  await openLayoutFixture(page, { readonly: true });
  await setDoc(page, "# heading\nplain", 0, false);

  const target = page.locator("#editor .cm-content").getByText("heading");
  await target.selectText();

  const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selectedText).toContain("heading");
});

test("readOnly task checkboxes are disabled and reject synthetic clicks", async ({ page }) => {
  await openLayoutFixture(page, { readonly: true });
  await setDoc(page, "- [ ] task", 0, false);

  const checkbox = page.locator("#editor .mbox-task-checkbox");
  await expect(checkbox).toBeDisabled();
  await checkbox.evaluate((input) => {
    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  expect(await currentEditorDoc(page)).toBe("- [ ] task");
});
