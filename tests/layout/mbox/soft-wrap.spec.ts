import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, setDoc, textRangeRects } from "../kit/helpers";

async function expectWrappedTextRectsStayAlignedAndInsideEditor(
  page: Page,
  lineIndex: number,
  fromCharacterIndex: number,
  toCharacterIndex: number,
) {
  const result = await page.evaluate(
    ({ lineIndex: targetLineIndex, fromCharacterIndex: targetFromCharacterIndex, toCharacterIndex: targetToCharacterIndex }) => {
      const editor = document.querySelector("#editor .cm-content");
      const line = document.querySelectorAll("#editor .cm-line")[targetLineIndex];
      if (!(editor instanceof HTMLElement) || !line) {
        throw new Error("Expected editor content and target line to exist");
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

        if (
          !startNode &&
          targetFromCharacterIndex >= offset &&
          targetFromCharacterIndex < nextOffset
        ) {
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
      const rects = Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: Math.round(rect.top),
      }));
      const lineLefts = new Map<number, number>();
      for (const rect of rects) {
        lineLefts.set(rect.top, Math.min(lineLefts.get(rect.top) ?? Number.POSITIVE_INFINITY, rect.left));
      }
      const wrappedLineLefts = [...lineLefts.values()];
      const editorRect = editor.getBoundingClientRect();

      return {
        editorLeft: editorRect.left,
        editorRight: editorRect.right,
        leftDelta: Math.max(...wrappedLineLefts) - Math.min(...wrappedLineLefts),
        rects,
      };
    },
    { lineIndex, fromCharacterIndex, toCharacterIndex },
  );

  expect(result.rects.length).toBeGreaterThan(1);
  expect(result.leftDelta).toBeLessThanOrEqual(0.5);
  for (const rect of result.rects) {
    expect(rect.left).toBeGreaterThanOrEqual(result.editorLeft - 0.5);
    expect(rect.right).toBeLessThanOrEqual(result.editorRight + 0.5);
  }
}

test("soft-wrapped list continuation text does not move into the marker slot", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "190px";
  });
  const doc = "- alpha beta gamma delta epsilon zeta eta theta iota kappa\nplain";
  await setDoc(page, doc, doc.length, true);

  const contentTextLength = doc.indexOf("\n") - "- ".length;
  const contentRects = await textRangeRects(page, 0, 0, contentTextLength);

  expect(contentRects.length).toBeGreaterThan(1);
  for (const rect of contentRects.slice(1)) {
    expect(rect.left).toBeGreaterThanOrEqual(contentRects[0].left - 0.5);
  }
});

test("soft-wrapped Japanese list continuation stays aligned and inside the editor", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "230px";
  });
  const content = "これはとても長い日本語のリスト項目です。折り返しても本文の左端が揃うことを確認します。";
  const doc = `- ${content}\nplain`;
  await setDoc(page, doc, doc.length, true);

  await expectWrappedTextRectsStayAlignedAndInsideEditor(page, 0, "- ".length, doc.indexOf("\n"));
});

test("soft-wrapped focused list continuation stays aligned with raw content", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "380px";
  });
  const content =
    "見出し記法は、カーソルが別の行にあるとき marker を隠します。ネストしたリストの bullet は、元のハイフン位置に揃います。ネストしたリストの bullet は、元のハイフン位置に揃います。";
  const doc = `- ${content}\nplain`;
  await setDoc(page, doc, doc.indexOf(content), true);

  await expectWrappedTextRectsStayAlignedAndInsideEditor(page, 0, 0, content.length);
});

test("soft-wrapped nested list continuation follows list depth", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "210px";
  });
  const doc = "- root alpha beta gamma\n  - nested alpha beta gamma delta epsilon zeta eta theta iota\nplain";
  await setDoc(page, doc, doc.length, true);

  const rootRects = await textRangeRects(page, 0, 2, doc.indexOf("\n"));
  const nestedLineStart = doc.indexOf("\n") + 1;
  const nestedLineEnd = doc.indexOf("\n", nestedLineStart);
  const nestedRects = await textRangeRects(page, 1, 4, nestedLineEnd - nestedLineStart);

  expect(rootRects.length).toBeGreaterThan(1);
  expect(nestedRects.length).toBeGreaterThan(1);
  expect(nestedRects[0].left).toBeGreaterThan(rootRects[0].left);
  for (const rect of nestedRects.slice(1)) {
    expect(rect.left).toBeGreaterThanOrEqual(nestedRects[0].left - 0.5);
  }
});

test("soft-wrapped task list continuation stays aligned outside the focused line", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "220px";
  });
  const doc = "- [ ] task alpha beta gamma delta epsilon zeta eta theta iota\nplain";
  await setDoc(page, doc, doc.length, true);

  const contentTextLength = doc.indexOf("\n") - "- [ ] ".length;
  const contentRects = await textRangeRects(page, 0, 0, contentTextLength);

  expect(contentRects.length).toBeGreaterThan(1);
  for (const rect of contentRects.slice(1)) {
    expect(rect.left).toBeGreaterThanOrEqual(contentRects[0].left - 0.5);
  }
});

