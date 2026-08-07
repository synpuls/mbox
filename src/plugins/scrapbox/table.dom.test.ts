import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxTableCellClassName,
  scrapboxTableHeaderClassName,
  scrapboxTableOpenerClassName,
  scrapboxTablePlugin,
  scrapboxTableRowClassName,
} from "./table.js";
import {
  scrapboxImagePlugin,
  scrapboxImagePreviewClassName,
  scrapboxImageStrongClassName,
  scrapboxImageTokenClassName,
} from "./image.js";
import {
  scrapboxIconClassName,
  scrapboxIconImageClassName,
  scrapboxLinkClassName,
  scrapboxLinkPlugin,
  scrapboxUrlClassName,
} from "./link.js";
import { scrapboxFormulaClassName, scrapboxFormulaPlugin } from "./formula.js";

type ObservedInlineImageFixture = {
  cases: Array<{
    input: string;
    facts: { isImage?: boolean; isStrong?: boolean };
  }>;
};

const observedInlineImageFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-image.observed.json",
);

function expectRenderedTableSemantics(parent: HTMLElement): void {
  const cells = parent.querySelectorAll<HTMLElement>(`.${scrapboxTableCellClassName}`);
  expect(cells).toHaveLength(4);
  expect([...cells].map((cell) => ({ role: cell.getAttribute("role"), colindex: cell.getAttribute("aria-colindex") }))).toEqual([
    { role: "columnheader", colindex: "1" },
    { role: "columnheader", colindex: "2" },
    { role: "cell", colindex: "1" },
    { role: "cell", colindex: "2" },
  ]);

  const table = parent.querySelector<HTMLElement>('[role="table"]');
  expect(table?.getAttribute("aria-rowcount")).toBe("2");
  expect(table?.getAttribute("aria-colcount")).toBe("2");
  expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);
}

