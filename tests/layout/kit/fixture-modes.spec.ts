import { expect, test } from "@playwright/test";
import { openLayoutFixture, removeHostStyleRules, routeSvgTestImage, setDoc } from "./helpers";

// These check the FIXTURE, not any product behaviour.
//
// Two later pieces of work need modes that did not exist: a GFM mode with
// image preview on, and a Scrapbox mode with an icon URL resolver (without a
// resolver an icon renders as text, so there is no image whose size could be
// measured at all). Their specs will assert what gets drawn. This file asserts
// only that the plumbing reaches them.
//
// The split matters. When an icon-sizing spec fails, "the icon is the wrong
// size" and "the resolver was never called" look identical from the outside.
// If these three checks are green, a failure downstream is about the product.

test("the GFM image-preview mode opens with an editor", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "gfmImagePreview" });

  expect(await page.evaluate(() => Boolean(window.__mboxLayoutFixture?.view))).toBe(true);
});

test("the Scrapbox icon mode opens with an editor", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "scrapboxIcon" });

  expect(await page.evaluate(() => Boolean(window.__mboxLayoutFixture?.view))).toBe(true);
});

test("an image request in the GFM preview mode reaches the routing helper", async ({ page }) => {
  const requested: string[] = [];
  await routeSvgTestImage(page, "**/__mbox-fixture-image__/**");
  page.on("request", (request) => {
    if (request.url().includes("__mbox-fixture-image__")) {
      requested.push(request.url());
    }
  });

  await openLayoutFixture(page, { plugins: "gfmImagePreview" });
  // Selection sits on the trailing line, so the image line stays idle and its
  // preview is rendered rather than shown as raw source.
  await setDoc(page, "![alt](/__mbox-fixture-image__/one.svg)\ntrailing", "![alt](/__mbox-fixture-image__/one.svg)\n".length);

  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toContain("/__mbox-fixture-image__/one.svg");
});

test("the Scrapbox icon mode calls its URL resolver with the icon's name", async ({ page }) => {
  const requested: string[] = [];
  await routeSvgTestImage(page, "**/__mbox-fixture-icon__/**", 32, 32);
  page.on("request", (request) => {
    if (request.url().includes("__mbox-fixture-icon__")) {
      requested.push(request.url());
    }
  });

  await openLayoutFixture(page, { plugins: "scrapboxIcon" });
  await setDoc(page, "[demo-user.icon]\ntrailing", "[demo-user.icon]\n".length);

  // The resolver builds the path from the icon's name, so seeing that name in
  // the request proves both that it ran and what it was handed.
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toContain("/__mbox-fixture-icon__/demo-user.svg");
});

test("the host stylesheet's rules can be removed so a library rule stands alone", async ({ page }) => {
  await openLayoutFixture(page, { plugins: "imagePreview" });

  // The fixture loads demos/styles.css, which sizes preview images the same way
  // a host would. A spec checking a library rule has to take the demo's out of
  // the way first; this asserts the mechanism works and actually matched
  // something, so a spec that relies on it cannot pass by removing nothing.
  const removed = await removeHostStyleRules(page, ".mbox-image-preview");
  const remaining = await page.evaluate(() => {
    const selectors: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(".mbox-image-preview")) {
            selectors.push(rule.selectorText);
          }
        }
      } catch {
        // cross-origin sheet; the fixture loads none
      }
    }
    return selectors;
  });

  expect(removed).toBeGreaterThan(0);
  // The host's rules are gone and the LIBRARY's survive -- that is the whole
  // point. A helper that took the library's rules too would leave the spec
  // measuring nothing, which is the failure it exists to prevent.
  expect(remaining.some((selector) => selector.startsWith("#editor"))).toBe(false);
  expect(remaining.every((selector) => selector.includes("\u037C"))).toBe(true);
  expect(remaining.length).toBeGreaterThan(0);
});

test("opening an unknown plugin mode fails instead of quietly using the default", async ({ page }) => {
  // The fallback is what makes a typo dangerous: the editor comes up, the
  // plugins are wrong, and every assertion after that reads as a product bug.
  await expect(openLayoutFixture(page, { plugins: "notAMode" as never })).rejects.toThrow();
});