test("soft-wrapped nested task list continuation stays clear of the checkbox slot", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "230px";
  });
  const content = "nested task alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
  const doc = `  - [ ] ${content}\nplain`;
  await setDoc(page, doc, doc.length, true);

  await expectWrappedTextRectsStayAlignedAndInsideEditor(page, 0, "  ".length, "  ".length + content.length);

  const layout = await page.evaluate(() => {
    const checkboxSlot = document.querySelector("#editor .mbox-task-checkbox-slot");
    const content = document.querySelector("#editor .mbox-task-list-content");
    if (!(checkboxSlot instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      throw new Error("Expected task checkbox slot and content");
    }

    const checkboxSlotRect = checkboxSlot.getBoundingClientRect();
    const contentRange = document.createRange();
    contentRange.selectNodeContents(content);
    const contentLeft = Math.min(...[...contentRange.getClientRects()].map((rect) => rect.left));
    return {
      checkboxSlotRight: checkboxSlotRect.right,
      contentLeft,
    };
  });

  expect(layout.contentLeft).toBeGreaterThanOrEqual(layout.checkboxSlotRight - 0.5);
});

test("soft-wrapped focused task list continuation stays aligned with raw content", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "230px";
  });
  const content = "nested task alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
  const doc = `  - [ ] ${content}\nplain`;
  await setDoc(page, doc, doc.indexOf(content), true);

  await expectWrappedTextRectsStayAlignedAndInsideEditor(page, 0, doc.indexOf(content), doc.indexOf("\n"));
});

test("soft-wrapped quote continuation text does not move into the marker slot", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "220px";
  });
  const doc = "> quote alpha beta gamma delta epsilon zeta eta theta iota\nplain";
  await setDoc(page, doc, doc.length, true);

  const contentTextLength = doc.indexOf("\n") - "> ".length;
  const contentRects = await textRangeRects(page, 0, 0, contentTextLength);

  expect(contentRects.length).toBeGreaterThan(1);
  for (const rect of contentRects.slice(1)) {
    expect(rect.left).toBeGreaterThanOrEqual(contentRects[0].left - 0.5);
  }
});

test("soft-wrapped URL quote continuation stays aligned and inside the editor", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "260px";
  });
  const url = "https://example.com/very/long/path/that/should/wrap/inside/the/editor/without/sliding";
  const doc = `> ${url}\nplain`;
  await setDoc(page, doc, doc.length, true);

  await expectWrappedTextRectsStayAlignedAndInsideEditor(page, 0, 0, url.length);
});

test("soft-wrapped mixed inline widgets stay inside the editor", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "260px";
  });
  await setDoc(
    page,
    "See [Page] and https://example.com/very/long/path/for/wrapping with `inline code` and **strong text** together\nplain",
    0,
    false,
  );

  const layout = await page.locator("#editor .cm-line").first().evaluate((line) => {
    const editor = document.querySelector("#editor .cm-content");
    const scroller = document.querySelector("#editor .cm-scroller");
    if (!(editor instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
      throw new Error("Expected editor and scroller");
    }

    const range = document.createRange();
    range.selectNodeContents(line);
    const rects = [...range.getClientRects()];
    const lineTops = rects.map((rect) => Math.round(rect.top));
    const editorRect = editor.getBoundingClientRect();

    return {
      editorRight: editorRect.right,
      lineCount: new Set(lineTops).size,
      pageClientWidth: document.documentElement.clientWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      rectRight: Math.max(...rects.map((rect) => rect.right)),
      scrollerClientWidth: scroller.clientWidth,
      scrollerScrollWidth: scroller.scrollWidth,
    };
  });

  expect(layout.lineCount).toBeGreaterThan(1);
  expect(layout.rectRight).toBeLessThanOrEqual(layout.editorRight + 0.5);
  expect(layout.scrollerScrollWidth).toBeLessThanOrEqual(layout.scrollerClientWidth);
  expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.pageClientWidth);
});

test("soft-wrapped code block keeps raw code text targeted", async ({ page }) => {
  await openLayoutFixture(page);
  await page.locator("#editor").evaluate((element) => {
    (element as HTMLElement).style.width = "230px";
  });
  const codeLine = "const value = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'].join('-')";
  await setDoc(page, `\`\`\`ts\n${codeLine}\n\`\`\`\nplain`, 0, false);

  const codeRects = await textRangeRects(page, 1, 0, codeLine.length);

  expect(codeRects.length).toBeGreaterThan(1);
  await expect(page.locator(".cm-line").nth(1).locator(".mbox-code-text")).toHaveText(codeLine);
});
