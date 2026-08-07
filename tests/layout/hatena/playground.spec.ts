import { expect, test, type Page } from "@playwright/test";
import { openPlayground, setPlaygroundDoc, setPlaygroundSelection } from "../kit/playground-helpers";

// The Hatena playground is the "run it" story for the Hatena notation namespace:
// one editor wired with `hatenaPlugins()`. These smoke tests assert the core
// mbox promise (a marker is hidden while its line is inactive, revealed on
// selection) and the multi-line literal-block guarantee (super-pre inner text is
// never re-parsed as Hatena syntax).
test("hatena playground mounts a CodeMirror editor", async ({ page }) => {
  await openPlayground(page, "hatena");

  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Hatena playground editor" })).toBeVisible();
});

test("unfocused heading hides its `*` marker and reveals it on selection", async ({ page }) => {
  await openPlayground(page, "hatena");

  // Selection on line 2 keeps the heading line inactive, so its replace
  // decoration removes the raw `*` from the DOM text entirely.
  await setPlaygroundDoc(page, "hatena", "*Title\nplain", "*Title\nplain".length, true);
  await expect(page.locator(".cm-line").first()).toHaveText("Title");

  // Move the selection onto the heading line: the marker comes back.
  await setPlaygroundSelection(page, "hatena", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("*Title");
});

test("super-pre keeps its inner lines literal", async ({ page }) => {
  await openPlayground(page, "hatena");

  // The body line `*literal` is inside a super-pre block, so the heading plugin
  // must NOT hide its `*` — the raw text survives untouched.
  const doc = ">||\n*literal\n||<";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  await expect(page.locator(".cm-line").nth(1)).toHaveText("*literal");
});

test("hatena list content x stays stable between inactive and active states", async ({ page }) => {
  await openPlayground(page, "hatena");

  const doc = "-Hatena list item keeps its content column stable\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  const inactiveX = await textFragmentX(page, 0, "Hatena");

  await setPlaygroundSelection(page, "hatena", 0);
  const activeX = await textFragmentX(page, 0, "Hatena");

  expect(Math.abs(activeX - inactiveX)).toBeLessThanOrEqual(1);
});

test("hatena nested list wraps continuation lines at the content column", async ({ page }) => {
  await openPlayground(page, "hatena");
  await page.setViewportSize({ width: 420, height: 480 });

  const doc =
    "--Nested Hatena list item with a long body that wraps to another visual row and should not continue under the marker slot or indent boxes. ".repeat(
      4,
    );
  await setPlaygroundDoc(page, "hatena", doc, 0, true);

  const rows = await textVisualRows(page, 0, "Nested");
  expect(rows.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(rows[1].x - rows[0].x)).toBeLessThanOrEqual(1);
});

test("hatena heading line heights stay stable when focus reveals the marker", async ({ page }) => {
  await openPlayground(page, "hatena");

  // The demo dresses headings with vertical rhythm (padding); revealing the raw
  // `*` marker on focus must not change the line's height.
  for (const marker of ["*", "**", "***"]) {
    const doc = `${marker}Heading\nplain`;
    await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
    const inactive = await lineHeight(page, 0);

    await setPlaygroundSelection(page, "hatena", 0);
    const active = await lineHeight(page, 0);

    expect(Math.abs(active - inactive)).toBeLessThanOrEqual(0.5);
  }
});

test("hatena table line height stays stable when focus reveals the pipes", async ({ page }) => {
  await openPlayground(page, "hatena");

  // A bordered, padded table row must not change height when focus swaps the
  // rendered grid for the raw pipe text.
  const doc = "|*名前|*色|*個数|\n|りんご|赤|1|\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  const inactive = await lineHeight(page, 0);

  await setPlaygroundSelection(page, "hatena", 0);
  const active = await lineHeight(page, 0);

  expect(Math.abs(active - inactive)).toBeLessThanOrEqual(0.5);
});

test("hatena table hides its pipes while inactive and shows them on the active line", async ({ page }) => {
  await openPlayground(page, "hatena");

  // Selection sits on line 2, so line 1 (the header row) renders its grid with
  // the raw `|` pipes and `*` header markers removed from the DOM text.
  const doc = "|*名前|*色|\n|りんご|赤|";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  await expect(page.locator(".cm-line").first()).not.toContainText("|");
  await expect(page.locator(".cm-line").first()).toHaveText("名前色");

  // Move the selection onto the header row: the raw pipes and `*` come back.
  await setPlaygroundSelection(page, "hatena", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("|*名前|*色|");
});

test("a plain `>| ... |<` pre keeps its interior literal", async ({ page }) => {
  await openPlayground(page, "hatena");

  const doc = ">|\n*not a heading\n|<\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  // The pre body is literal: its `*` is not hidden into a heading.
  await expect(page.locator(".cm-line").nth(1)).toHaveText("*not a heading");
  await expect(page.locator(".cm-line.mbox-hatena-pre").first()).toBeVisible();
});

test("a `>URL>` cite blockquote shows the source URL when inactive", async ({ page }) => {
  await openPlayground(page, "hatena");

  const doc = ">http://example.com/>\n引用文\n<<\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  const cite = page.locator(".cm-line .mbox-hatena-quote-cite a").first();
  await expect(cite).toHaveText("http://example.com/");
});

test("a `>|lang|` super-pre shows a language label when inactive", async ({ page }) => {
  await openPlayground(page, "hatena");

  await setPlaygroundDoc(page, "hatena", ">|python|\ncode\n||<\nplain", ">|python|\ncode\n||<\nplain".length, true);
  await expect(page.locator(".cm-line .mbox-hatena-superpre-lang").first()).toHaveText("python");
  // The body text stays literal.
  await expect(page.locator(".cm-line").nth(1)).toHaveText("code");
});

test("an inactive footnote collapses to a numbered superscript with the note as tooltip", async ({ page }) => {
  await openPlayground(page, "hatena");

  const doc = "本文((脚注の内容))。\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  const sup = page.locator(".cm-line .mbox-hatena-footnote").first();
  await expect(sup).toHaveText("*1");
  expect(await sup.getAttribute("title")).toBe("脚注の内容");
  await expect(sup).toHaveAttribute("role", "doc-footnote");
  await expect(sup).toHaveAttribute("aria-label", "Footnote 1: 脚注の内容");

  // The active line reveals the raw (( )).
  await setPlaygroundSelection(page, "hatena", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("本文((脚注の内容))。");
});

test("a footnote line keeps its height when focus swaps the superscript for raw text", async ({ page }) => {
  await openPlayground(page, "hatena");

  // Inactive, the line shows a superscript (which is taller); active, it shows the
  // raw ((...)). The row must hold the taller height across both so focus doesn't
  // make it jump.
  const doc = "本文((脚注の内容))。\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  const inactive = await lineHeight(page, 0);

  await setPlaygroundSelection(page, "hatena", 0);
  const active = await lineHeight(page, 0);

  expect(Math.abs(active - inactive)).toBeLessThanOrEqual(0.5);
});

test("a definition list hides its colons and emphasises the term", async ({ page }) => {
  await openPlayground(page, "hatena");

  const doc = ":用語:説明\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, true);
  // Inactive line: both colons hidden, "用語説明" shown (term marked bold).
  await expect(page.locator(".cm-line").first()).toHaveText("用語説明");
  const termWeight = await page
    .locator(".cm-line .mbox-hatena-deflist-term")
    .first()
    .evaluate((el) => getComputedStyle(el).fontWeight);
  expect(termWeight).toBe("700");

  // Active line shows the raw colons for editing.
  await setPlaygroundSelection(page, "hatena", 0);
  await expect(page.locator(".cm-line").first()).toHaveText(":用語:説明");
});

test("a definition list stacks the term above its indented description", async ({ page }) => {
  await openPlayground(page, "hatena");

  // Selection stays on line 2, so line 1 renders inactive: the term (dt) is its
  // own block on the first visual row and the description (dd) drops to the next
  // row, indented — matching Hatena's stacked <dt>/<dd>.
  const doc = ":用語:これは説明です\nplain";
  await setPlaygroundDoc(page, "hatena", doc, doc.length, false);

  const rects = await page.locator(".cm-line").first().evaluate((line) => {
    const term = line.querySelector(".mbox-hatena-deflist-term");
    if (!term) {
      throw new Error("No deflist term on line 1");
    }
    const termRect = term.getBoundingClientRect();
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let descRect = null;
    let node = walker.nextNode();
    while (node) {
      const idx = (node.textContent ?? "").indexOf("説明");
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 2);
        descRect = range.getClientRects()[0];
        break;
      }
      node = walker.nextNode();
    }
    return { term: { x: termRect.x, y: termRect.y }, desc: descRect ? { x: descRect.x, y: descRect.y } : null };
  });

  expect(rects.desc).not.toBeNull();
  // dd is on a lower row than dt, and indented to its right.
  expect(rects.desc!.y).toBeGreaterThan(rects.term.y);
  expect(rects.desc!.x).toBeGreaterThan(rects.term.x);
});

test("a name-attribute heading hides `*name*` and shows only the text", async ({ page }) => {
  await openPlayground(page, "hatena");

  // `*name1*名前1` is a heading named `name1` whose text is 名前1.
  await setPlaygroundDoc(page, "hatena", "*name1*名前1\nplain", "*name1*名前1\nplain".length, true);
  await expect(page.locator(".cm-line").first()).toHaveText("名前1");

  // Focusing the heading line reveals the raw anchor for editing.
  await setPlaygroundSelection(page, "hatena", 0);
  await expect(page.locator(".cm-line").first()).toHaveText("*name1*名前1");
});

test("an ordered (`+`) list renders its items as numbers", async ({ page }) => {
  await openPlayground(page, "hatena");

  // `+` is the ordered-list form; the mbox marker slot shows the sequence
  // number instead of a bullet dot.
  await setPlaygroundDoc(page, "hatena", "+first\n+second\n+third", 0, false);
  const markers = await page.locator(".cm-line .mbox-hatena-list-marker-slot-ordered").allInnerTexts();
  expect(markers).toEqual(["1.", "2.", "3."]);
});

async function lineHeight(page: Page, lineIndex: number): Promise<number> {
  const height = await page.locator(".cm-line").nth(lineIndex).evaluate((el) => el.getBoundingClientRect().height);
  return height;
}

async function textFragmentX(page: Page, lineIndex: number, text: string): Promise<number> {
  const rect = await page.locator(".cm-line").nth(lineIndex).evaluate((line, target) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const content = node.textContent ?? "";
      const index = content.indexOf(target);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const rect = range.getClientRects()[0];
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      }
      node = walker.nextNode();
    }
    return null;
  }, text);
  expect(rect).not.toBeNull();
  return rect!.x;
}

async function textVisualRows(page: Page, lineIndex: number, markerText: string): Promise<{ x: number; y: number }[]> {
  return page.locator(".cm-line").nth(lineIndex).evaluate((line, target) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !(node.textContent ?? "").includes(target)) {
      node = walker.nextNode();
    }
    if (!node) {
      return [];
    }
    const text = node.textContent ?? "";
    const rows = new Map<number, number>();
    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index])) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (!rect) {
        continue;
      }
      const y = Math.round(rect.y);
      rows.set(y, Math.min(rows.get(y) ?? Number.POSITIVE_INFINITY, rect.x));
    }
    return Array.from(rows.entries())
      .sort(([a], [b]) => a - b)
      .map(([y, x]) => ({ x, y }));
  }, markerText);
}
