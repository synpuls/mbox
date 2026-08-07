import { expect, test } from "@playwright/test";
import {
  clickLineLeft,
  coordsAtPosLeft,
  expectFirstLineHeightStableBetweenFocusedAndUnfocused,
  openLayoutFixture,
  pressArrowUp,
  selectionHead,
  setDoc,
  setSelection,
} from "../kit/helpers";

test("opt-in code block syntax highlight keeps focused raw code block syntax visible", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "codeHighlight" });
  await setDoc(page, "```ts\nconst x = 1\n```", 7, true);

  await expect(page.locator("#editor .mbox-code-token").filter({ hasText: "const" })).toHaveCount(1);
  await expect(page.locator("#editor .cm-content")).not.toContainText("```ts");
  await expect(page.locator("#editor .cm-content")).toContainText("const x = 1");

  await setSelection(page, 1);
  await expect(page.locator("#editor .cm-content")).toContainText("```ts");
});


test("code block copy button sits on the right edge and stays vertically centered", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "codeHighlight" });
  await setDoc(page, "```ts\nconst x = 1\n```", 7, false);
  await expect(page.locator("#editor .mbox-code-copy-button")).toHaveText("Copy");

  const bounds = await page.evaluate(() => {
    const fenceLine = document.querySelector("#editor .cm-line.mbox-code-opening-fence-line");
    const copyButton = document.querySelector("#editor .mbox-code-copy-button");
    if (!fenceLine || !copyButton) {
      throw new Error("No code block header copy button");
    }

    const fenceLineRect = fenceLine.getBoundingClientRect();
    const copyButtonRect = copyButton.getBoundingClientRect();
    return {
      copyButtonCenterY: copyButtonRect.top + copyButtonRect.height / 2,
      copyButtonRight: copyButtonRect.right,
      fenceLineCenterY: fenceLineRect.top + fenceLineRect.height / 2,
      fenceLineRight: fenceLineRect.right,
    };
  });

  expect(bounds.fenceLineRight - bounds.copyButtonRight).toBeCloseTo(10, 0);
  expect(bounds.copyButtonCenterY).toBeCloseTo(bounds.fenceLineCenterY, 0);
});


test("heading line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "# heading\nplain", 1, 15);
});


test("quote line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "> quote\nplain", 1, 13);
});


test("inline code line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "Use `code` here\nplain", 6, 21);
});


test("inline style line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "Use **strong** here\nplain", 7, 23);
});


test("code block header line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "```sample.ts\nconst x = 1\n```\nplain", 1, 13);
});


test("page link line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "[Page]\nplain", 1, 12);
});

test("focused raw page link keeps the page link color on the whole bracket expression", async ({ page }) => {
  await openLayoutFixture(page);
  await page.addStyleTag({ content: "#editor .mbox-page-link { color: rgb(1, 2, 3); }" });
  await setDoc(page, "[Page]\nplain", 1, true);

  const result = await page.evaluate(() => {
    const link = document.querySelector("#editor .mbox-page-link");
    if (!(link instanceof HTMLElement)) {
      throw new Error("No focused raw page link mark");
    }

    return {
      text: link.textContent,
      color: getComputedStyle(link).color,
      anchorCount: document.querySelectorAll("#editor a.mbox-page-link").length,
    };
  });

  expect(result).toEqual({
    text: "[Page]",
    color: "rgb(1, 2, 3)",
    anchorCount: 0,
  });
});

test("unfocused page link anchor click navigates to its href", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "[Page]\nplain", 0, false);

  const link = page.locator("#editor a.mbox-page-link", { hasText: "Page" });
  await expect(link).toHaveAttribute("href", "./Page");

  const expectedUrl = new URL("./Page", page.url()).toString();
  await Promise.all([
    page.waitForURL(expectedUrl),
    link.click(),
  ]);
});

