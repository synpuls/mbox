import { expect, test } from "@playwright/test";
import { currentEditorDoc, openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

test("Tab indents the focused list item in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- item", 2, true);

  await page.keyboard.press("Tab");

  expect(await currentEditorDoc(page)).toBe(" - item");
  expect(await selectionHead(page)).toBe(3);
});

test("Shift+Tab outdents the focused list item in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- item", 2, true);

  await page.keyboard.press("Shift+Tab");

  expect(await currentEditorDoc(page)).toBe("item");
  expect(await selectionHead(page)).toBe(0);
});

test("Tab and Shift+Tab change the nesting of an empty list marker in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- ", 2, true);

  await page.keyboard.press("Tab");

  expect(await currentEditorDoc(page)).toBe(" - ");
  expect(await selectionHead(page)).toBe(3);

  await page.keyboard.press("Shift+Tab");

  expect(await currentEditorDoc(page)).toBe("- ");
  expect(await selectionHead(page)).toBe(2);
});

test("Tab creates an empty list marker on an empty line in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "", 0, true);

  await page.keyboard.press("Tab");

  expect(await currentEditorDoc(page)).toBe("- ");
  expect(await selectionHead(page)).toBe(2);
});

test("Space inserts a literal space on an empty line in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "", 0, true);

  await page.keyboard.press("Space");

  expect(await currentEditorDoc(page)).toBe(" ");
  expect(await selectionHead(page)).toBe(1);
});

test("Enter continues a task list item with an unchecked task marker in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- [x] done", 10, true);

  await page.keyboard.press("Enter");

  expect(await currentEditorDoc(page)).toBe("- [x] done\n- [ ] ");
  expect(await selectionHead(page)).toBe(17);
  await expect(page.locator(".cm-line").nth(1)).toContainText("- [ ]");
});

test("Space nests an existing empty list marker in the browser editor", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "- ", 2, true);

  await page.keyboard.press("Space");

  expect(await currentEditorDoc(page)).toBe(" - ");
  expect(await selectionHead(page)).toBe(3);
});

test("unhandled Tab and Shift+Tab use normal browser focus navigation", async ({ page, browserName }) => {
  // Playwright WebKit leaves focus on <body> for a bare contenteditable Tab.
  test.skip(browserName === "webkit", "WebKit does not perform native contenteditable Tab navigation");
  await openLayoutFixture(page, { plugins: "none" });
  await page.locator("#editor").evaluate((editor) => {
    const before = document.createElement("a");
    before.id = "before-editor-link";
    before.href = "#before";
    before.textContent = "before";
    editor.before(before);

    const after = document.createElement("a");
    after.id = "after-editor-link";
    after.href = "#after";
    after.textContent = "after";
    editor.after(after);
  });
  await setDoc(page, "plain", 5, true);
  const initialDoc = await currentEditorDoc(page);

  await page.keyboard.press("Tab");

  await expect(page.locator("#after-editor-link")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);

  await page.keyboard.press("Shift+Tab");

  await expect(page.locator("#editor .cm-content")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);

  await page.keyboard.press("Shift+Tab");

  await expect(page.locator("#before-editor-link")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);
});

test("inactive default mbox list and completion bindings fall through to browser focus navigation", async ({ page, browserName }) => {
  // Playwright WebKit leaves focus on <body> for a bare contenteditable Tab.
  test.skip(browserName === "webkit", "WebKit does not perform native contenteditable Tab navigation");
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((editor) => {
    const before = document.createElement("a");
    before.id = "before-default-editor-link";
    before.href = "#before";
    before.textContent = "before";
    editor.before(before);

    const after = document.createElement("a");
    after.id = "after-default-editor-link";
    after.href = "#after";
    after.textContent = "after";
    editor.after(after);
  });
  await setDoc(page, "```\nplain\n```", 8, true);
  const initialDoc = await currentEditorDoc(page);

  await page.keyboard.press("Tab");

  expect(await currentEditorDoc(page)).toBe(initialDoc);
  await expect(page.locator("#editor .mbox-code-copy-button")).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(page.locator("#after-default-editor-link")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);

  await page.keyboard.press("Shift+Tab");

  await expect(page.locator("#editor .mbox-code-copy-button")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);

  await page.keyboard.press("Shift+Tab");

  await expect(page.locator("#editor .cm-content")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);

  await page.keyboard.press("Shift+Tab");

  await expect(page.locator("#before-default-editor-link")).toBeFocused();
  expect(await currentEditorDoc(page)).toBe(initialDoc);
});

test("Backspace outdents an empty list marker by one nesting level", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - ", 4, true);

  await page.keyboard.press("Backspace");

  expect(await currentEditorDoc(page)).toBe(" - ");
  expect(await selectionHead(page)).toBe(3);
});

test("Ctrl+h outdents an empty list marker by one nesting level", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - ", 4, true);

  await page.keyboard.press("Control+h");

  expect(await currentEditorDoc(page)).toBe(" - ");
  expect(await selectionHead(page)).toBe(3);
});

test("Ctrl+a moves the focused list cursor to the content start first", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - item", 8, true);

  await page.keyboard.press("Control+a");

  expect(await selectionHead(page)).toBe(4);
});

test("Ctrl+h inside list syntax outdents by one nesting level", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - item", 2, true);

  await page.keyboard.press("Control+h");

  expect(await currentEditorDoc(page)).toBe(" - item");
  expect(await selectionHead(page)).toBe(1);
});

test("Backspace at non-empty list content start outdents by one nesting level", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - item", 4, true);

  await page.keyboard.press("Backspace");

  expect(await currentEditorDoc(page)).toBe(" - item");
  expect(await selectionHead(page)).toBe(3);
});

test("Ctrl+h at non-empty list content start outdents by one nesting level", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "  - item", 4, true);

  await page.keyboard.press("Control+h");

  expect(await currentEditorDoc(page)).toBe(" - item");
  expect(await selectionHead(page)).toBe(3);
});
