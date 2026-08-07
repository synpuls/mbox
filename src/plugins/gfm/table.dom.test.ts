import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { type MboxPlugin, createMboxExtension } from "../../editor/plugin.js";
import { gfmInlinePlugin } from "./inline.js";
import { gfmFootnoteRefClassName } from "./footnote.js";
import { gfmImageClassNames, gfmImagePlugin } from "./image.js";
import { gfmInlineCodeClassName } from "./inline-code.js";
import { gfmLinkClassName, gfmLinkPlugin, gfmUnsafeLinkClassName } from "./link.js";
import { gfmMathClassName } from "./math.js";
import { gfmPlugins } from "./index.js";
import { parseGfmDocument } from "./parser.js";
import { gfmQuotePlugin } from "./quote.js";
import { gfmTablePlugin } from "./table.js";

describe("gfmTablePlugin semantics", () => {
  it("firewalls every non-table decoration out of an inactive discarded table tail", () => {
    const parent = document.createElement("div");
    const doc = [
      "| [keep](https://example.com) ![image](https://i.example/keep.png) [^keep] `code` **strong** $x$ | retained |",
      "| --- | --- |",
      "| kept | retained | [gone](https://example.com) ![image](https://i.example/gone.png) [^gone] `code` **strong** $y$ |",
      "",
      "[^keep]: retained note",
      "[^gone]: discarded note",
    ].join("\n");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({
          plugins: gfmPlugins({ math: { render: (expression) => {
            const element = document.createElement("span");
            element.textContent = expression;
            return element;
          } } }),
        })],
      }),
    });

    const retained = parent.querySelector('[role="columnheader"]');
    expect(retained).not.toBeNull();
    expect(retained?.querySelector(`.${gfmLinkClassName}`)).not.toBeNull();
    // The shared class, not the token one: the default renders a preview now,
    // and what this test is about is that SOME image decoration survives the
    // firewall, not which form it took.
    expect(retained?.querySelector(`.${gfmImageClassNames.image}`)).not.toBeNull();
    expect(retained?.querySelector(`.${gfmFootnoteRefClassName}`)).not.toBeNull();
    expect(retained?.querySelector(`.${gfmInlineCodeClassName}`)).not.toBeNull();
    expect(retained?.querySelector(".mbox-gfm-strong")).not.toBeNull();
    expect(retained?.querySelector(`.${gfmMathClassName}`)).not.toBeNull();

    const row = parent.querySelector(".mbox-gfm-table-row");
    expect(row).not.toBeNull();
    expect(row?.querySelector(`.${gfmLinkClassName}`)).toBeNull();
    expect(row?.querySelector(`.${gfmImageClassNames.token}`)).toBeNull();
    expect(row?.querySelector(`.${gfmFootnoteRefClassName}`)).toBeNull();
    expect(row?.querySelector(`.${gfmInlineCodeClassName}`)).toBeNull();
    expect(row?.querySelector(".mbox-gfm-strong")).toBeNull();
    expect(row?.querySelector(`.${gfmMathClassName}`)).toBeNull();

    view.destroy();
  });

  it("renders the complete table tree in the DOM only while all table rows are inactive", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| A | B |\n|:--|--:|\n| 1 | 2 |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin()] })],
      }),
    });

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    expect(table).not.toBeNull();
    expect(table?.getAttribute("aria-rowcount")).toBe("2");
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(table?.getAttribute("aria-owns")).toBe("gfm-table-0-row-1");
    expect(parent.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(parent.querySelectorAll('[role="cell"]')).toHaveLength(2);
    expect(parent.querySelector('.mbox-gfm-table-delimiter')?.getAttribute("aria-hidden")).toBe("true");

    view.destroy();
  });

  it("renders astral-text body cells without leaking the following pipe into the cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| h | h |\n| --- | --- |\n| 😀a | b |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll('[role="cell"]')].map((cell) => cell.textContent)).toEqual(["😀a", "b"]);

    view.destroy();
  });

  it("discards an inactive excess tail while preserving active source and short-row virtual cells", () => {
    const parent = document.createElement("div");
    const doc = "| a | b |\n| --- | --- |\n| 1 | [two](https://example.com) | 3 |\n| 9 |";
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin()] })],
      }),
    });

    const table = parent.querySelector<HTMLElement>('[role="table"]');
    const rows = [...parent.querySelectorAll<HTMLElement>(".mbox-gfm-table-row")];
    const longRowCells = [...rows[0].querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];
    const shortRowCells = [...rows[1].querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")];

    // The idle grid is the header. The third physical source cell is hidden
    // completely; the short row still receives its existing virtual cell.
    expect(table?.getAttribute("aria-colcount")).toBe("2");
    expect(longRowCells.map((cell) => cell.textContent)).toEqual(["1", "two"]);
    expect(rows[0].textContent).toBe("1two");
    expect(longRowCells.map((cell) => cell.getAttribute("role"))).toEqual(["cell", "cell"]);
    expect(longRowCells.map((cell) => cell.getAttribute("aria-colindex"))).toEqual(["1", "2"]);
    expect(longRowCells.map((cell) => cell.style.display)).toEqual(["inline-block", "inline-block"]);
    expect(longRowCells[1].querySelector(`.${gfmLinkClassName}`)?.textContent).toBe("two");
    expect(shortRowCells).toHaveLength(2);
    expect(shortRowCells.map((cell) => cell.textContent)).toEqual(["9", ""]);
    expect(shortRowCells.map((cell) => cell.getAttribute("aria-colindex"))).toEqual(["1", "2"]);
    // The virtual cell and its ordinary counterpart use the same style builder.
    expect(shortRowCells[1].getAttribute("style")).toBe(longRowCells[1].getAttribute("style"));
    expect(view.state.doc.toString()).toBe(doc);

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: doc.indexOf("3") } });
    expect(parent.querySelector('[role="table"]')).toBeNull();
    expect(parent.textContent).toContain("| 1 | [two](https://example.com) | 3 |");
    expect(parent.querySelectorAll(".mbox-gfm-table-cell.mbox-gfm-table-raw-cell")).toHaveLength(3);

    view.dispatch({ selection: { anchor: doc.lastIndexOf("9") } });
    expect(parent.querySelector('[role="table"]')).toBeNull();
    expect(parent.textContent).toContain("| 9 |");
    expect(rows[1].querySelectorAll(".mbox-gfm-table-cell")).toHaveLength(1);

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.doc.toString()).toBe(doc);

    view.destroy();
  });

  // What this can actually catch: a selection across the tail being blocked or
  // pushed elsewhere -- if the tail were ever made atomic, `selection.main`
  // would not be where it was asked to go. `sliceDoc` reads state, not the
  // view, so it cannot fail from a rendering bug; it is here to say plainly
  // that hiding the tail is a decoration and never an edit.
  it("lets a range selection span a discarded tail and still read the original source", () => {
    const parent = document.createElement("div");
    const row = "| keep | also | gone |";
    const doc = `| a | b |
| --- | --- |
${row}`;
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin()] })],
      }),
    });
    const from = doc.indexOf(row);
    const to = from + row.length;

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: from, head: to } });

    expect(view.state.selection.main).toMatchObject({ from, to });
    expect(view.state.sliceDoc(from, to)).toBe(row);
    expect(view.state.doc.toString()).toBe(doc);

    view.destroy();
  });

  it("orders same-position virtual cells by column and takes widths from the header", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| a | bbbbb | ccc |\n| --- | --- | --- |\n| x |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin()] })],
      }),
    });

    const headerCells = [...parent.querySelectorAll<HTMLElement>('[role="columnheader"]')];
    const bodyRow = parent.querySelector<HTMLElement>(".mbox-gfm-table-row");
    const bodyCells = [...(bodyRow?.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell") ?? [])];

    // Every body row is short, so 1ch / 5ch / 3ch can only have come from the
    // header. The final two cells are widgets at the same document position;
    // their DOM order must retain those distinct column widths.
    expect(headerCells.map((cell) => cell.style.getPropertyValue("--mbox-table-kit-column-width"))).toEqual(["1ch", "5ch", "3ch"]);
    expect(bodyCells.map((cell) => cell.textContent)).toEqual(["x", "", ""]);
    expect(bodyCells.map((cell) => cell.style.getPropertyValue("--mbox-table-kit-column-width"))).toEqual(["1ch", "5ch", "3ch"]);

    view.destroy();
  });

  it("renders escaped pipes inside their header and body cells", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| a \\| b | c |\n| --- | --- |\n| x \\| y | z |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmInlinePlugin()] })],
      }),
    });

    expect([...parent.querySelectorAll('[role="columnheader"]')].map((cell) => cell.textContent)).toEqual(["a | b", "c"]);
    expect([...parent.querySelectorAll('[role="cell"]')].map((cell) => cell.textContent)).toEqual(["x | y", "z"]);

    view.destroy();
  });

  it("renders in-cell inline syntax only while the table row is inactive", () => {
    const doc = "| **bold** |\n| --- |";
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmInlinePlugin()] })],
      }),
    });

    expect(parent.querySelector('[role="columnheader"]')?.textContent).toBe("bold");
    expect(parent.querySelector(".mbox-gfm-strong")?.textContent).toBe("bold");

    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: 2 } });

    expect(parent.querySelector('[role="table"]')).toBeNull();
    expect(parent.querySelector(".mbox-gfm-table-raw-cell")?.textContent).toBe(" **bold** ");
    expect(parent.querySelector(".mbox-gfm-strong")?.textContent).toBe("bold");

    view.destroy();
  });

  it("renders a table-cell image as a preview when previews are on", () => {
    // This used to force the token. It no longer does: the cell reserves a
    // column wide enough for a picture (see the reservation tests below), so
    // the picture can actually be looked at.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| ![alt](https://example.com/image.png) |\n| --- |",
        extensions: [
          createMboxExtension({ plugins: [gfmTablePlugin(), gfmImagePlugin({ renderMode: "preview" })] }),
        ],
      }),
    });

    expect(parent.querySelector(`.${gfmImageClassNames.preview}`)).not.toBeNull();

    view.destroy();
  });

  it("renders a table-cell image as a token when the host asks for tokens", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| ![alt](https://example.com/image.png) |\n| --- |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmImagePlugin({ renderMode: "token" })] })],
      }),
    });

    expect(parent.querySelector(`.${gfmImageClassNames.preview}`)).toBeNull();
    expect(parent.querySelector(`.${gfmImageClassNames.token}`)?.textContent).toBe("alt");

    view.destroy();
  });

  it("renders a projected link label inside a table cell", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| [**bold** label](url) | b |\n| --- | --- |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${gfmLinkClassName}`)?.textContent).toBe("bold label");

    view.destroy();
  });

  it("measures an image link label by the same text its anchor displays", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| [![alt](https://i.example/x.png)](https://example.com) | b |\n| --- | --- |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin()] })],
      }),
    });

    const cell = parent.querySelector<HTMLElement>('[role="columnheader"]');
    const anchor = cell?.querySelector(`.${gfmLinkClassName}`);
    expect(cell?.style.getPropertyValue("--mbox-table-kit-column-width")).toBe("3ch");
    expect(anchor?.textContent).toBe("alt");

    view.destroy();
  });

  it("keeps full-cell link and image widgets inside semantic, width-reserving body cells", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| a | b |\n| --- | --- |\n| [**bold** label](https://x.com) | ![image](https://example.com/image.png) |",
        // Tokens explicitly: this test is about cell roles, colindex and the
        // widths those cells derive from their text. Previews would add the
        // image column reservation, which has its own tests.
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin(), gfmImagePlugin({ renderMode: "token" })] })],
      }),
    });

    const row = parent.querySelector(".mbox-gfm-table-row");
    const cells = [...(row?.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell") ?? [])];

    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => cell.getAttribute("role"))).toEqual(["cell", "cell"]);
    expect(cells.map((cell) => cell.getAttribute("aria-colindex"))).toEqual(["1", "2"]);
    expect(cells.map((cell) => cell.style.getPropertyValue("--mbox-table-kit-column-width"))).toEqual(["10ch", "5ch"]);
    expect(cells[0].querySelector(`.${gfmLinkClassName}`)?.textContent).toBe("bold label");
    expect(cells[1].querySelector(`.${gfmImageClassNames.token}`)?.textContent).toBe("image");

    view.destroy();
  });

  it("keeps a partially covered link cell and an inline-styled cell intact", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "| a | b |\n| --- | --- |\n| see [a](url) here | **bold** |",
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmInlinePlugin(), gfmLinkPlugin()] })],
      }),
    });

    const row = parent.querySelector(".mbox-gfm-table-row");
    const cells = [...(row?.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell") ?? [])];

    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe("see a here");
    expect(cells[0].querySelector(`.${gfmLinkClassName}`)?.textContent).toBe("a");
    expect(cells[1].textContent).toBe("bold");
    expect(cells[1].querySelector(".mbox-gfm-strong")?.textContent).toBe("bold");

    view.destroy();
  });

  it.each([
    ["[](https://example.com)", gfmLinkClassName],
    ["[](javascript:alert(1))", gfmUnsafeLinkClassName],
  ])("renders an empty-label table link source for %s", (link, className) => {
    const parent = document.createElement("div");
    const doc = `| ${link} | b |\n| --- | --- |`;
    const displayValue = parseGfmDocument(doc).tables[0].header.cells[0].displayValue;
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin()] })],
      }),
    });

    expect(displayValue).toBe(link);
    expect(parent.querySelector(`.${className}`)?.textContent).toBe(displayValue);

    view.destroy();
  });

  it("keeps a nested link label's plain projection as the table width model", () => {
    const parent = document.createElement("div");
    const doc = "| [*a* **b**](https://example.com) |\n| --- |";
    const parsed = parseGfmDocument(doc);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmTablePlugin(), gfmLinkPlugin()] })],
      }),
    });

    const cell = parent.querySelector<HTMLElement>(".mbox-gfm-table-cell");
    const anchor = cell?.querySelector(`.${gfmLinkClassName}`);
    expect(parsed.links[0].text).toBe("a b");
    expect(parsed.tables[0].header.cells[0].displayValue).toBe("a b");
    expect(cell?.style.getPropertyValue("--mbox-table-kit-column-width")).toBe("3ch");
    expect(anchor?.textContent).toBe("a b");

    view.destroy();
  });
});

describe("gfmTablePlugin image column reservation", () => {
  const image = "![alt](https://example.com/i.png)";

  function columnWidths(doc: string, plugins: MboxPlugin[]): number[] {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({ doc, extensions: [createMboxExtension({ plugins })] }),
    });
    const widths = [...parent.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")].map((cell) => {
      const match = cell.getAttribute("style")?.match(/--mbox-table-kit-column-width: (\d+(?:\.\d+)?)ch/);
      return match ? Number(match[1]) : Number.NaN;
    });
    view.destroy();
    return widths;
  }

  const preview = () => [gfmTablePlugin(), gfmImagePlugin({ renderMode: "preview" })];

  // The table from the work list, one row per cell shape.
  it("reserves for a cell holding nothing but an image", () => {
    expect(columnWidths(`| ${image} | b |\n| --- | --- |`, preview())[0]).toBe(32);
  });

  it("reserves for a cell mixing an image with text", () => {
    expect(columnWidths(`| x ${image} | b |\n| --- | --- |`, preview())[0]).toBe(32);
  });

  it("reserves once for a cell holding several images", () => {
    // Two pictures share the column; reserving per image would double it.
    expect(columnWidths(`| ${image}${image} | b |\n| --- | --- |`, preview())[0]).toBe(32);
  });

  it("reserves for a cell whose image is wrapped in a link", () => {
    // The picture is drawn inside the link's anchor, so it occupies the cell
    // exactly as a bare one does. This was the other way round while such an
    // image was flattened to its alt text.
    expect(columnWidths(`| [${image}](/page) | b |\n| --- | --- |`, [...preview(), gfmLinkPlugin()])[0]).toBe(32);
  });

  it("reserves for a link-wrapped image even without the link plugin present", () => {
    // The reservation is a fact about the source, so it does not depend on
    // which plugin ends up drawing the picture.
    expect(columnWidths(`| [${image}](/page) | b |\n| --- | --- |`, preview())[0]).toBe(32);
  });

  it("reserves nothing for a link-wrapped image while images render as tokens", () => {
    const plugins = [gfmTablePlugin(), gfmImagePlugin({ renderMode: "token" }), gfmLinkPlugin()];
    expect(columnWidths(`| [${image}](/page) | b |\n| --- | --- |`, plugins)[0]).toBeLessThan(32);
  });

  it("does not reserve for a text-only cell", () => {
    expect(columnWidths("| text | b |\n| --- | --- |", preview())[0]).toBeLessThan(32);
  });

  it("does not shrink a column whose text is wider than the reservation", () => {
    const wide = "w".repeat(40);
    expect(columnWidths(`| ${image} | b |\n| --- | --- |\n| ${wide} | b |`, preview())[0]).toBe(40);
  });

  it("reserves nothing while images render as tokens", () => {
    // With tokens the cell shows alt text, which measures like any other text.
    // A 32-unit column would be 32 units of nothing.
    expect(columnWidths(`| ${image} | b |\n| --- | --- |`, [gfmTablePlugin(), gfmImagePlugin({ renderMode: "token" })])[0])
      .toBeLessThan(32);
  });

  it("reserves nothing when no image plugin is present at all", () => {
    expect(columnWidths(`| ${image} | b |\n| --- | --- |`, [gfmTablePlugin()])[0]).toBeLessThan(32);
  });

  it("gives hand-assembled plugins the same column as the bundle", () => {
    // The two plugins find each other through a facet, not through a shared
    // options object, so assembling them individually must not lose the link.
    const doc = `| ${image} | b |\n| --- | --- |`;
    const bundled = columnWidths(doc, gfmPlugins({ image: { renderMode: "preview" } }));
    const assembled = columnWidths(doc, preview());

    expect(assembled[0]).toBe(bundled[0]);
    expect(bundled[0]).toBe(32);
  });

  it("uses the width the host asked for", () => {
    const doc = `| ${image} | b |\n| --- | --- |`;
    expect(columnWidths(doc, [gfmTablePlugin({ imageMinimumColumnWidth: 12 }), gfmImagePlugin({ renderMode: "preview" })])[0]).toBe(12);
  });

  it("keeps a fractional width rather than rounding it", () => {
    // The unit is a grid step, so half a step is a real request.
    const doc = `| ${image} | b |\n| --- | --- |`;
    expect(columnWidths(doc, [gfmTablePlugin({ imageMinimumColumnWidth: 12.5 }), gfmImagePlugin({ renderMode: "preview" })])[0]).toBe(12.5);
  });

  it("reserves nothing when the host asks for zero", () => {
    const doc = `| ${image} | b |\n| --- | --- |`;
    expect(columnWidths(doc, [gfmTablePlugin({ imageMinimumColumnWidth: 0 }), gfmImagePlugin({ renderMode: "preview" })])[0]).toBeLessThan(32);
  });

  it.each([
    ["negative", -1],
    ["not finite", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
    ["not a number", "wide" as unknown as number],
  ])("falls back to the default for a %s width, without throwing", (_label, value) => {
    // Throwing in a plugin constructor takes the whole editor down over a
    // stylistic option; this repository normalises quietly instead.
    const doc = `| ${image} | b |\n| --- | --- |`;
    expect(() => columnWidths(doc, [gfmTablePlugin({ imageMinimumColumnWidth: value }), gfmImagePlugin({ renderMode: "preview" })]))
      .not.toThrow();
    expect(columnWidths(doc, [gfmTablePlugin({ imageMinimumColumnWidth: value }), gfmImagePlugin({ renderMode: "preview" })])[0]).toBe(32);
  });

  it("does not let an excess cell's image widen a column", () => {
    // An idle body row keeps only its header-participating cells, so an image
    // past the last column is not part of the grid and must not size it.
    const widths = columnWidths(`| a | b |\n| --- | --- |\n| x | y | ${image} |`, preview());

    expect(widths.every((width) => width < 32)).toBe(true);
  });

  it("keeps the reservation off the delimiter row", () => {
    const widths = columnWidths(`| a | b |\n| --- | --- |\n| ${image} | y |`, preview());

    // Only the first column reserves; the delimiter contributes nothing.
    expect(widths[0]).toBe(32);
  });
});

describe("gfmTablePlugin inside a blockquote", () => {
  function view(doc: string, selection?: number) {
    const parent = document.createElement("div");
    const editor = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        ...(selection === undefined ? {} : { selection: { anchor: selection } }),
        extensions: [createMboxExtension({ plugins: [gfmQuotePlugin(), gfmTablePlugin()] })],
      }),
    });
    return { parent, editor };
  }

  it("lays the columns out without a cell for the quote marker", () => {
    const { parent, editor } = view("> | a | bb |\n> | --- | --- |\n> | 1 | 2 |\ntrailing", 30);
    const rows = [...parent.querySelectorAll(".mbox-gfm-table-rendered")];
    const cellsPerRow = rows.map((row) => [...row.querySelectorAll(".mbox-gfm-table-cell")].map((cell) => cell.textContent));

    expect(cellsPerRow[0]).toEqual(["a", "bb"]);
    expect(cellsPerRow.at(-1)).toEqual(["1", "2"]);

    editor.destroy();
  });

  it("restores the whole physical line, quote marker included, while active", () => {
    const doc = "> | a | bb |\n> | --- | --- |\n> | 1 | 2 |";
    const { parent, editor } = view(doc, 2);
    Object.defineProperty(editor, "hasFocus", { value: true });
    editor.dispatch({ selection: { anchor: 2 } as never });

    // Strict equality: the marker and every space have to come back.
    expect(parent.querySelector(".cm-line")?.textContent).toBe("> | a | bb |");

    editor.destroy();
  });
});
