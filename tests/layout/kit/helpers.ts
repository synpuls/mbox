import { inflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * The composited colour of a single viewport pixel, read by screenshotting a
 * 1x1 clip and decoding it. This is the only way to observe cross-layer CSS
 * compositing (e.g. a translucent line background blended over the selection
 * layer beneath it) -- `getComputedStyle` reports declared values, not the
 * painted result. Dependency-free: a 1x1 PNG has a single scanline whose every
 * filter predictor references absent (zero) neighbours, so after inflating the
 * IDAT the pixel bytes are raw regardless of the filter type. Assumes the
 * default deviceScaleFactor of 1 (see playwright.config.ts) so one CSS pixel is
 * one device pixel and the clip is exactly 1x1.
 */
export async function pixelAt(page: Page, x: number, y: number): Promise<Rgba> {
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });

  let offset = 8; // Skip the 8-byte PNG signature.
  let colorType = 6; // RGBA, the Chromium screenshot default.
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") colorType = data[9];
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat)); // [filterByte, R, G, B, (A)]
  return { r: raw[1], g: raw[2], b: raw[3], a: colorType === 6 ? raw[4] : 255 };
}

export interface OpenLayoutFixtureOptions {
  setup?: "full" | "minimal";
  plugins?:
    | "default"
    | "imagePreview"
    | "codeHighlight"
    | "mboxComplete"
    | "heading"
    | "quote"
    | "headingQuote"
    | "scrapbox"
    | "scrapboxImagePreview"
    | "scrapboxTitleLine"
    | "scrapboxPresentation"
    | "scrapboxInlineCodeHighlight"
    | "scrapboxComplete"
    | "scrapboxIcon"
    | "gfmImagePreview"
    | "gfmMath"
    | "none";
  readonly?: boolean;
  labelledby?: boolean;
}

/**
 * Viewport rect of the scrapbox bullet dot, resolved from whichever pseudo
 * element (`::before` or `::after`) actually paints it. The dot is an absolutely
 * positioned pseudo anchored to the `.mbox-scrapbox-bullet` indent span, so its
 * horizontal box is derived from the span rect plus the pseudo's left/right and
 * width. Works regardless of which side the dot is anchored to.
 */
export async function scrapboxBulletDotRect(page: Page, lineIndex: number): Promise<{ left: number; right: number }> {
  return page.evaluate((index) => {
    const span = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-scrapbox-bullet");
    if (!span) {
      throw new Error(`No scrapbox bullet at line index ${index}`);
    }

    const rect = span.getBoundingClientRect();
    for (const pseudo of ["::before", "::after"]) {
      const style = getComputedStyle(span, pseudo);
      if (!style.content || style.content === "none" || style.content === "normal") {
        continue;
      }
      const width = Number.parseFloat(style.width);
      if (Number.isNaN(width)) {
        continue;
      }
      const leftAnchor = Number.parseFloat(style.left);
      if (!Number.isNaN(leftAnchor)) {
        return { left: rect.left + leftAnchor, right: rect.left + leftAnchor + width };
      }
      const rightAnchor = Number.parseFloat(style.right);
      if (!Number.isNaN(rightAnchor)) {
        return { left: rect.right - rightAnchor - width, right: rect.right - rightAnchor };
      }
    }

    throw new Error(`No painted dot pseudo on scrapbox bullet at line index ${index}`);
  }, lineIndex);
}

/** Horizontal center of the scrapbox bullet dot. */
export async function scrapboxBulletDotCenter(page: Page, lineIndex: number): Promise<number> {
  const rect = await scrapboxBulletDotRect(page, lineIndex);
  return (rect.left + rect.right) / 2;
}

export async function openLayoutFixture(page: Page, options: OpenLayoutFixtureOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  if (options.setup) {
    params.set("setup", options.setup);
  }
  if (options.plugins) {
    params.set("plugins", options.plugins);
  }
  if (options.readonly) {
    params.set("readonly", "1");
  }
  if (options.labelledby) {
    params.set("labelledby", "1");
  }

  await page.goto(`/demos/layout-fixture.html${params.size > 0 ? `?${params}` : ""}`);
  await expect.poll(async () => page.evaluate(() => Boolean(window.__mboxLayoutFixture?.view))).toBe(true);

  if (options.plugins) {
    // The fixture falls back to `default` for a mode it does not know, so a
    // typo would otherwise give a working editor with the wrong plugins, and
    // the resulting failure would read as a product bug. Fail here instead.
    const resolved = await page.evaluate(() => window.__mboxLayoutFixture?.pluginMode);
    expect(resolved, `the fixture has no plugin mode named "${options.plugins}"`).toBe(options.plugins);
  }
}