test("a human-length unfocused page-link press keeps its anchor through mouseup and navigates", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "[Page]\nplain", 0, false);

  const link = page.locator("#editor a.mbox-page-link", { hasText: "Page" });
  await expect(link).toHaveAttribute("href", "./Page");
  const box = await link.boundingBox();
  if (box === null) {
    throw new Error("No page link bounds");
  }

  await page.evaluate(() => { window.name = ""; });
  await link.evaluate((anchor) => {
    anchor.addEventListener("mouseup", () => {
      window.name = JSON.stringify({
        anchorPresent: anchor.isConnected,
        // Which element takes focus differs by engine: Chromium focuses the
        // anchor itself, Firefox and WebKit focus the contenteditable. What
        // matters is only that focus moved into the editor, because that is
        // what used to remove this anchor.
        editorFocused: document.querySelector("#editor .cm-editor")?.contains(document.activeElement) === true,
      });
    }, { once: true });
  });

  const expectedUrl = new URL("./Page", page.url()).toString();
  const navigation = page.waitForURL(expectedUrl);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // This is the simulated human press duration, not synchronization. A 0ms
  // synthetic click misses the Firefox/WebKit regression this guards.
  await page.waitForTimeout(80);
  await page.mouse.up();
  await navigation;

  expect(await page.evaluate(() => JSON.parse(window.name))).toEqual({ anchorPresent: true, editorFocused: true });
});

test("unfocused icon fallback anchor click navigates to its href", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "[name.icon]\nplain", 0, false);

  const icon = page.locator("#editor a.mbox-icon", { hasText: "name" });
  await expect(icon).toHaveAttribute("href", "./name");

  const expectedUrl = new URL("./name", page.url()).toString();
  await Promise.all([
    page.waitForURL(expectedUrl),
    icon.click(),
  ]);
});

test("Markdown link line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "See [link](https://example.com)\nplain", 6, 37);
});


test("emoji line height stays stable between focused and non-focused states", async ({ page }) => {
  await expectFirstLineHeightStableBetweenFocusedAndUnfocused(page, "Use :smile: here\nplain", 6, 22);
});


test("heading content x changes by the raw marker width between focused and non-focused states", async ({ page }) => {
  await openLayoutFixture(page);

  await setSelection(page, 20);
  const focusedMarkerX = await coordsAtPosLeft(page, 18);
  const focusedContentX = await coordsAtPosLeft(page, 20);

  await setSelection(page, 2);
  const nonFocusedContentX = await coordsAtPosLeft(page, 20);

  expect(nonFocusedContentX).toBeCloseTo(focusedMarkerX, 0);
  expect(focusedContentX).toBeGreaterThan(nonFocusedContentX);
});


test("initial unfocused heading hides raw marker syntax", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "# h1", 0, false);

  await expect(page.locator(".cm-line").first()).toHaveText("h1");
  await expect(page.locator(".mbox-heading-syntax-hide")).toHaveCount(0);
});


test("ArrowUp from the next line can move to the logical start of a heading line", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "\n# h1\n");
  await clickLineLeft(page, 2);

  await pressArrowUp(page);

  expect(await selectionHead(page)).toBe(1);
});


test("ArrowUp from the next line can move to the logical start of a quote line", async ({ page }) => {
  await openLayoutFixture(page);
  await setDoc(page, "\n> quote\n");
  await clickLineLeft(page, 2);

  await pressArrowUp(page);

  expect(await selectionHead(page)).toBe(1);
});


test("minimal heading fixture keeps ArrowUp cursor motion at the logical marker start", async ({ page }) => {
  await openLayoutFixture(page, { setup: "minimal", plugins: "heading" });
  await setDoc(page, "\n# h1\n");
  await clickLineLeft(page, 2);

  await pressArrowUp(page);

  expect(await selectionHead(page)).toBe(1);
});


test("minimal quote fixture keeps ArrowUp cursor motion at the logical marker start", async ({ page }) => {
  await openLayoutFixture(page, { setup: "minimal", plugins: "quote" });
  await setDoc(page, "\n> quote\n");
  await clickLineLeft(page, 2);

  await pressArrowUp(page);

  expect(await selectionHead(page)).toBe(1);
});


test("heading text is not underlined by CodeMirror default highlight", async ({ page }) => {
  await openLayoutFixture(page);

  const textDecorationLines = await page.evaluate(() => {
    const headingLine = document.querySelectorAll(".cm-line")[2];
    if (!headingLine) {
      throw new Error("No heading line found");
    }

    return [headingLine, ...Array.from(headingLine.querySelectorAll("*"))].map((element) => getComputedStyle(element).textDecorationLine);
  });

  expect(textDecorationLines.every((line) => line === "none")).toBe(true);
});
