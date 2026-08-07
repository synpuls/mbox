import { expect, test, type Page } from "@playwright/test";
import {
  addScrapboxImageSizingCSS,
  coordsAtPosLeft,
  openLayoutFixture,
  routeSvgTestImage,
  scrapboxBulletDotCenter,
  scrapboxBulletDotRect,
  selectionHead,
  setDoc,
  setSelection,
} from "../kit/helpers";

/** Caret height (in px) reported by CodeMirror's coordsAtPos for a document position. */
async function caretHeightAtPos(page: Page, pos: number): Promise<number> {
  return page.evaluate((position) => {
    const rect = window.__mboxLayoutFixture?.coordsAtPos(position);
    if (!rect) {
      throw new Error(`No coords for position ${position}`);
    }
    return rect.bottom - rect.top;
  }, pos);
}

/** Rect of a single composing (IME preedit) character on a line. */
async function composingCharRect(page: import("@playwright/test").Page, character: string) {
  return page.evaluate((glyph) => {
    const line = document.querySelector(".cm-line");
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

test("IME composing text on an empty list line does not overlap the bullet dot", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "IME composition injection uses Chromium CDP");
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, " ", 1); // empty list line, caret after the single indent space
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  // Start an IME composition at the caret, as when the user begins typing the
  // first character of a fresh bullet item. The preedit text has to stay clear
  // of the grey gutter dot; ours used to right-align the unconfirmed text
  // straight onto the dot, which made both unreadable.
  const client = await page.context().newCDPSession(page);
  await client.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
  await expect(page.locator(".cm-line")).toContainText("あ");

  const dot = await scrapboxBulletDotRect(page, 0);
  const composing = await composingCharRect(page, "あ");

  // The dot and the composing character must not share horizontal space.
  const overlap = Math.min(dot.right, composing.right) - Math.max(dot.left, composing.left);
  expect(overlap).toBeLessThanOrEqual(0);
});

test("IME composing text on an empty list line appears at the caret, not to its left", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "IME composition injection uses Chromium CDP");
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, " ", 1); // empty list line, caret after the single indent space

  // Where the caret sits before composing — the content edge, just right of the
  // fixed-width indent box. The preedit text must grow rightwards from here.
  const caretEdge = await coordsAtPosLeft(page, 1);

  const client = await page.context().newCDPSession(page);
  await client.send("Input.imeSetComposition", { text: "あ", selectionStart: 1, selectionEnd: 1 });
  await expect(page.locator(".cm-line")).toContainText("あ");

  const composing = await composingCharRect(page, "あ");

  // The unconfirmed character must start at (or right of) the caret — it must
  // never be pulled left into the fixed-width indent box, as it was when the
  // box's own text node swallowed the composition and right-aligned it.
  expect(composing.left).toBeGreaterThanOrEqual(caretEdge - 1);
});

test("scrapbox bullet dot stays at the item start, not right of the caret", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });

  // A single-level bullet: one leading space, then content. Focused, caret at
  // the line start.
  await setDoc(page, " item", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const lineStartCaret = await coordsAtPosLeft(page, 0);
  const dotCenter = await scrapboxBulletDotCenter(page, 0);

  // The dot belongs in the indent gutter, centered in its fixed 1.5em (~22px)
  // slot, so it sits ~0.75em (~11px) right of the line start — never drifting
  // onto the item text, the reported "black dot is right of the cursor" bug
  // where the raw space left the dot floating a full slot (~22px) away.
  expect(dotCenter - lineStartCaret).toBeLessThanOrEqual(14);
});

test("caret crosses an empty list line without an extra stop from the anchor widget", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });

  // " one" / " " / " two" — the empty middle line (positions 5..6) carries the
  // zero-width caret anchor widget at its content edge (position 6). Moving the
  // caret through that line must not gain an extra stop: the widget adds no
  // document position, so each arrow press must step a full character.
  await setDoc(page, " one\n \n two", 6); // caret on the empty middle line, after its indent
  await page.locator(".mbox-scrapbox-caret-anchor").first().waitFor({ state: "attached" });
  expect(await selectionHead(page)).toBe(6);

  // One ArrowRight leaves the empty line for the next line's start (7); the
  // widget must not swallow a keystroke as an intermediate caret stop.
  await page.keyboard.press("ArrowRight");
  expect(await selectionHead(page)).toBe(7);

  // One ArrowLeft from the content edge steps back over the single indent space
  // (6 -> 5), not onto the widget.
  await setSelection(page, 6);
  await page.keyboard.press("ArrowLeft");
  expect(await selectionHead(page)).toBe(5);

  // Vertical movement treats the empty line as one ordinary stop: Down from the
  // line above lands on it (6), Down again continues to the line below.
  await setSelection(page, 1); // content edge of the first line
  await page.keyboard.press("ArrowDown");
  expect(await selectionHead(page)).toBe(6);
  await page.keyboard.press("ArrowDown");
  expect(await selectionHead(page)).toBeGreaterThan(6);
});

