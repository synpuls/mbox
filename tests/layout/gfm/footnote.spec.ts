import { expect, test } from "@playwright/test";
import { openPlayground, setPlaygroundDoc, setPlaygroundSelection } from "../kit/playground-helpers";

test("idle GFM footnotes expose linked reference and definition semantics", async ({ page }) => {
  await openPlayground(page, "gfm");
  const doc = "text[^1] more\n\n[^1]: first\n  second";
  await setPlaygroundDoc(page, "gfm", doc, doc.indexOf("\n\n") + 1, true);

  const reference = page.locator("#editor a.mbox-gfm-footnote-ref");
  await expect(reference).toHaveAttribute("href", "#gfm-footnote-15");
  await expect(reference).toHaveAttribute("role", "doc-noteref");
  await expect(reference).toHaveAttribute("aria-label", "Footnote 1");
  await expect(page.locator("#gfm-footnote-15")).toHaveAttribute("role", "doc-footnote");
  await expect(page.locator("#gfm-footnote-15")).toHaveAttribute("aria-owns", "gfm-footnote-15-line-27");
  await expect(page.locator("#gfm-footnote-15-line-27")).toHaveCount(1);
  await expect(page.locator("#gfm-footnote-15 .mbox-gfm-footnote-marker")).toHaveAttribute("aria-hidden", "true");

  await setPlaygroundSelection(page, "gfm", doc.indexOf("  second"));
  await expect(page.locator("#editor a.mbox-gfm-footnote-ref")).toHaveCount(0);
  await expect(page.locator("#gfm-footnote-15")).toHaveCount(0);
  await expect(page.locator("#gfm-footnote-15-line-27")).toHaveCount(0);
  await expect(page.locator("#editor .mbox-gfm-footnote-marker")).not.toHaveAttribute("aria-hidden", "true");
});
