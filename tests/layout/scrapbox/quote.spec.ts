import { expect, test } from "@playwright/test";
import { openLayoutFixture, pixelAt, setDoc, setSelection, textRangeRect } from "../kit/helpers";

test("the quote body's x-position does not shift between focus states", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapbox" });
  await setDoc(page, ">quoted", 0, false);

  const bodyLeft = () =>
    page.evaluate(() => window.__mboxLayoutFixture?.rectForText("quoted")?.left ?? null);

  const unfocusedLeft = await bodyLeft();
  expect(unfocusedLeft).not.toBeNull();

  await page.locator(".cm-content").click();
  const focusedLeft = await bodyLeft();

  // Sub-pixel font-rendering rounding (well under 1px) is fine; a whole
  // character's width shifting is what this regression test guards against.
  expect(Math.abs((focusedLeft ?? 0) - (unfocusedLeft ?? 0))).toBeLessThan(1);
});

test("the quote's left border lines up with a normal line's text start", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxPresentation" });
  await setDoc(page, "normal\n>quoted", 0, false);

  const [normalTextLeft, quoteBorderLeft] = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".cm-line"));
    const rectForText = window.__mboxLayoutFixture?.rectForText;
    return [rectForText?.("normal")?.left, lines[1].getBoundingClientRect().left];
  });

  expect(quoteBorderLeft).toBe(normalTextLeft);
});

test("a translucent quote background lets the selection blend through instead of hiding it", async ({ page }) => {
  // The quote class sits on the `.cm-line`, which paints above drawSelection's
  // selection layer. An opaque background would cover the selection; the
  // supported contract is a translucent value, which composites over it -- this
  // guards that the blend actually survives to the painted pixel.
  await openLayoutFixture(page, { plugins: "scrapboxPresentation" });
  await page.addStyleTag({ content: "#editor { --mbox-scrapbox-quote-background: rgba(255, 0, 0, 0.4); }" });
  await setDoc(page, ">a b", 0, true);

  // Sample the space cell's centre -- background only, no glyph ink to skew it.
  const spaceRect = await textRangeRect(page, 0, 2, 3);
  const x = (spaceRect.left + spaceRect.right) / 2;
  const y = (spaceRect.top + spaceRect.bottom) / 2;

  // Collapsed selection at line start: pure quote tint over the editor bg.
  await setSelection(page, 0, 0);
  const unselected = await pixelAt(page, x, y);

  // Whole-line selection: the highlight now sits under the same tint.
  await setSelection(page, 0, 4);
  await expect
    .poll(() =>
      page.evaluate(
        ({ sampleX, sampleY }) =>
          Array.from(document.querySelectorAll(".cm-selectionBackground")).some((selection) => {
            const rect = selection.getBoundingClientRect();
            return rect.left <= sampleX && sampleX < rect.right && rect.top <= sampleY && sampleY < rect.bottom;
          }),
        { sampleX: x, sampleY: y },
      ),
    )
    .toBe(true);
  const selected = await pixelAt(page, x, y);

  // Identical pixels would mean the tint hid the selection; a real blend shifts
  // the colour. The threshold sits well above anti-aliasing noise but below the
  // selection-vs-editor-background delta the tint carries through.
  const delta =
    Math.abs(selected.r - unselected.r) + Math.abs(selected.g - unselected.g) + Math.abs(selected.b - unselected.b);
  expect(delta).toBeGreaterThan(12);
});
