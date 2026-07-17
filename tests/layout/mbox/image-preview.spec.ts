import { expect, test, type Page } from "@playwright/test";
import { addImageSizingCSS, openLayoutFixture, routeSvgTestImage, selectionHead, setDoc, setSelection } from "../kit/helpers";

async function waitForFocusedImageMeasureToSettle(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const image = document.querySelector("#editor .mbox-image-measure .mbox-image-element");
        if (!(image instanceof HTMLImageElement) || image.naturalWidth === 0) {
          return false;
        }

        const figure = image.closest(".mbox-image-measure");
        if (!(figure instanceof HTMLElement)) {
          return false;
        }

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const firstHeight = figure.getBoundingClientRect().height;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const secondHeight = figure.getBoundingClientRect().height;

        return firstHeight > 0 && secondHeight > 0 && Math.abs(secondHeight - firstHeight) <= 0.5;
      }),
    )
    .toBe(true);
}

test("image preview can be constrained inside the editor content by user CSS", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg", 1200, 800, "#ddd");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "420px";
  });
  const imageURL = "/mbox-test-image.svg";
  await setDoc(page, `![Large](${imageURL})`, 0, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const bounds = await page.evaluate(() => {
    const content = document.querySelector("#editor .cm-content");
    const image = document.querySelector("#editor .mbox-image-element");
    if (!content || !image) {
      throw new Error("No image preview content");
    }

    const contentRect = content.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      contentRight: contentRect.right,
      imageRight: imageRect.right,
      imageWidth: imageRect.width,
      contentWidth: contentRect.width,
    };
  });

  expect(bounds.imageWidth).toBeGreaterThan(0);
  expect(bounds.imageWidth).toBeLessThanOrEqual(bounds.contentWidth * 0.6 + 0.5);
  expect(bounds.imageRight).toBeLessThanOrEqual(bounds.contentRight + 0.5);
});

test("image preview and same-line trailing text stay inside the editor content", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "300px";
  });
  const imageURL = "/mbox-test-image.svg";
  const trailing = "after image text should wrap within the editor content";
  await setDoc(page, `![Large](${imageURL}) ${trailing}`, 0, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const result = await page.evaluate((text) => {
    const content = document.querySelector("#editor .cm-content");
    const line = document.querySelector("#editor .cm-line");
    const preview = document.querySelector("#editor .mbox-image-preview");
    if (!content || !line || !preview) {
      throw new Error("No image preview line");
    }

    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let targetNode: Node | null = null;
    let start = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      start = node.textContent?.indexOf(text) ?? -1;
      if (start >= 0) {
        targetNode = node;
        break;
      }
    }
    if (!targetNode) {
      throw new Error("No trailing text");
    }

    const range = document.createRange();
    range.setStart(targetNode, start);
    range.setEnd(targetNode, start + text.length);
    const contentRect = content.getBoundingClientRect();
    const textRects = Array.from(range.getClientRects()).map((rect) => ({
      left: rect.left,
      right: rect.right,
    }));
    const previewStyle = getComputedStyle(preview);

    return {
      contentLeft: contentRect.left,
      contentRight: contentRect.right,
      textRects,
      previewDisplay: previewStyle.display,
      previewMarginLeft: previewStyle.marginLeft,
      previewMarginRight: previewStyle.marginRight,
    };
  }, trailing);

  expect(result.previewDisplay).toBe("inline-block");
  expect(result.previewMarginLeft).toBe("0px");
  expect(result.previewMarginRight).toBe("0px");
  expect(result.textRects.length).toBeGreaterThan(1);
  for (const rect of result.textRects) {
    expect(rect.left).toBeGreaterThanOrEqual(result.contentLeft - 0.5);
    expect(rect.right).toBeLessThanOrEqual(result.contentRight + 0.5);
  }
});

test("image preview sizing can be changed by user CSS", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg", 1200, 800, "#ddd");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "80%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "500px";
  });
  const imageURL = "/mbox-test-image.svg";
  await setDoc(page, `![Large](${imageURL})`, 0, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const bounds = await page.evaluate(() => {
    const content = document.querySelector("#editor .cm-content");
    const image = document.querySelector("#editor .mbox-image-element");
    if (!content || !image) {
      throw new Error("No image preview content");
    }

    const contentRect = content.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    return {
      imageWidth: imageRect.width,
      contentWidth: contentRect.width,
    };
  });

  expect(bounds.imageWidth).toBeGreaterThan(bounds.contentWidth * 0.6 + 1);
  expect(bounds.imageWidth).toBeLessThanOrEqual(bounds.contentWidth * 0.8 + 0.5);
});

test("image preview with surrounding same-line text stays inside the editor content", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "320px";
  });
  const imageURL = "/mbox-test-image.svg";
  const before = "before text";
  const after = "after image text should wrap within the editor content";
  await setDoc(page, `${before} ![Large](${imageURL}) ${after}`, 0, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const result = await page.evaluate(
    ({ before: beforeText, after: afterText }) => {
      const content = document.querySelector("#editor .cm-content");
      const line = document.querySelector("#editor .cm-line");
      if (!content || !line) {
        throw new Error("No image preview line");
      }
      const lineElement = line;

      function rectsForText(text: string) {
        const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const start = node.textContent?.indexOf(text) ?? -1;
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + text.length);
            return Array.from(range.getClientRects()).map((rect) => ({
              left: rect.left,
              right: rect.right,
            }));
          }
        }
        throw new Error(`No text: ${text}`);
      }

      const contentRect = content.getBoundingClientRect();
      return {
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        beforeRects: rectsForText(beforeText),
        afterRects: rectsForText(afterText),
      };
    },
    { before, after },
  );

  expect(result.beforeRects.length).toBeGreaterThan(0);
  expect(result.afterRects.length).toBeGreaterThan(1);
  for (const rect of [...result.beforeRects, ...result.afterRects]) {
    expect(rect.left).toBeGreaterThanOrEqual(result.contentLeft - 0.5);
    expect(rect.right).toBeLessThanOrEqual(result.contentRight + 0.5);
  }
});

