import { expect, test } from "@playwright/test";
import { openLayoutFixture, setDoc } from "../kit/helpers";

test("idle mbox footnotes expose linked reference and definition semantics", async ({ page }) => {
  await openLayoutFixture(page);
  const doc = "text[^1] more\n\n[^1]: the note";
  await setDoc(page, doc, doc.indexOf("\n\n") + 1, true);

  const reference = page.locator("#editor a.mbox-footnote-ref");
  await expect(reference).toHaveAttribute("href", "#mbox-footnote-15");
  await expect(reference).toHaveAttribute("role", "doc-noteref");
  await expect(reference).toHaveAttribute("aria-label", "Footnote 1");
  await expect(page.locator("#mbox-footnote-15")).toHaveAttribute("role", "doc-footnote");
  await expect(page.locator("#mbox-footnote-15 .mbox-footnote-marker")).toHaveAttribute("aria-hidden", "true");
});
