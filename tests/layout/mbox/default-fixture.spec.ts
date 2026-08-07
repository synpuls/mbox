import { errors, expect, test, type Page } from "@playwright/test";
import { openLayoutFixture } from "../kit/helpers";

async function scrollDemoEditorUntilVisible(page: Page, selector: string) {
  for (let step = 0; step < 12; step += 1) {
    if ((await page.locator(selector).count()) > 0) {
      return;
    }

    await page.evaluate((index) => {
      window.scrollTo(0, index * 220);
    }, step);

    try {
      await page.locator(selector).first().waitFor({ state: "attached", timeout: 100 });
      return;
    } catch (error) {
      // Only "not there yet" is a reason to scroll again. A bad selector or a
      // closed page must surface now, not as a late count assertion twelve
      // steps later.
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }
    }
  }

  await expect(page.locator(selector)).not.toHaveCount(0);
}

test("layout fixture exposes a CodeMirror view", async ({ page }) => {
  await openLayoutFixture(page);
});

test("layout fixture supports an aria-labelledby editor name", async ({ page }) => {
  await openLayoutFixture(page, { labelledby: true });

  await expect(page.getByRole("textbox", { name: "Fixture editor" })).toBeVisible();
});


test("demo heading text is not underlined by CodeMirror default highlight", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "mbox demo editor" })).toBeVisible();

  const textDecorationLines = await page.evaluate(() => {
    const headingLine = document.querySelector("#editor .cm-line.mbox-h1");
    if (!headingLine) {
      throw new Error("No demo heading line found");
    }

    return [headingLine, ...Array.from(headingLine.querySelectorAll("*"))].map((element) => getComputedStyle(element).textDecorationLine);
  });

  expect(textDecorationLines.every((line) => line === "none")).toBe(true);
});



test("demo does not turn bracket syntax inside code blocks into page links", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor a.mbox-page-link", { hasText: "page link" })).toHaveCount(1);
  await expect(page.locator("#editor a.mbox-page-link", { hasText: "basicSetup, markdown()" })).toHaveCount(0);
});


test("demo code block is targeted by CodeBlockPlugin", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ((window as typeof window & { __mboxCopiedCodeBlocks?: string[] }).__mboxCopiedCodeBlocks ??= []).push(text);
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor .cm-line.mbox-code-block")).toHaveCount(6);
  await expect(page.locator("#editor .cm-line.mbox-code-fence-line")).toHaveCount(2);
  await expect(page.locator("#editor .cm-line.mbox-code-header-line")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-code-opening-fence-line")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-code-closing-fence-line")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-code-content-line")).toHaveCount(4);
  await expect(page.locator("#editor .mbox-code-info")).toHaveText("sample.ts");
  await expect(page.locator("#editor .mbox-code-language-label")).toHaveText("sample.ts");
  await expect(page.locator("#editor .mbox-code-copy-button")).toHaveText("Copy");
  await expect(page.locator("#editor .mbox-code-text", { hasText: "extensions: [basicSetup, markdown()]" })).toHaveCount(1);
  await expect(page.locator("#editor .cm-content")).not.toContainText("```sample.ts");

  const backgrounds = await page.evaluate(() => {
    const fenceLine = document.querySelector("#editor .cm-line.mbox-code-opening-fence-line");
    const closingFenceLine = document.querySelector("#editor .cm-line.mbox-code-closing-fence-line");
    const contentLine = document.querySelector("#editor .cm-line.mbox-code-content-line");
    const copyButton = document.querySelector("#editor .mbox-code-copy-button");
    if (!fenceLine || !closingFenceLine || !contentLine || !copyButton) {
      throw new Error("Code block lines were not found");
    }

    const fenceLineRect = fenceLine.getBoundingClientRect();
    const copyButtonRect = copyButton.getBoundingClientRect();
    return {
      fence: getComputedStyle(fenceLine).backgroundColor,
      content: getComputedStyle(contentLine).backgroundColor,
      fencePaddingLeft: getComputedStyle(fenceLine).paddingLeft,
      fenceRadius: getComputedStyle(fenceLine).borderTopLeftRadius,
      closingFenceRadius: getComputedStyle(closingFenceLine).borderBottomLeftRadius,
      contentPaddingLeft: getComputedStyle(contentLine).paddingLeft,
      copyButtonFloat: getComputedStyle(copyButton).float,
      copyButtonMarginLeft: getComputedStyle(copyButton).marginLeft,
      copyButtonBorderRadius: getComputedStyle(copyButton).borderTopLeftRadius,
      copyButtonPaddingLeft: getComputedStyle(copyButton).paddingLeft,
      copyButtonRight: copyButtonRect.right,
      copyButtonCenterY: copyButtonRect.top + copyButtonRect.height / 2,
      fenceLineCenterY: fenceLineRect.top + fenceLineRect.height / 2,
      fenceLineRight: fenceLineRect.right,
    };
  });

  expect(backgrounds.fence).toBe("rgba(228, 231, 236, 0.72)");
  expect(backgrounds.content).toBe("rgba(248, 250, 252, 0.72)");
  expect(backgrounds.fencePaddingLeft).toBe("10px");
  expect(backgrounds.fenceRadius).toBe("6px");
  expect(backgrounds.closingFenceRadius).toBe("6px");
  expect(backgrounds.contentPaddingLeft).toBe("10px");
  expect(backgrounds.copyButtonFloat).toBe("right");
  expect(backgrounds.copyButtonMarginLeft).toBe("8px");
  expect(backgrounds.copyButtonBorderRadius).toBe("4px");
  expect(backgrounds.copyButtonPaddingLeft).toBe("5px");
  expect(backgrounds.fenceLineRight - backgrounds.copyButtonRight).toBeCloseTo(10, 0);
  expect(backgrounds.copyButtonCenterY).toBeCloseTo(backgrounds.fenceLineCenterY, 0);

  await page.locator("#editor .mbox-code-copy-button").click();
  await expect(page.locator("#editor .mbox-code-copy-button")).toHaveText("Copied");
  await expect(page.locator("#editor .mbox-code-copy-button")).toHaveText("Copy", { timeout: 1500 });
  const copied = await page.waitForFunction(() => {
    const values = (window as typeof window & { __mboxCopiedCodeBlocks?: string[] }).__mboxCopiedCodeBlocks ?? [];
    return values[0] ?? null;
  });
  const copiedText = await copied.jsonValue();

  expect(copiedText).toContain('const syntax = ["[page link]", ":smile:", "~~strikethrough~~"];');
  expect(copiedText).not.toContain("```");
});