test("image preview with long surrounding same-line text wraps all text fragments inside the editor content", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "280px";
  });
  const imageURL = "/mbox-test-image.svg";
  const before = "before image text should wrap across multiple visual lines before the image";
  const after = "after image text should also wrap across multiple visual lines after the image";
  await setDoc(page, `${before} ![Large](${imageURL}) ${after}`, 0, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const result = await page.evaluate(
    ({ before: beforeText, after: afterText }) => {
      const content = document.querySelector("#editor .cm-content");
      const line = document.querySelector("#editor .cm-line");
      const preview = document.querySelector("#editor .mbox-image-preview");
      if (!content || !line || !preview) {
        throw new Error("No image preview line");
      }
      const lineElement = line;

      function rectsForText(text: string) {
        const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const start = node.textContent?.indexOf(text) ?? -1;
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, start + text.length);
            return Array.from(range.getClientRects()).map((rect) => ({
              left: rect.left,
              right: rect.right,
            }));
          }
        }
        throw new Error(`No text: ${text}`);
      }

      const contentRect = content.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      return {
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        previewLeft: previewRect.left,
        previewRight: previewRect.right,
        beforeRects: rectsForText(beforeText),
        afterRects: rectsForText(afterText),
      };
    },
    { before, after },
  );

  expect(result.beforeRects.length).toBeGreaterThan(1);
  expect(result.afterRects.length).toBeGreaterThan(1);
  expect(result.previewLeft).toBeGreaterThanOrEqual(result.contentLeft - 0.5);
  expect(result.previewRight).toBeLessThanOrEqual(result.contentRight + 0.5);
  for (const rect of [...result.beforeRects, ...result.afterRects]) {
    expect(rect.left).toBeGreaterThanOrEqual(result.contentLeft - 0.5);
    expect(rect.right).toBeLessThanOrEqual(result.contentRight + 0.5);
  }
});

test("focused image line keeps the unfocused preview height while showing raw syntax", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "420px";
  });
  const imageURL = "/mbox-test-image.svg";
  const doc = `![Large](${imageURL})\nplain`;
  await setDoc(page, doc, doc.length, false);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const unfocusedHeight = await page.locator("#editor .cm-line").first().evaluate((line) => line.getBoundingClientRect().height);

  await setSelection(page, 2);
  await waitForFocusedImageMeasureToSettle(page);

  const focused = await page.locator("#editor .cm-line").first().evaluate((line) => ({
    height: line.getBoundingClientRect().height,
    text: line.textContent ?? "",
    hasVisiblePreview: Boolean(line.querySelector(".mbox-image-preview:not(.mbox-image-measure)")),
  }));

  expect(focused.text).toContain("![Large](");
  expect(focused.hasVisiblePreview).toBe(false);
  expect(Math.abs(focused.height - unfocusedHeight)).toBeLessThanOrEqual(0.5);
});

test("clicking image preview does not trigger mbox-specific open or selection action", async ({ page, context }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  const imageURL = "/mbox-test-image.svg";
  const doc = `![Large](${imageURL})\nplain`;
  await setDoc(page, doc, doc.length, true);
  await expect
    .poll(() => page.locator("#editor .mbox-image-element").evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  const beforeURL = page.url();
  const beforePages = context.pages().length;
  const beforeHead = await selectionHead(page);
  await page.locator("#editor .mbox-image-preview:not(.mbox-image-measure)").click();

  expect(page.url()).toBe(beforeURL);
  expect(context.pages()).toHaveLength(beforePages);
  expect(await selectionHead(page)).not.toBe(0);
  expect(await selectionHead(page)).not.toBe(doc.indexOf("\n"));
  expect(await selectionHead(page)).toBe(beforeHead);
});

test("keyboard navigation to an image line reveals raw image syntax", async ({ page }) => {
  await routeSvgTestImage(page, "**/mbox-test-image.svg");
  await openLayoutFixture(page, { plugins: "imagePreview" });
  await addImageSizingCSS(page, "60%");
  const imageURL = "/mbox-test-image.svg";
  const doc = `![Large](${imageURL})\nplain`;
  await setDoc(page, doc, doc.length, true);
  await expect(page.locator("#editor .mbox-image-preview:not(.mbox-image-measure)")).toHaveCount(1);

  await page.keyboard.press("ArrowUp");

  const firstLine = page.locator("#editor .cm-line").first();
  await expect(firstLine).toContainText("![Large](");
  await expect(firstLine.locator(".mbox-image-preview:not(.mbox-image-measure)")).toHaveCount(0);
  await expect(firstLine.locator(".mbox-image-measure")).toHaveCount(1);
});