test("caret height on a bullet line is the same at the line start as within the text", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });

  // A single-level bullet " list". The caret must be the same height wherever
  // it sits on the line: at the very start (position 0, right against the
  // fixed-width indent box) it used to render taller than when parked inside
  // the item text, because the inline-block indent widget stretched the line
  // box at that position.
  await setDoc(page, " list", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const heightAtStart = await caretHeightAtPos(page, 0); // "| list"
  const heightInText = await caretHeightAtPos(page, 3); // " li|st"

  expect(Math.abs(heightAtStart - heightInText)).toBeLessThanOrEqual(1);
});

test("scrapbox bullet dot vertical center matches the list text", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });

  // A single-level bullet with full-width content. The grey dot should line up
  // with the middle of the item text, not float above or below it. (Full-width
  // glyphs fill the line box so the text's visual center is unambiguous — ASCII
  // ascenders/descenders would otherwise mask the offset.)
  await setDoc(page, " テスト", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const { dotCenterY, textCenterY } = await page.evaluate(() => {
    const line = document.querySelector(".cm-line");
    const span = line?.querySelector(".mbox-scrapbox-bullet");
    if (!line || !span) {
      throw new Error("No scrapbox list line or bullet");
    }

    // The dot is an absolutely-positioned `::after` at `top` from the span top,
    // shifted up by half its own height (translateY(-50%)), so its vertical
    // center sits at spanTop + top.
    const spanRect = span.getBoundingClientRect();
    const dotStyle = getComputedStyle(span, "::after");
    const centerY = spanRect.top + Number.parseFloat(dotStyle.top);

    // Center Y of the actual item glyphs (the first non-space text node that is
    // not the indent whitespace inside the bullet span).
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let textNode: Node | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent && /\S/.test(node.textContent) && !span.contains(node)) {
        textNode = node;
        break;
      }
    }
    if (!textNode) {
      throw new Error("No visible text on the list line");
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const textRect = range.getBoundingClientRect();

    return { dotCenterY: centerY, textCenterY: (textRect.top + textRect.bottom) / 2 };
  });

  // The dot's vertical center must align with the text's vertical center.
  // Allow a sub-pixel tolerance: font metrics keep the glyph box's visual
  // center a hair off the line-box center, so exact equality is unachievable.
  expect(Math.abs(dotCenterY - textCenterY)).toBeLessThanOrEqual(1);
});

test("scrapbox bullet dot is as large as Scrapbox's (~0.4em of the line font)", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, " テスト", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const { dotWidth, dotHeight, fontSize } = await page.evaluate(() => {
    const line = document.querySelector(".cm-line");
    const span = line?.querySelector(".mbox-scrapbox-bullet");
    if (!line || !span) {
      throw new Error("No scrapbox list line or bullet");
    }
    const dotStyle = getComputedStyle(span, "::after");
    return {
      dotWidth: Number.parseFloat(dotStyle.width),
      dotHeight: Number.parseFloat(dotStyle.height),
      fontSize: Number.parseFloat(getComputedStyle(line).fontSize),
    };
  });

  // 0.4em is a 6px dot at a 15px line font. Hold that scale so the dot doesn't
  // look shrunken next to the item text (it used to be 0.32em, a fifth smaller,
  // which read as too faint/tiny).
  expect(dotWidth / fontSize).toBeCloseTo(0.4, 2);
  expect(dotHeight / fontSize).toBeCloseTo(0.4, 2);
});

test("scrapbox bullet dot is horizontally centered in its indent slot", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, " list item", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const { dotCenterX, slotCenterX } = await page.evaluate(() => {
    const span = document.querySelector(".cm-line")?.querySelector(".mbox-scrapbox-bullet");
    if (!span) {
      throw new Error("No scrapbox bullet");
    }
    const spanRect = span.getBoundingClientRect();
    const dotStyle = getComputedStyle(span, "::after");
    const dotLeft = spanRect.left + Number.parseFloat(dotStyle.left);
    const dotWidth = Number.parseFloat(dotStyle.width);
    return {
      dotCenterX: dotLeft + dotWidth / 2,
      slotCenterX: (spanRect.left + spanRect.right) / 2,
    };
  });

  // The dot must sit in the middle of its fixed-width indent slot, not hug the
  // left edge — otherwise, when the line is selected, the selection cell puts
  // the dot far to the left of its highlighted box.
  expect(dotCenterX).toBeCloseTo(slotCenterX, 1);
});

