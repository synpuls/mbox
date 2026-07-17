import { expect, test, type Page } from "@playwright/test";
import { addScrapboxImageSizingCSS, openLayoutFixture, routeSvgTestImage, setDoc, setSelection } from "../kit/helpers";

const imageURL = "https://i.example.com/mbox-test-image.svg";

test.beforeEach(async ({ page }) => {
  // A landscape (400x260) test image, sized like the real demo with a
  // *percentage* max-width — `min(100%, 320px)` — capped at 320px here. The
  // `100%` is the important part: it resolves against the figure's containing
  // block, so the measure widget must keep the figure in normal flow (its
  // containing block the line = the content width), or the height collapses.
  await routeSvgTestImage(page, "**/mbox-test-image.svg", 400, 260, "#8ab");
  await openLayoutFixture(page, { plugins: "scrapboxImagePreview" });
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "520px";
  });
  await addScrapboxImageSizingCSS(page, "min(100%, 320px)");
});

/**
 * The cancelling margin is applied asynchronously (ResizeObserver, after
 * layout). Wait until the focused measure figure's inline advance
 * (border-box width + its negative right margin) has settled to ~0.
 */
async function waitForMeasureSettled(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const figure = document.querySelector("#editor .mbox-scrapbox-image-measure") as HTMLElement | null;
        const image = figure?.querySelector("img");
        if (!figure || !(image instanceof HTMLImageElement) || image.naturalWidth === 0) {
          return Number.POSITIVE_INFINITY;
        }
        const width = figure.getBoundingClientRect().width;
        const marginRight = parseFloat(getComputedStyle(figure).marginRight); // negative
        return Math.abs(width + marginRight);
      }),
    )
    .toBeLessThanOrEqual(1);
}

async function waitForPreviewImage(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.locator("#editor .mbox-scrapbox-image-element").first().evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
}

test("focused image line keeps the preview's reserved height", async ({ page }) => {
  const doc = `[${imageURL}]\nnext`;
  await setDoc(page, doc, doc.length, true); // caret on line 2 → image line unfocused
  await page.locator("#editor .mbox-scrapbox-image-element").first().waitFor();
  await waitForPreviewImage(page);

  const unfocusedHeight = await page
    .locator("#editor .cm-line")
    .first()
    .evaluate((line) => line.getBoundingClientRect().height);
  expect(unfocusedHeight).toBeGreaterThan(50); // the preview really is tall

  await setSelection(page, 0); // focus the image line: raw syntax is revealed
  await waitForMeasureSettled(page);

  const focused = await page.locator("#editor .cm-line").first().evaluate((line) => ({
    height: line.getBoundingClientRect().height,
    text: line.textContent ?? "",
    hasVisiblePreview: Boolean(line.querySelector(".mbox-scrapbox-image-preview:not(.mbox-scrapbox-image-measure)")),
  }));

  // The raw notation is shown, the visible preview is gone, but the reserved
  // height is unchanged so the line (and everything below it) does not jump.
  expect(focused.text).toContain(`[${imageURL}]`);
  expect(focused.hasVisiblePreview).toBe(false);
  expect(Math.abs(focused.height - unfocusedHeight)).toBeLessThanOrEqual(0.5);
});

test("focused image line reserves height but not width, so surrounding text stays put", async ({ page }) => {
  const doc = `before [${imageURL}] after\nnext`;
  await setDoc(page, doc, doc.length, true);
  await page.locator("#editor .mbox-scrapbox-image-element").first().waitFor();
  await waitForPreviewImage(page);

  await setSelection(page, 0); // focus the image line
  await waitForMeasureSettled(page);

  const info = await page.evaluate(() => {
    const line = document.querySelector("#editor .cm-line");
    if (!line) {
      throw new Error("No image line");
    }
    const figure = line.querySelector(".mbox-scrapbox-image-measure") as HTMLElement | null;

    function rectForText(text: string): DOMRect {
      const walker = document.createTreeWalker(line as Node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const index = node.textContent?.indexOf(text) ?? -1;
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);
          return range.getBoundingClientRect();
        }
      }
      throw new Error(`No text: ${text}`);
    }

    const before = rectForText("before");
    const notation = rectForText(`[${"https"}`); // start of the raw [https://...] notation
    return {
      figureWidth: figure?.getBoundingClientRect().width ?? null,
      figureHeight: figure?.getBoundingClientRect().height ?? null,
      // horizontal gap between the word before the image and the raw notation
      gapBeforeNotation: notation.left - before.right,
    };
  });

  // The figure is still rendered at the preview's real size — that is what gives
  // the line its reserved height...
  expect(info.figureWidth as number).toBeGreaterThan(50);
  expect(info.figureHeight as number).toBeGreaterThan(50);

  // ...but its rendered width is cancelled, so the image inserts no horizontal
  // space: the raw notation follows "before " by just a single space (~a few px),
  // not by the image's ~320px width.
  expect(info.gapBeforeNotation).toBeLessThanOrEqual(12);
});

async function measureFigureWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const figure = document.querySelector("#editor .mbox-scrapbox-image-measure") as HTMLElement | null;
    return figure?.getBoundingClientRect().width ?? 0;
  });
}

test("focused image line re-follows a content-width change (the cancel is not a one-shot measurement)", async ({ page }) => {
  const doc = `[${imageURL}]\nnext`;
  await setDoc(page, doc, doc.length, true);
  await page.locator("#editor .mbox-scrapbox-image-element").first().waitFor();
  await waitForPreviewImage(page);

  await setSelection(page, 0); // focus the image line
  await waitForMeasureSettled(page);
  const wideFigure = await measureFigureWidth(page); // ~320 (capped)

  // Shrink the editor below the 320px cap: the responsive figure gets narrower,
  // so a margin captured only once at the wide width would now be stale and the
  // advance would no longer cancel. The ResizeObserver must re-fire.
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "240px";
  });
  await waitForMeasureSettled(page); // asserts |width + margin| ~ 0 at the NEW width

  const narrowFigure = await measureFigureWidth(page);
  expect(narrowFigure).toBeLessThan(wideFigure - 20); // the figure really did get narrower
});

test("cancels the image's inline advance even under an ancestor CSS transform", async ({ page }) => {
  // `margin` is in layout (pre-transform) coordinates; `getBoundingClientRect()`
  // is the post-transform *visual* size. Cancelling by the visual width would
  // leave a residual advance under a scaled ancestor (e.g. a presentation view),
  // so the observer must cancel by the layout border-box size.
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.transform = "scale(0.8)";
  });
  const doc = `before [${imageURL}] after\nnext`;
  await setDoc(page, doc, doc.length, true);
  await page.locator("#editor .mbox-scrapbox-image-element").first().waitFor();
  await waitForPreviewImage(page);

  await setSelection(page, 0); // focus the image line

  // Measure the figure's *layout* inline advance directly (wrapping-independent):
  // `offsetWidth` is the untransformed layout width and `marginInlineEnd` is a
  // layout-space length, so their sum is the residual advance in the same
  // coordinate space regardless of the ancestor transform. Cancelling by the
  // visual width leaves ~64px here; cancelling by the layout width leaves ~0.
  // The poll doubles as the settle wait.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const figure = document.querySelector("#editor .mbox-scrapbox-image-measure") as HTMLElement | null;
        if (!figure) {
          return Number.POSITIVE_INFINITY;
        }
        const marginInlineEnd = parseFloat(getComputedStyle(figure).marginInlineEnd); // negative
        return Math.abs(figure.offsetWidth + marginInlineEnd);
      }),
    )
    .toBeLessThanOrEqual(2);
});