test("demo opts into code block syntax highlight", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor .mbox-code-token").filter({ hasText: "const" })).toHaveCount(2);
  const colors = await page.evaluate(() => {
    const keyword = document.querySelector("#editor .mbox-code-token.tok-keyword");
    const content = document.querySelector("#editor .cm-content");
    if (!keyword || !content) {
      throw new Error("Code highlight token was not found");
    }

    return {
      keyword: getComputedStyle(keyword).color,
      content: getComputedStyle(content).color,
    };
  });

  expect(colors.keyword).not.toBe(colors.content);
});


test("demo quote block is targeted by QuotePlugin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor .cm-line.mbox-quote")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-quote")).toHaveText("An example quote.");
  await expect(page.locator("#editor .mbox-quote-syntax-hide")).toHaveCount(0);
});


test("demo table block is targeted by TablePlugin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor .cm-line.mbox-table")).toHaveCount(4);
  await expect(page.locator("#editor .cm-line.mbox-table-header")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-table-delimiter")).toHaveCount(1);
  await expect(page.locator("#editor .cm-line.mbox-table-row")).toHaveCount(2);
  await expect(page.locator("#editor .mbox-table-cell", { hasText: "Syntax" })).toHaveCount(1);
  await expect(page.locator("#editor .mbox-table-cell", { hasText: "Example" })).toHaveCount(1);

  const firstColumnCells = await page.locator("#editor .mbox-table-cell").evaluateAll((cells) =>
    [cells[0], cells[2], cells[4]].map((cell) => {
      const style = getComputedStyle(cell);
      return {
        background: style.backgroundColor,
        display: style.display,
        width: cell.getBoundingClientRect().width,
      };
    }),
  );
  const renderedTableLine = await page.locator("#editor .cm-line.mbox-table-rendered").first().evaluate((line) => ({
    alignItems: getComputedStyle(line).alignItems,
    display: getComputedStyle(line).display,
  }));
  const longCell = await page.locator("#editor .mbox-table-cell", { hasText: "sample.ts" }).evaluate((cell) => {
    const style = getComputedStyle(cell);
    const range = document.createRange();
    range.selectNodeContents(cell);
    const textLineTops = [...range.getClientRects()].map((rect) => Math.round(rect.top));
    return {
      extraWidth: style.getPropertyValue("--mbox-table-column-extra-width").trim(),
      lineCount: new Set(textLineTops).size,
      whiteSpace: style.whiteSpace,
    };
  });

  expect(renderedTableLine.display).toBe("flex");
  expect(renderedTableLine.alignItems).toBe("stretch");
  expect(firstColumnCells.every((cell) => cell.display === "block")).toBe(true);
  expect(longCell.extraWidth).toBe("5ch");
  expect(longCell.whiteSpace).not.toBe("nowrap");
  expect(longCell.lineCount).toBe(1);
  expect(firstColumnCells[0].background).toBe("rgba(241, 245, 249, 0.7)");
  expect(firstColumnCells[1].background).toBe("rgba(248, 250, 252, 0.58)");
  expect(firstColumnCells[1].width).toBeCloseTo(firstColumnCells[0].width, 0);
  expect(firstColumnCells[2].width).toBeCloseTo(firstColumnCells[0].width, 0);
});


test("demo inline code is targeted by InlineCodePlugin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await scrollDemoEditorUntilVisible(page, "#editor .mbox-inline-code");

  await expect(page.locator("#editor .mbox-inline-code", { hasText: "inline code" })).toHaveCount(1);
});


test("demo inline styles are targeted by InlineStylePlugin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await scrollDemoEditorUntilVisible(page, "#editor .mbox-em");

  await expect(page.locator("#editor .mbox-em", { hasText: "emphasis" })).toHaveCount(1);
  await expect(page.locator("#editor .mbox-strong", { hasText: "bold" })).toHaveCount(1);
  await expect(page.locator("#editor .mbox-strike", { hasText: "strikethrough" })).toHaveCount(1);
});


test("demo opts into Markdown image preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();
  await scrollDemoEditorUntilVisible(page, "#editor .mbox-image-preview");

  const preview = page.locator("#editor .mbox-image-preview");
  await expect(preview).toHaveCount(1);
  await expect(preview.locator("img")).toHaveAttribute("src", "/demos/sample-image.png");
});


test("demo task list is targeted by TaskListPlugin", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.locator("#editor .cm-line.mbox-task-list")).toHaveCount(1);
  await expect(page.locator("#editor .mbox-task-checkbox")).toBeChecked();
  await expect(page.locator("#editor .cm-line.mbox-task-list")).toHaveText("A completed task");
});


test("demo accessibility tree does not expose bracket syntax inside code blocks as links", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#editor .cm-editor")).toBeVisible();

  await expect(page.getByRole("link", { name: "page link" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "basicSetup, markdown()" })).toHaveCount(0);
});