test("scrapbox bullet dot sits right next to the item text, not a raw space away", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, " バッククォート", 0);
  await page.locator(".mbox-scrapbox-bullet").first().waitFor();

  const { dotLeftToText, fontSize } = await page.evaluate(() => {
    const line = document.querySelector(".cm-line");
    const span = line?.querySelector(".mbox-scrapbox-bullet");
    if (!line || !span) {
      throw new Error("No scrapbox list line or bullet");
    }
    const spanRect = span.getBoundingClientRect();
    const dotStyle = getComputedStyle(span, "::after");
    const dotLeft = spanRect.left + Number.parseFloat(dotStyle.left);

    // First visible glyph of the item text — the text node after the indent
    // span, not the indent whitespace inside it.
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let textLeft: number | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (span.contains(node)) {
        continue;
      }
      const index = node.textContent?.search(/\S/) ?? -1;
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        textLeft = range.getBoundingClientRect().left;
        break;
      }
    }
    if (textLeft == null) {
      throw new Error("No visible item text on the list line");
    }

    return {
      dotLeftToText: textLeft - dotLeft,
      fontSize: Number.parseFloat(getComputedStyle(line).fontSize),
    };
  });

  // The item text sits 1.5em from the indent slot's left edge, and the dot is
  // centered in that 1.5em slot, so the text is 0.95em from the dot's left edge
  // (a 0.55em gap after the 0.4em dot). The raw indent space must not tack its
  // own width on top, leaving the dot floating a whole space away from the text.
  expect(dotLeftToText / fontSize).toBeCloseTo(0.95, 1);
});

/** Per-visual-row left of the item text node (excludes the bullet/indent widgets). */
async function itemTextRowLefts(page: import("@playwright/test").Page, lineIndex: number): Promise<number[]> {
  return page.evaluate((index) => {
    const line = document.querySelectorAll(".cm-line")[index];
    if (!line) throw new Error(`No line at index ${index}`);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      // The indent widgets carry only a zero-width space; the item text node is
      // the first with real content.
      if ((node.textContent ?? "").replace(/​/g, "").trim().length > 5) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).map((r) => r.left);
      }
    }
    throw new Error("No item text on the list line");
  }, lineIndex);
}

test("a soft-wrapped bullet line hangs its continuation with the item text, not under the bullet", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await page.locator("#editor").evaluate((element) => ((element as HTMLElement).style.width = "300px"));
  const doc =
    " bullet alpha beta gamma delta epsilon zeta eta theta iota kappa\n  nested alpha beta gamma delta epsilon zeta eta theta\nplain";
  await setDoc(page, doc, doc.length, false);

  // Each level's wrapped rows must sit at the same x as its first-line text
  // (hanging by the indent width), not slide back under the bullet.
  for (const lineIndex of [0, 1]) {
    const rows = await itemTextRowLefts(page, lineIndex);
    expect(rows.length).toBeGreaterThan(1);
    for (const left of rows.slice(1)) {
      expect(Math.abs(left - rows[0])).toBeLessThanOrEqual(1);
    }
  }
});

test("a preview image on a list line sits on the same row as the bullet dot", async ({ page }) => {
  await routeSvgTestImage(page, "**/scrapbox-test-image.svg", 900, 480);
  await openLayoutFixture(page, { plugins: "scrapboxImagePreview" });
  // Cap the figure well under the editor width so the only thing that could push
  // the image onto its own row is the figure reserving phantom width.
  await addScrapboxImageSizingCSS(page, "200px");

  // Line 2 is a single-level bullet whose sole content is an image. The caret
  // sits on line 1, so line 2 is not the active line and its image renders as
  // the real preview (not the hidden measure widget).
  await setDoc(page, "x\n [https://example.test/scrapbox-test-image.svg]", 0);
  await page.locator(".mbox-scrapbox-image-preview:not(.mbox-scrapbox-image-measure)").first().waitFor();
  await expect
    .poll(() =>
      page
        .locator("#editor .mbox-scrapbox-image-element")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

  const { bulletTop, imageTop, bulletRight, imageLeft } = await page.evaluate(() => {
    const line = document.querySelectorAll(".cm-line")[1];
    const bullet = line?.querySelector(".mbox-scrapbox-bullet");
    const figure = line?.querySelector(".mbox-scrapbox-image-preview:not(.mbox-scrapbox-image-measure)");
    if (!bullet || !figure) {
      throw new Error("No bullet or image preview on the list line");
    }
    const bulletRect = bullet.getBoundingClientRect();
    const figureRect = figure.getBoundingClientRect();
    return {
      bulletTop: bulletRect.top,
      imageTop: figureRect.top,
      bulletRight: bulletRect.right,
      imageLeft: figureRect.left,
    };
  });

  // Same row: the image top aligns with the bullet top (not a line below it),
  // and the image begins just right of the bullet — not wrapped underneath.
  expect(Math.abs(bulletTop - imageTop)).toBeLessThanOrEqual(2);
  expect(imageLeft).toBeGreaterThanOrEqual(bulletRight - 2);
});
