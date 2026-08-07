import { expect, test, type Page } from "@playwright/test";
import { openLayoutFixture, selectionHead, setDoc } from "../kit/helpers";

// This is the shipped multiline-math implementation: its first fence line is
// a widget and its content/closing-fence lines have `display: none` while idle.
const before = "mmmmmm";
const mathSource = "```math\nx^2\n```";
const after = "mmmmmm";
const doc = `${before}\n${mathSource}\n${after}`;
const beforeEnd = before.length;
const hiddenLines = ["x^2", "```"] as const;
const hiddenLineRanges = hiddenLines.map((line) => {
  const from = doc.indexOf(line, doc.indexOf("```math") + "```math".length);
  return { from, to: from + line.length, text: line };
});
const mathSourceLineCount = mathSource.split("\n").length;

function hiddenLineAt(pos: number): (typeof hiddenLineRanges)[number] | undefined {
  return hiddenLineRanges.find(({ from, to }) => pos >= from && pos <= to);
}

async function expectRawMathSourceRestored(page: Page): Promise<void> {
  // Reaching a hidden source line must activate the entire block in the same
  // update. Check its DOM lines directly: cm-content textContent does not
  // contain newlines between cm-line divs.
  const restored = await page.evaluate((sourceLines) => {
    const content = document.querySelector("#editor .cm-content");
    const lines = [...document.querySelectorAll<HTMLElement>("#editor .cm-line")];
    return (
      !document.querySelector("#editor .mbox-gfm-math") &&
      !!content &&
      sourceLines.every((sourceLine) =>
        lines.some(
          (line) => line.textContent === sourceLine && getComputedStyle(line).display !== "none",
        ),
      )
    );
  }, [...mathSource.split("\n")]);
  expect(restored).toBe(true);
}

async function expectCaretIsVisible(page: Page): Promise<void> {
  const visible = await page.evaluate(() => {
    const fixture = window.__mboxLayoutFixture;
    const content = document.querySelector<HTMLElement>("#editor .cm-content");
    if (!fixture || !content) {
      throw new Error("Layout fixture content is unavailable");
    }

    const rect = fixture.coordsAtPos(fixture.selectionHead());
    const contentRect = content.getBoundingClientRect();
    if (!rect) {
      return false;
    }

    // A position can have coordinates while still being swallowed by a hidden
    // line, so require a painted height inside the editor and the viewport.
    // Height is the whole check: `coordsAtPos` describes a caret, so its rect
    // is zero-width by definition (measured: left === right === 45 on the
    // opening fence, 72 on the content line). Demanding `right > left` would
    // fail on every implementation, which is how this assertion first read.
    return (
      rect.bottom > rect.top &&
      rect.left >= contentRect.left &&
      rect.right <= contentRect.right &&
      rect.top >= contentRect.top &&
      rect.bottom <= contentRect.bottom &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth &&
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight
    );
  });

  expect(visible).toBe(true);
}

async function moveAcrossHiddenLines(
  page: Page,
  key: "ArrowDown" | "ArrowRight" | "Shift+ArrowDown",
  maxMoves: number,
): Promise<void> {
  const reached = new Set<string>();

  for (let move = 0; move < maxMoves && reached.size < hiddenLineRanges.length; move += 1) {
    await page.keyboard.press(key);
    const hiddenLine = hiddenLineAt(await selectionHead(page));
    if (!hiddenLine || reached.has(hiddenLine.text)) {
      continue;
    }

    // This is intentionally not a poll: the update that places the caret on
    // a formerly hidden row must also make that row paintable.
    await expectRawMathSourceRestored(page);
    await expectCaretIsVisible(page);
    reached.add(hiddenLine.text);
  }

  expect([...reached].sort()).toEqual([...hiddenLines].sort());
}

test("ArrowDown reaches both hidden math-source lines and restores a visible caret", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, beforeEnd, true);
  await expect(page.locator("#editor .mbox-gfm-math")).toBeVisible();

  // The bound follows the number of raw math rows, rather than assuming how
  // many visual ArrowDown moves the widget consumes.
  await moveAcrossHiddenLines(page, "ArrowDown", mathSourceLineCount);
});

test("ArrowRight reaches both hidden math-source lines", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, beforeEnd, true);
  await expect(page.locator("#editor .mbox-gfm-math")).toBeVisible();

  // The raw document itself supplies the bound: every position from this
  // ordinary-line end through the closing fence is eligible to be visited.
  const closingFence = hiddenLineRanges.at(-1);
  if (!closingFence) {
    throw new Error("Hidden math-source lines are unavailable");
  }
  await moveAcrossHiddenLines(page, "ArrowRight", closingFence.to - beforeEnd);
});

// Selecting is not the same journey as moving. A non-empty range does NOT
// activate the block: measured, Shift+ArrowDown from the end of the preceding
// line puts the head at 7 with the widget still rendered, and the next press
// jumps the head to the end of the document (29), stepping over the whole
// collapsed block in one visual line. That is consistent — a hidden line has
// zero height, so visual-line motion has nothing to land on.
//
// What must hold is that nothing is lost: the selected text is the original
// source, hidden lines and all. That is the contract this pins, and it is the
// one that would break if hiding a line ever dropped it from the document.
test("Shift-ArrowDown selects the full raw math source across hidden lines", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmMath" });
  await setDoc(page, doc, beforeEnd, true);
  await expect(page.locator("#editor .mbox-gfm-math")).toBeVisible();

  // Bound by the raw row count plus the following row: enough presses to reach
  // the last line however many visual lines the collapsed block occupies.
  for (let move = 0; move < mathSourceLineCount + 1; move += 1) {
    await page.keyboard.press("Shift+ArrowDown");
  }

  const selectedSource = await page.evaluate(() => {
    const fixture = window.__mboxLayoutFixture?.view as
      | { state: { doc: { sliceString: (from: number, to: number) => string }; selection: { main: { anchor: number; head: number } } } }
      | undefined;
    if (!fixture) {
      throw new Error("Layout fixture view is unavailable");
    }
    const { anchor, head } = fixture.state.selection.main;
    return fixture.state.doc.sliceString(Math.min(anchor, head), Math.max(anchor, head));
  });

  // This exact source slice includes both fences and the previously hidden
  // content, proving that selection did not omit or replace original text.
  expect(selectedSource).toBe(`\n${mathSource}\n${after}`);
  await expectRawMathSourceRestored(page);
  await expectCaretIsVisible(page);
});