export async function routeSvgTestImage(
  page: Page,
  urlPattern: string,
  width = 900,
  height = 480,
  fill = "#ccc",
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`,
    }),
  );
}

/**
 * Delete every rule in the fixture's own stylesheets whose selector mentions
 * `selectorSubstring`, and report how many went.
 *
 * The layout fixture loads `demos/styles.css`. When a demo rule and a library
 * rule do the same job, deleting the library's rule changes nothing visible
 * and its spec stays green -- the library rule is never actually under test.
 *
 * Overriding the demo rule from a spec does not fix that: an added rule has to
 * win on specificity against the plugin theme's own class selectors, and when
 * it does it silences the very thing being checked. Removing the host rule
 * leaves the library rule alone and visible.
 *
 * Only same-origin sheets can be enumerated, which is every sheet this fixture
 * loads. The count is returned so a spec can assert it removed something --
 * a helper that quietly matched nothing would make the test pass for the wrong
 * reason.
 */
export async function removeHostStyleRules(page: Page, selectorSubstring: string): Promise<number> {
  return page.evaluate((needle) => {
    let removed = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // Cross-origin sheet; the fixture loads none, but do not throw.
      }
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(needle)) continue;
        // Skip CodeMirror's own injected theme rules. style-mod scopes them
        // under a generated class starting `\u037C` (verified against the
        // running fixture: `.\u037Ct .mbox-gfm-table-cell ...`), a character no
        // hand-written selector uses. Deleting those would remove the LIBRARY's
        // rule -- the thing under test -- leaving the spec checking nothing.
        if (rule.selectorText.includes("\u037C")) continue;
        sheet.deleteRule(index);
        removed += 1;
      }
    }
    return removed;
  }, selectorSubstring);
}

export async function addImageSizingCSS(page: Page, width: string): Promise<void> {
  await page.addStyleTag({
    content: `
      #editor {
        --mbox-test-image-width: ${width};
      }

      #editor .mbox-image-preview {
        width: var(--mbox-test-image-width);
      }

      #editor .mbox-image-measure {
        margin-right: calc(-1 * var(--mbox-test-image-width));
      }

      #editor .mbox-image-element {
        max-width: 100%;
      }
    `,
  });
}

/**
 * Size the preview *figure* and let the img fill it — the convention that keeps
 * a preview image beside its list bullet. Capping the img with a percentage
 * instead poisons the figure's shrink-to-fit and drops the image to its own row.
 */
export async function addScrapboxImageSizingCSS(page: Page, width: string): Promise<void> {
  await page.addStyleTag({
    content: `
      #editor .mbox-scrapbox-image-preview { max-width: ${width}; }
      #editor .mbox-scrapbox-image-element { max-width: 100%; }
    `,
  });
}

/**
 * Wait until the completion popup is actually actionable, then wait out
 * CodeMirror's interaction guard. Two distinct races hide behind "the tooltip
 * is visible": (1) while a source re-queries, the tooltip renders disabled
 * with no aria-selected option and accept/move keys fall through to the
 * default keymap (Enter inserts a newline); (2) accept/move commands reject
 * any interaction within `interactionDelay` (default 75ms) of the result
 * opening, so a fast test presses Enter into the same fallthrough. The
 * timeout is the documented guard constant plus margin — deterministic
 * synchronization, not a sleep-and-hope.
 */
export async function completionReady(page: Page, selectedLabel: string): Promise<void> {
  await expect(page.locator(".cm-tooltip-autocomplete li[aria-selected]")).toHaveText(selectedLabel);
  await page.waitForTimeout(150);
}

export async function setSelection(page: Page, anchor: number, head = anchor): Promise<void> {
  await page.evaluate(({ anchor: selectionAnchor, head: selectionHead }) => {
    window.__mboxLayoutFixture?.setSelection(selectionAnchor, selectionHead);
  }, { anchor, head });
}

export async function setDoc(page: Page, doc: string, selection = 0, focus = true): Promise<void> {
  await page.evaluate(({ doc: nextDoc, selection: nextSelection, focus: shouldFocus }) => {
    window.__mboxLayoutFixture?.setDoc(nextDoc, nextSelection, shouldFocus);
  }, { doc, selection, focus });
}

export async function selectionHead(page: Page): Promise<number> {
  return page.evaluate(() => {
    const head = window.__mboxLayoutFixture?.selectionHead();
    if (head == null) {
      throw new Error("No selection head available");
    }

    return head;
  });
}

export async function currentEditorDoc(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const view = window.__mboxLayoutFixture?.view as { state?: { doc?: { toString: () => string } } } | undefined;
    return view?.state?.doc?.toString();
  });
}

export async function pressArrowUp(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__mboxLayoutFixture?.focus();
  });
  await page.keyboard.press("ArrowUp");
}

export async function clickLineLeft(page: Page, lineIndex: number): Promise<void> {
  const line = page.locator(".cm-line").nth(lineIndex);
  const box = await line.boundingBox();
  if (!box) {
    throw new Error(`No line box at index ${lineIndex}`);
  }

  await page.mouse.click(box.x + 2, box.y + box.height / 2);
}

export async function coordsAtPosLeft(page: Page, pos: number): Promise<number> {
  return page.evaluate((position) => {
    const rect = window.__mboxLayoutFixture?.coordsAtPos(position);
    if (!rect) {
      throw new Error(`No coords for position ${position}`);
    }

    return rect.left;
  }, pos);
}

export async function replacementBulletLeft(page: Page, lineIndex: number): Promise<number> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-syntax-hide");
    if (!marker) {
      throw new Error(`No line at index ${index}`);
    }

    const markerRect = marker.getBoundingClientRect();
    const beforeStyle = getComputedStyle(marker, "::after");
    const left = Number.parseFloat(beforeStyle.left);
    if (Number.isNaN(left)) {
      throw new Error(`Cannot parse bullet left from ${beforeStyle.left}`);
    }

    return markerRect.left + left;
  }, lineIndex);
}

export async function focusedListMarkerLeft(page: Page, lineIndex: number): Promise<number> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-focused-syntax");
    if (!marker) {
      throw new Error(`No focused list marker at line index ${index}`);
    }

    const markerRect = marker.getBoundingClientRect();
    const afterStyle = getComputedStyle(marker, "::after");
    const left = Number.parseFloat(afterStyle.left);
    if (Number.isNaN(left)) {
      throw new Error(`Cannot parse focused marker left from ${afterStyle.left}`);
    }

    return markerRect.left + left;
  }, lineIndex);
}

export async function replacementBulletSlotRect(page: Page, lineIndex: number): Promise<{ left: number; right: number }> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-syntax-hide");
    if (!marker) {
      throw new Error(`No line at index ${index}`);
    }

    const markerRect = marker.getBoundingClientRect();
    const beforeStyle = getComputedStyle(marker, "::after");
    const left = Number.parseFloat(beforeStyle.left);
    const width = Number.parseFloat(beforeStyle.width);
    if (Number.isNaN(left) || Number.isNaN(width)) {
      throw new Error(`Cannot parse bullet slot from left=${beforeStyle.left}, width=${beforeStyle.width}`);
    }

    return {
      left: markerRect.left + left,
      right: markerRect.left + left + width,
    };
  }, lineIndex);
}

export async function focusedListMarkerSlotRect(page: Page, lineIndex: number): Promise<{ left: number; right: number }> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-focused-syntax");
    if (!marker) {
      throw new Error(`No focused list marker at line index ${index}`);
    }

    const markerRect = marker.getBoundingClientRect();
    const afterStyle = getComputedStyle(marker, "::after");
    const left = Number.parseFloat(afterStyle.left);
    const width = Number.parseFloat(afterStyle.width);
    if (Number.isNaN(left) || Number.isNaN(width)) {
      throw new Error(`Cannot parse focused marker slot from left=${afterStyle.left}, width=${afterStyle.width}`);
    }

    return {
      left: markerRect.left + left,
      right: markerRect.left + left + width,
    };
  }, lineIndex);
}

export async function focusedListMarkerCenterY(page: Page, lineIndex: number): Promise<number> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-focused-syntax");
    if (!marker) {
      throw new Error(`No focused list marker at line index ${index}`);
    }

    const markerRect = marker.getBoundingClientRect();
    const afterStyle = getComputedStyle(marker, "::after");
    const top = Number.parseFloat(afterStyle.top);
    const height = Number.parseFloat(afterStyle.height);
    if (Number.isNaN(top) || Number.isNaN(height)) {
      throw new Error(`Cannot parse focused marker y from top=${afterStyle.top}, height=${afterStyle.height}`);
    }

    return markerRect.top + top + height / 2;
  }, lineIndex);
}

export async function markerTextVisibilities(page: Page, lineIndex: number): Promise<string[]> {
  return page.evaluate((index) => {
    const marker = document.querySelectorAll(".cm-line")[index]?.querySelector(".mbox-list-syntax-hide");
    if (!marker) {
      throw new Error(`No marker at line index ${index}`);
    }

    return [marker, ...Array.from(marker.querySelectorAll("*"))].map((element) => getComputedStyle(element).visibility);
  }, lineIndex);
}

export async function textRangeRect(
  page: Page,
  lineIndex: number,
  fromCharacterIndex: number,
  toCharacterIndex: number,
): Promise<{ left: number; right: number; top: number; bottom: number }> {
  return page.evaluate(
    ({ lineIndex: targetLineIndex, fromCharacterIndex: targetFromCharacterIndex, toCharacterIndex: targetToCharacterIndex }) => {
      const line = document.querySelectorAll(".cm-line")[targetLineIndex];
      if (!line) {
        throw new Error(`No line at index ${targetLineIndex}`);
      }

      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let remainingFrom = targetFromCharacterIndex;
      let remainingTo = targetToCharacterIndex;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const textLength = node.textContent?.length ?? 0;
        if (remainingFrom < textLength && remainingTo <= textLength) {
          const range = document.createRange();
          range.setStart(node, remainingFrom);
          range.setEnd(node, remainingTo);
          const rect = range.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }
        remainingFrom -= textLength;
        remainingTo -= textLength;
      }

      throw new Error(`No text range ${targetFromCharacterIndex}-${targetToCharacterIndex} on line ${targetLineIndex}`);
    },
    { lineIndex, fromCharacterIndex, toCharacterIndex },
  );
}

export async function textRangeRects(
  page: Page,
  lineIndex: number,
  fromCharacterIndex: number,
  toCharacterIndex: number,
): Promise<Array<{ left: number; right: number; top: number; bottom: number }>> {
  return page.evaluate(
    ({ lineIndex: targetLineIndex, fromCharacterIndex: targetFromCharacterIndex, toCharacterIndex: targetToCharacterIndex }) => {
      const line = document.querySelectorAll(".cm-line")[targetLineIndex];
      if (!line) {
        throw new Error(`No line at index ${targetLineIndex}`);
      }

      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const textLength = node.textContent?.length ?? 0;
        const nextOffset = offset + textLength;

        if (!startNode && targetFromCharacterIndex <= nextOffset) {
          startNode = node;
          startOffset = Math.max(0, targetFromCharacterIndex - offset);
        }

        if (targetToCharacterIndex <= nextOffset) {
          endNode = node;
          endOffset = Math.max(0, targetToCharacterIndex - offset);
          break;
        }

        offset = nextOffset;
      }

      if (!startNode || !endNode) {
        throw new Error(`No text range ${targetFromCharacterIndex}-${targetToCharacterIndex} on line ${targetLineIndex}`);
      }

      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }));
    },
    { lineIndex, fromCharacterIndex, toCharacterIndex },
  );
}

async function lineHeightAt(page: Page, lineIndex: number): Promise<number> {
  return page.locator("#editor .cm-line").nth(lineIndex).evaluate((line) => line.getBoundingClientRect().height);
}

export async function expectFirstLineHeightStableBetweenFocusedAndUnfocused(
  page: Page,
  doc: string,
  focusedSelection: number,
  nonFocusedSelection: number,
) {
  await openLayoutFixture(page);
  await setDoc(page, doc, focusedSelection, true);
  const focusedHeight = await lineHeightAt(page, 0);

  await setSelection(page, nonFocusedSelection);
  const unfocusedHeight = await lineHeightAt(page, 0);

  expect(unfocusedHeight).toBeCloseTo(focusedHeight, 0);
}

declare global {
  interface Window {
    __mboxLayoutFixture?: {
      view: unknown;
      pluginMode: string;
      setDoc: (doc: string, selection?: number, focus?: boolean) => void;
      setSelection: (anchor: number, head?: number) => void;
      focus: () => void;
      selectionHead: () => number;
      selectionCoords: () => DOMRect | null;
      coordsAtPos: (pos: number) => DOMRect | null;
      scrollIntoView: (pos: number) => void;
      rectForText: (text: string) => DOMRect | null;
    };
  }
}