describe("scrapboxTablePlugin", () => {
  it("matches every observed table image fact in the rendered DOM", () => {
    const fixture = JSON.parse(readFileSync(observedInlineImageFixturePath, "utf8")) as ObservedInlineImageFixture;
    const cases = fixture.cases.filter(({ input }) => input.startsWith("table:"));
    expect(cases).toHaveLength(3);

    for (const { input, facts } of cases) {
      const parent = document.createElement("div");
      const view = createEditorView({
        parent,
        state: EditorState.create({
          doc: input,
          extensions: [
            createMboxExtension({
              plugins: [scrapboxTablePlugin(), scrapboxImagePlugin({ renderMode: "preview" })],
            }),
          ],
        }),
      });
      const image = parent.querySelector(
        `.${scrapboxImageTokenClassName}, .${scrapboxImagePreviewClassName}`,
      );
      if ("isImage" in facts) expect(image !== null, input).toBe(facts.isImage);
      if ("isStrong" in facts) expect(image?.classList.contains(scrapboxImageStrongClassName) ?? false, input).toBe(facts.isStrong);
      view.destroy();
    }
  });

  it("stays wired through the table plugin when EditorState normalizes CRLF", () => {
    // This is deliberately an integration test, not CRLF parser coverage:
    // EditorState.create turns CRLF into LF before the plugin cache reads it.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\r\n a\tb\r\n",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll(`.${scrapboxTableCellClassName}`)].map((cell) => cell.textContent)).toEqual(["a", "b"]);
    view.destroy();
  });

  it("styles the table as an aligned grid in the editor view, with the first row as a header", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:example\n abc\tdef\n 12\t34",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxTableOpenerClassName}`)?.textContent).toBe("table:example");
    expect(parent.querySelectorAll(`.${scrapboxTableRowClassName}`).length).toBe(2);
    expect(parent.querySelectorAll(`.${scrapboxTableHeaderClassName}`).length).toBe(1);
    expect([...parent.querySelectorAll(`.${scrapboxTableCellClassName}`)].map((el) => el.textContent)).toEqual([
      "abc",
      "def",
      "12",
      "34",
    ]);
    // the leading indent and tab separators are hidden on this idle table
    expect(parent.textContent).not.toContain("\t");

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("scrapbox-table-0-row-1");
    expect(parent.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);

    view.destroy();
  });

  it("leaves page-link notation raw in a table opener because its name is not a table cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:[12345]\n a\tb",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const opener = parent.querySelector<HTMLElement>(`.${scrapboxTableOpenerClassName}`);
    expect(opener?.textContent).toBe("table:[12345]");
    expect(opener?.querySelector(`a.${scrapboxLinkClassName}`)).toBeNull();

    view.destroy();
  });

  it.each(["token", "preview"] as const)("renders a whole-cell page link in %s mode without losing table semantics", (renderMode) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n [12345]\tb\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxImagePlugin({ renderMode }), scrapboxLinkPlugin()] })],
      }),
    });

    expectRenderedTableSemantics(parent);
    const cells = parent.querySelectorAll<HTMLElement>(`.${scrapboxTableCellClassName}`);
    expect(cells[0].getAttribute("style")).toContain("--mbox-table-kit-column-width: 5ch");
    const pageLink = cells[0].querySelector<HTMLAnchorElement>(`a.${scrapboxLinkClassName}`);
    expect(pageLink?.textContent).toBe("12345");
    expect(pageLink?.getAttribute("href")).toBe("./12345");
    view.destroy();
  });

  it("renders a titled external link that occupies part of a table cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n a\tprefix [https://example.com title]\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const externalLink = parent.querySelector<HTMLAnchorElement>(`a.${scrapboxUrlClassName}`);
    expect(externalLink?.textContent).toBe("title");
    expect(externalLink?.getAttribute("href")).toBe("https://example.com");
    expect(externalLink?.closest(`.${scrapboxTableCellClassName}`)?.getAttribute("style")).toContain("--mbox-table-kit-column-width: 12ch");

    view.destroy();
  });

  it.each([
    [undefined, "alice", false],
    [(name: string) => `https://icons.example/${name}.png`, "", true],
  ] as const)("projects an icon cell conservatively when iconUrl is %s", (iconUrl, expectedText, hasImage) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n [alice.icon]\tb\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxLinkPlugin({ iconUrl })] })],
      }),
    });

    const cell = parent.querySelectorAll<HTMLElement>(`.${scrapboxTableCellClassName}`)[0];
    expect(cell.getAttribute("style")).toContain("--mbox-table-kit-column-width: 5ch");
    const icon = cell.querySelector<HTMLElement>(`a.${scrapboxIconClassName}`);
    expect(icon?.textContent).toBe(expectedText);
    expect(icon?.querySelector(`img.${scrapboxIconImageClassName}`) !== null).toBe(hasImage);

    view.destroy();
  });

  it("measures text and multiple icon widgets together in one cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n prefix [alice.icon] / [team/bob.icon]\tb\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const cell = parent.querySelectorAll<HTMLElement>(`.${scrapboxTableCellClassName}`)[0];
    expect(cell.getAttribute("style")).toContain("--mbox-table-kit-column-width: 18ch");
    expect(cell.textContent).toBe("prefix alice / bob");
    expect(cell.querySelectorAll(`a.${scrapboxIconClassName}`)).toHaveLength(2);

    view.destroy();
  });

  it.each(["token", "preview"] as const)("keeps a full-cell image raw in %s mode, because a figure breaks the fixed cell grid", (renderMode) => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n [https://example.com/i.png]\tb\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxImagePlugin({ renderMode })] })],
      }),
    });

    expectRenderedTableSemantics(parent);
    // Guard the removed behaviour directly: under the old skip set this is the
    // token/preview widget that used to land in a table cell.
    expect(parent.querySelector(`.${scrapboxImageTokenClassName}, .${scrapboxImagePreviewClassName}`)).toBeNull();
    expect([...parent.querySelectorAll(`.${scrapboxTableCellClassName}`)].map((cell) => cell.textContent)).toEqual([
      // This intentionally removes the previous image-widget behaviour: the
      // cell keeps `[https://…png]` visible as text.
      "[https://example.com/i.png]",
      "b",
      "c",
      "d",
    ]);

    view.destroy();
  });

  it("keeps a formula raw in a table cell, for the same reason as an image", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "table:t\n [$ x^2]\tb\n c\td",
        extensions: [createMboxExtension({ plugins: [scrapboxTablePlugin(), scrapboxFormulaPlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxFormulaClassName}`)).toBeNull();
    expect(parent.querySelector(`.${scrapboxTableCellClassName}`)?.textContent).toBe("[$ x^2]");

    view.destroy();
  });

  it("restores link, image, and formula source together on an active table row", () => {
    const source = " [12345]\t[https://example.com/i.png]\t[$ x^2]";
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: `table:t\n${source}\n c\td\te`,
        selection: EditorSelection.cursor(10),
        extensions: [
          createMboxExtension({
            plugins: [scrapboxTablePlugin(), scrapboxLinkPlugin(), scrapboxImagePlugin({ renderMode: "preview" }), scrapboxFormulaPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(10) });

    expect(parent.querySelectorAll(`a.${scrapboxLinkClassName}, .${scrapboxImageTokenClassName}, .${scrapboxImagePreviewClassName}, .${scrapboxFormulaClassName}`)).toHaveLength(0);
    expect(parent.querySelectorAll(".cm-line")[1]?.textContent).toBe(source);

    view.destroy();
  });
});
