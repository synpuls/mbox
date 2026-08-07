import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createTableCellSpecs,
  createTableHeaderRowSpecs,
  createTableLineSpecs,
  createTablePipeHideSpecs,
  createTableWhitespaceHideSpecs,
  displayWidth,
} from "./table-kit.js";
import type { TableKitClassNames, TableKitRow } from "./table-kit.js";
import { createMboxDecorationSetStrict, type MboxDecorationSpec, type MboxPlugin } from "../editor/plugin.js";
import { createTestContext } from "../editor/test-context.js";
import { gfmTablePlugin } from "./gfm/table.js";
import { hatenaTablePlugin } from "./hatena/table.js";
import { tablePlugin } from "./mbox/table.js";
import { scrapboxTablePlugin } from "./scrapbox/table.js";

// mark/line specs carry className/attributes that MboxDecorationSpec's union
// hides from replace specs; every access below is on a known non-replace spec.
function styled(spec: MboxDecorationSpec): { className: string; attributes?: { style: string } } {
  return spec as unknown as { className: string; attributes?: { style: string } };
}

function columnWidth(spec: MboxDecorationSpec): number {
  const style = styled(spec).attributes?.style;
  // Fractional widths are legitimate: a minimum is expressed in grid units,
  // and a caller with its own measureWidth can choose any scale for them.
  const match = style?.match(/--mbox-table-kit-column-width: (\d+(?:\.\d+)?)ch/);
  if (!match) throw new Error(`Expected a column-width style, received ${style ?? "no style"}`);
  return Number(match[1]);
}

const classNames: TableKitClassNames = {
  table: "test-table",
  renderedLine: "test-rendered",
  cell: "test-cell",
  rawCell: "test-raw-cell",
};

const pluginsDirectory = fileURLToPath(new URL(".", import.meta.url));
const tableKitPath = fileURLToPath(new URL("./table-kit.ts", import.meta.url));
const adapterDirectories = ["gfm", "mbox", "scrapbox", "hatena"].map((adapter) => resolve(pluginsDirectory, adapter));
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"];

function relativeModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const staticModule = /\b(?:import|export)\s+(?:(?:type\s+)?[\w*$\s{},]+\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;
  const dynamicModule = /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  for (const pattern of [staticModule, dynamicModule]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]!);
  }
  return [...specifiers];
}

function resolveRelativeModule(from: string, specifier: string): string | undefined {
  const unresolved = resolve(dirname(from), specifier);
  const withoutExtension = extname(unresolved) ? unresolved.slice(0, -extname(unresolved).length) : unresolved;
  const candidates = [
    unresolved,
    ...sourceExtensions.map((extension) => withoutExtension + extension),
    ...sourceExtensions.map((extension) => resolve(withoutExtension, "index" + extension)),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function adapterDependencyPath(entry: string): string[] | undefined {
  const pending: Array<{ file: string; path: string[] }> = [{ file: entry, path: [entry] }];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current.file)) continue;
    visited.add(current.file);
    if (adapterDirectories.some((adapter) => current.file === adapter || current.file.startsWith(adapter + sep))) {
      return current.path;
    }
    for (const specifier of relativeModuleSpecifiers(readFileSync(current.file, "utf8"))) {
      const dependency = resolveRelativeModule(current.file, specifier);
      if (dependency) pending.push({ file: dependency, path: [...current.path, dependency] });
    }
  }
  return undefined;
}

function displayDependencyPath(path: string[]): string {
  return path.map((file) => relative(pluginsDirectory, file)).join(" → ");
}

// "| A | Bb |" -> pipes at 0, 4, 11; cells: A at [2,3), Bb at [6,10)
function headerRow(): TableKitRow {
  return {
    className: "test-header",
    line: 1,
    from: 0,
    to: 12,
    cells: [
      { from: 1, to: 4, content: { from: 2, to: 3 }, value: " A " },
      { from: 4, to: 11, content: { from: 6, to: 10 }, value: " Bb " },
    ],
  };
}

function delimiterRow(): TableKitRow {
  return {
    className: "test-delimiter",
    includeInColumnWidths: false,
    line: 2,
    from: 13,
    to: 25,
    cells: [
      { from: 14, to: 17, content: { from: 14, to: 17 }, value: "---", className: "test-delimiter-cell" },
      { from: 17, to: 24, content: { from: 17, to: 24 }, value: "------", className: "test-delimiter-cell" },
    ],
  };
}

function bodyRow(): TableKitRow {
  return {
    className: "test-row",
    line: 3,
    from: 26,
    to: 33,
    cells: [
      { from: 27, to: 29, content: { from: 27, to: 28 }, value: "1" },
      { from: 29, to: 32, content: { from: 29, to: 32 }, value: "ab" },
    ],
  };
}

describe("table-kit caller boundary", () => {
  it("does not import notation adapters", () => {
    // Follow only local modules, including re-exports, so the direction is
    // architectural rather than merely a direct-import convention. Adapters
    // may import the kit; the inverse is intentionally not asserted.
    const path = adapterDependencyPath(tableKitPath);
    expect(path, path && `table-kit must not reach a notation adapter: ${displayDependencyPath(path)}`).toBeUndefined();
  });

  const optionalFieldCases = [
    {
      field: "displayValue",
      rows: () => [{ line: 1, from: 0, to: 9, cells: [{ from: 1, to: 8, content: { from: 1, to: 8 }, value: " source ", displayValue: "x" }] }],
      assert: (rows: TableKitRow[]) => {
        expect(columnWidth(createTableCellSpecs(rows, new Set(), classNames)[0])).toBe(1);
      },
    },
    {
      field: "virtual",
      rows: () => [{ line: 1, from: 0, to: 1, cells: [{ from: 1, to: 1, content: { from: 1, to: 1 }, value: "", virtual: true }] }],
      assert: (rows: TableKitRow[]) => {
        expect(createTableCellSpecs(rows, new Set(), classNames)[0]).toMatchObject({ type: "widget", from: 1 });
        expect(createTableCellSpecs(rows, new Set([1]), classNames)).toEqual([]);
      },
    },
    {
      field: "excludeFromSemantics",
      rows: () => [{ line: 1, from: 0, to: 3, cells: [{ from: 1, to: 2, content: { from: 1, to: 2 }, value: "x", excludeFromSemantics: true }] }],
      assert: (rows: TableKitRow[]) => {
        expect(styled(createTableCellSpecs(rows, new Set(), classNames, {}, { tableId: "t" })[0]).attributes).toEqual({
          style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;",
        });
      },
    },
    {
      field: "columnCount",
      rows: () => [{ line: 1, from: 0, to: 3, cells: [{ from: 1, to: 2, content: { from: 1, to: 2 }, value: "x" }] }],
      assert: (rows: TableKitRow[]) => {
        expect(styled(createTableLineSpecs(rows, new Set(), classNames, { tableId: "t", columnCount: 3 })[0]).attributes).toEqual(expect.objectContaining({
          "aria-colcount": "3",
        }));
      },
    },
  ] as const;

  it.each(optionalFieldCases)("uses caller-supplied $field as policy, without inferring any other field", ({ rows, assert }) => {
    assert(rows());
  });

  it("composes projection, virtual layout, excluded semantics, and logical column count without coupling them", () => {
    const rows: TableKitRow[] = [
      { line: 1, from: 0, to: 8, cells: [
        { from: 1, to: 6, content: { from: 1, to: 6 }, value: " **x** ", displayValue: "x" },
        { from: 7, to: 8, content: { from: 7, to: 8 }, value: "b" },
      ] },
      { line: 2, from: 9, to: 12, cells: [
        { from: 10, to: 11, content: { from: 10, to: 11 }, value: "y" },
        { from: 12, to: 12, content: { from: 12, to: 12 }, value: "", virtual: true },
        { from: 11, to: 12, content: { from: 11, to: 12 }, value: "z", excludeFromSemantics: true },
      ] },
    ];
    const semantics = { tableId: "t", columnCount: 2 };
    const cells = createTableCellSpecs(rows, new Set(), classNames, {}, semantics);

    expect(columnWidth(cells[0])).toBe(1);
    expect(cells[3]).toMatchObject({ type: "widget", from: 12 });
    expect(styled(cells[4]).attributes).not.toHaveProperty("role");
    expect(styled(createTableLineSpecs(rows, new Set(), classNames, semantics)[0]).attributes).toEqual(expect.objectContaining({ "aria-colcount": "2" }));
  });

  // These are the five meaningful equivalence classes for the four optional
  // inputs. `displayValue` changes width only; `virtual` is an idle-only
  // presentation cell; `excludeFromSemantics` changes ARIA only; and
  // `columnCount` changes table ARIA only. Each is independently meaningful,
  // and the all-four case covers their composition.
  //
  // All 16 boolean combinations are not valid useful inputs: `virtual` and a
  // non-empty `displayValue` cannot coexist meaningfully because virtual cells
  // have no displayed source, while `excludeFromSemantics` on a virtual cell is
  // redundant because virtual cells never receive cell ARIA. `columnCount`
  // remains independent. The single-field cases plus the all-field case expose
  // every effect and every pair's lack of inference without mechanically
  // duplicating equivalent states.

  function loweredSpecs(doc: string, plugin: MboxPlugin, activeLines: Iterable<number>) {
    const context = createTestContext(doc, { activeLines });
    const decorations = createMboxDecorationSetStrict(context.state, plugin.decorations!(context));
    const output: Array<Record<string, unknown>> = [];
    decorations.between(0, doc.length, (from, to, value) => {
      const decoration = value as typeof value & {
        isReplace?: boolean;
        point?: boolean;
        startSide: number;
        endSide: number;
        spec: { class?: string; attributes?: Record<string, string>; widget?: unknown };
      };
      const kind = decoration.isReplace ? "replace"
        : decoration.spec.widget ? "widget"
        : decoration.point ? "line"
        : "mark";
      output.push({
        kind,
        from,
        to,
        startSide: decoration.startSide,
        endSide: decoration.endSide,
        ...(decoration.spec.class ? { className: decoration.spec.class } : {}),
        ...(decoration.spec.attributes ? { attributes: decoration.spec.attributes } : {}),
        ...(decoration.spec.widget ? { widget: (decoration.spec.widget as { constructor: { name: string } }).constructor.name } : {}),
      });
    });
    return output;
  }

  it("keeps the lowered table-kit rows and cells unchanged for non-GFM consumers, idle and active", () => {
    // These consumers do not supply table-kit policy fields. Pin a boundary
    // lens over their lowered rows and cells: ranges, boundary sides, class
    // names, widths, and ARIA at the first and last records. Pipe/whitespace
    // replacements are covered by their focused tests below.
    const consumers = [
      { name: "mbox", doc: "| A | B |\n| --- | --- |\n| 1 | 2 |", plugin: tablePlugin(), activeLines: [3] },
      { name: "scrapbox", doc: "table:t\n a\tb\n c\td", plugin: scrapboxTablePlugin(), activeLines: [3] },
      { name: "hatena", doc: "|*a|b|\n|c|d|", plugin: hatenaTablePlugin(), activeLines: [2] },
    ] as const;

    const loweredByConsumer = Object.fromEntries(
      consumers.flatMap(({ name, doc, plugin, activeLines }) => [
        [name + ": idle", tableKitBoundaryRecords(loweredSpecs(doc, plugin, []))],
        [name + ": active", tableKitBoundaryRecords(loweredSpecs(doc, plugin, activeLines))],
      ]),
    );
    // Each tuple is [kind, from, to, startSide, endSide, className, attributes].
    // The input strings above make the ranges directly reviewable. This lens
    // intentionally fixes the first and last kit row/cell in each state. It
    // does not cover failures unique to intermediate rows/cells: delimiter
    // rows are owned by createTableLineSpecs tests, partial-active cells by
    // createTableCellSpecs tests, and virtual/excess cells by the caller-
    // boundary virtual/excludeFromSemantics tests.
    expect(loweredByConsumer).toEqual({
      "mbox: idle": [
        ["line", 0, 0, -200000000, -200000000, "mbox-table mbox-table-header mbox-table-rendered", { id: "mbox-table-0", role: "table", "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "mbox-table-0-row-1", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 2, 3, -1, 1, "mbox-table-cell", { role: "columnheader", "aria-colindex": "1", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
        ["line", 24, 24, -200000000, -200000000, "mbox-table mbox-table-row mbox-table-rendered", { id: "mbox-table-0-row-1", role: "row", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 30, 31, -1, 1, "mbox-table-cell", { role: "cell", "aria-colindex": "2", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
      ],
      "mbox: active": [
        ["line", 0, 0, -200000000, -200000000, "mbox-table mbox-table-header mbox-table-rendered", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 2, 3, -1, 1, "mbox-table-cell", { style: "--mbox-table-kit-column-width: 1ch" }],
        ["line", 24, 24, -200000000, -200000000, "mbox-table mbox-table-row", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 29, 32, 500000000, -600000000, "mbox-table-cell mbox-table-raw-cell", null],
      ],
      "scrapbox: idle": [
        ["line", 8, 8, -200000000, -200000000, "mbox-scrapbox-table mbox-scrapbox-table-row mbox-scrapbox-table-header mbox-scrapbox-table-rendered", { id: "scrapbox-table-0", role: "table", "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "scrapbox-table-0-row-1", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 9, 10, -1, 1, "mbox-scrapbox-table-cell", { role: "columnheader", "aria-colindex": "1", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
        ["line", 13, 13, -200000000, -200000000, "mbox-scrapbox-table mbox-scrapbox-table-row mbox-scrapbox-table-rendered", { id: "scrapbox-table-0-row-1", role: "row", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 16, 17, -1, 1, "mbox-scrapbox-table-cell", { role: "cell", "aria-colindex": "2", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
      ],
      "scrapbox: active": [
        ["line", 8, 8, -200000000, -200000000, "mbox-scrapbox-table mbox-scrapbox-table-row mbox-scrapbox-table-header mbox-scrapbox-table-rendered", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 9, 10, -1, 1, "mbox-scrapbox-table-cell", { style: "--mbox-table-kit-column-width: 1ch" }],
        ["line", 13, 13, -200000000, -200000000, "mbox-scrapbox-table mbox-scrapbox-table-row", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 16, 17, 500000000, -600000000, "mbox-scrapbox-table-cell mbox-scrapbox-table-raw-cell", null],
      ],
      "hatena: idle": [
        ["line", 0, 0, -200000000, -200000000, "mbox-hatena-table mbox-hatena-table-row mbox-hatena-table-rendered", { id: "hatena-table-0", role: "table", "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "hatena-table-0-row-1", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 2, 3, -1, 1, "mbox-hatena-table-cell mbox-hatena-table-header-cell", { role: "columnheader", "aria-colindex": "1", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
        ["line", 7, 7, -200000000, -200000000, "mbox-hatena-table mbox-hatena-table-row mbox-hatena-table-rendered", { id: "hatena-table-0-row-1", role: "row", style: "--mbox-table-kit-cell-max-width: 50%; display: flex !important" }],
        ["mark", 10, 11, -1, 1, "mbox-hatena-table-cell", { role: "cell", "aria-colindex": "2", style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;" }],
      ],
      "hatena: active": [
        ["line", 0, 0, -200000000, -200000000, "mbox-hatena-table mbox-hatena-table-row mbox-hatena-table-rendered", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 2, 3, -1, 1, "mbox-hatena-table-cell mbox-hatena-table-header-cell", { style: "--mbox-table-kit-column-width: 1ch" }],
        ["line", 7, 7, -200000000, -200000000, "mbox-hatena-table mbox-hatena-table-row", { style: "--mbox-table-kit-cell-max-width: 50%" }],
        ["mark", 10, 11, 500000000, -600000000, "mbox-hatena-table-cell mbox-hatena-table-raw-cell", null],
      ],
    });
  });
});

function tableKitBoundaryRecords(decorations: Array<Record<string, unknown>>) {
  const records = decorations.filter(({ className, attributes }) =>
    typeof className === "string" && className.includes("-table") &&
    (attributes !== undefined || className.includes("-raw-cell")));
  const lines = records.filter(({ kind }) => kind === "line");
  const cells = records.filter(({ className }) => typeof className === "string" && className.includes("-table-cell"));
  return [lines[0]!, cells[0]!, lines.at(-1)!, cells.at(-1)!].map(({ kind, from, to, startSide, endSide, className, attributes }) =>
    [kind, from, to, startSide, endSide, className, attributes ?? null]);
}

describe("createTableLineSpecs", () => {
  it("merges table and body-row semantics into existing line attributes", () => {
    const semantics = { tableId: "test-table-0" };
    const specs = createTableLineSpecs([headerRow(), bodyRow()], new Set(), classNames, semantics);
    expect(styled(specs[0]).attributes).toEqual(expect.objectContaining({
      style: expect.stringContaining("--mbox-table-kit-cell-max-width: 50%"), role: "table", id: "test-table-0",
      "aria-rowcount": "2", "aria-colcount": "2", "aria-owns": "test-table-0-row-1",
    }));
    expect(styled(specs[1]).attributes).toEqual(expect.objectContaining({ role: "row", id: "test-table-0-row-1" }));
    expect(createTableHeaderRowSpecs([headerRow(), bodyRow()], new Set(), semantics)).toEqual([
      expect.objectContaining({ attributes: expect.objectContaining({ role: "row", id: "test-table-0-row-0" }) }),
    ]);
  });
  it("appends each row's own class and the rendered suffix outside active lines", () => {
    const specs = createTableLineSpecs([headerRow(), delimiterRow(), bodyRow()], new Set(), classNames);
    expect(specs).toEqual([
      {
        type: "line",
        from: 0,
        className: "test-table test-header test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
      {
        type: "line",
        from: 13,
        className: "test-table test-delimiter test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
      {
        type: "line",
        from: 26,
        className: "test-table test-row test-rendered",
        attributes: { style: "--mbox-table-kit-cell-max-width: 50%" },
      },
    ]);
  });

  it("drops the rendered suffix for a row on an active line", () => {
    const specs = createTableLineSpecs([headerRow()], new Set([1]), classNames);
    expect(styled(specs[0]).className).toBe("test-table test-header");
  });

  it("uses the bare table class when a row has no className", () => {
    const row: TableKitRow = { line: 1, from: 0, to: 5, cells: [] };
    const specs = createTableLineSpecs([row], new Set([1]), classNames);
    expect(styled(specs[0]).className).toBe("test-table");
  });
});

describe("createTableCellSpecs", () => {
  it("adds cell roles and column indexes only when the entire table is inactive", () => {
    const semantics = { tableId: "test-table-0" };
    const rendered = createTableCellSpecs([headerRow(), bodyRow()], new Set(), classNames, {}, semantics);
    expect(styled(rendered[0]).attributes).toEqual(expect.objectContaining({ role: "columnheader", "aria-colindex": "1" }));
    expect(styled(rendered[2]).attributes).toEqual(expect.objectContaining({ role: "cell", "aria-colindex": "1" }));
    expect(createTableCellSpecs([headerRow(), bodyRow()], new Set([3]), classNames, {}, semantics)).toEqual(
      createTableCellSpecs([headerRow(), bodyRow()], new Set([3]), classNames),
    );
  });

  it("keeps layout tied to semantic rows, not width-measurement rows", () => {
    const semantics = { tableId: "test-table-0" };
    const excessBody = bodyRow();
    excessBody.cells.push({
      from: 32,
      to: 33,
      content: { from: 32, to: 33 },
      value: "x",
      excludeFromSemantics: true,
    });
    const rows = [headerRow(), delimiterRow(), excessBody];

    const inactive = createTableCellSpecs(rows, new Set(), classNames, {}, semantics);
    expect(styled(inactive[0]).attributes).toEqual(expect.objectContaining({
      style: expect.stringContaining("display: inline-block !important;"),
      role: "columnheader",
    }));
    expect(styled(inactive[2]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
    expect(styled(inactive[3]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 2ch" });
    expect(styled(inactive[6]).attributes).toEqual({
      style: "--mbox-table-kit-column-width: 1ch; display: inline-block !important;",
    });

    const partiallyActive = createTableCellSpecs(rows, new Set([3]), classNames, {}, semantics);
    expect(styled(partiallyActive[0]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
    expect(styled(partiallyActive[1]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 2ch" });
    expect(styled(partiallyActive[2]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
    expect(styled(partiallyActive[3]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 2ch" });
  });

  it("lays out trimmed cell text with a column-width custom property computed from the widest cell", () => {
    const specs = createTableCellSpecs([headerRow(), bodyRow()], new Set(), classNames);
    expect(specs).toEqual([
      { from: 2, to: 3, className: "test-cell", inclusiveStart: true, inclusiveEnd: true, attributes: { style: "--mbox-table-kit-column-width: 1ch" } },
      { from: 6, to: 10, className: "test-cell", inclusiveStart: true, inclusiveEnd: true, attributes: { style: "--mbox-table-kit-column-width: 2ch" } },
      { from: 27, to: 28, className: "test-cell", inclusiveStart: true, inclusiveEnd: true, attributes: { style: "--mbox-table-kit-column-width: 1ch" } },
      { from: 29, to: 32, className: "test-cell", inclusiveStart: true, inclusiveEnd: true, attributes: { style: "--mbox-table-kit-column-width: 2ch" } },
    ]);
  });

  it("measures a cell's projected displayValue instead of its longer source value", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 9,
      cells: [{ from: 1, to: 8, content: { from: 1, to: 8 }, value: " **x** ", displayValue: "x" }],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames);
    expect(columnWidth(specs[0])).toBe(1);
  });

  it("uses projected display values when finding the maximum width for each column", () => {
    const rows: TableKitRow[] = [
      { line: 1, from: 0, to: 8, cells: [{ from: 1, to: 7, content: { from: 1, to: 7 }, value: " **x** ", displayValue: "x" }] },
      { line: 2, from: 9, to: 19, cells: [{ from: 10, to: 18, content: { from: 10, to: 18 }, value: " _long_ ", displayValue: "long" }] },
    ];
    const specs = createTableCellSpecs(rows, new Set(), classNames);
    expect(columnWidth(specs[0])).toBe(4);
    expect(columnWidth(specs[1])).toBe(4);
  });

  it("keeps trimming and measuring source values when displayValue is absent", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 9,
      cells: [{ from: 1, to: 8, content: { from: 1, to: 8 }, value: " abc " }],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames);
    expect(columnWidth(specs[0])).toBe(3);
  });

  it("honours an empty displayValue instead of falling back to its source value", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 9,
      cells: [{ from: 1, to: 8, content: { from: 1, to: 8 }, value: " source ", displayValue: "" }],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames);
    expect(columnWidth(specs[0])).toBe(0);
  });

  it("excludes a row with includeInColumnWidths: false from column-width measurement", () => {
    const wideDelimiter: TableKitRow = {
      includeInColumnWidths: false,
      line: 2,
      from: 13,
      to: 30,
      cells: [{ from: 14, to: 28, content: { from: 14, to: 28 }, value: "--------------" }],
    };
    const specs = createTableCellSpecs([headerRow(), wideDelimiter], new Set(), classNames);
    // The header's own single-char cell width (1ch), not the delimiter's 14 chars.
    expect(styled(specs[0]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
    expect(styled(specs[2]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 1ch" });
  });

  it("renders a raw (unstyled) cell on the cell's own active line, with no width attribute", () => {
    const specs = createTableCellSpecs([headerRow()], new Set([1]), classNames);
    expect(specs).toEqual([
      { from: 1, to: 4, className: "test-cell test-raw-cell" },
      { from: 4, to: 11, className: "test-cell test-raw-cell" },
    ]);
  });

  it("appends a per-cell class name in both raw and rendered modes", () => {
    const rendered = createTableCellSpecs([delimiterRow()], new Set(), classNames);
    expect(styled(rendered[0]).className).toBe("test-cell test-delimiter-cell");
    const raw = createTableCellSpecs([delimiterRow()], new Set([2]), classNames);
    expect(styled(raw[0]).className).toBe("test-cell test-delimiter-cell test-raw-cell");
  });

  it("appends a text-align style only when the cell has an alignment and only when rendered", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 10,
      cells: [{ from: 1, to: 5, content: { from: 1, to: 4 }, value: "abc", align: "right" }],
    };
    expect(styled(createTableCellSpecs([row], new Set(), classNames)[0]).attributes).toEqual({
      style: "--mbox-table-kit-column-width: 3ch; text-align: right",
    });
    expect(createTableCellSpecs([row], new Set([1]), classNames)[0]).toEqual({
      from: 1,
      to: 5,
      className: "test-cell test-raw-cell",
    });
  });

  it("uses an injected measureWidth function instead of raw character count", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 10,
      cells: [{ from: 1, to: 5, content: { from: 1, to: 4 }, value: "a" }],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames, { measureWidth: () => 9 });
    expect(styled(specs[0]).attributes).toEqual({ style: "--mbox-table-kit-column-width: 9ch" });
  });

  // A cell between two adjacent pipes (`||`) has no padding at all, so its own
  // span -- not just its trimmed content -- is zero-width. Empty marks are
  // normalized away, while an empty cell still needs a DOM element, so it uses
  // a point widget.
  it("renders a genuinely empty cell (no padding, zero-width span) as a widget, not an empty mark", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 5,
      cells: [
        { from: 1, to: 1, content: { from: 1, to: 1 }, value: "" },
        { from: 1, to: 4, content: { from: 2, to: 3 }, value: " x " },
      ],
    };
    const specs = createTableCellSpecs([row], new Set(), classNames);
    expect(specs[0]).toMatchObject({ type: "widget", from: 1 });
  });

  it("renders a genuinely empty cell as a widget on its own active (raw) line too", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 5,
      cells: [{ from: 1, to: 1, content: { from: 1, to: 1 }, value: "" }],
    };
    const specs = createTableCellSpecs([row], new Set([1]), classNames);
    expect(specs[0]).toMatchObject({ type: "widget", from: 1 });
  });

  it("assigns distinct, increasing sides to same-position virtual cells", () => {
    const row: TableKitRow = {
      line: 1,
      from: 0,
      to: 8,
      cells: [
        { from: 1, to: 4, content: { from: 2, to: 3 }, value: "x" },
        { from: 8, to: 8, content: { from: 8, to: 8 }, value: "", virtual: true },
        { from: 8, to: 8, content: { from: 8, to: 8 }, value: "", virtual: true },
      ],
    };

    const virtualSpecs = createTableCellSpecs([row], new Set(), classNames).slice(1) as Array<{ side?: number }>;
    expect(virtualSpecs.map((spec) => spec.side)).toEqual([2, 3]);
  });

});

describe("createTableWhitespaceHideSpecs", () => {
  it("hides the padding on both sides of the trimmed content outside the active line", () => {
    expect(createTableWhitespaceHideSpecs([headerRow()], new Set())).toEqual([
      { type: "replace", from: 1, to: 2 },
      { type: "replace", from: 3, to: 4 },
      { type: "replace", from: 4, to: 6 },
      { type: "replace", from: 10, to: 11 },
    ]);
  });

  it("leaves empty padding ranges for lowering to normalize", () => {
    expect(createTableWhitespaceHideSpecs([bodyRow()], new Set())).toEqual([
      { type: "replace", from: 27, to: 27 },
      { type: "replace", from: 28, to: 29 },
      { type: "replace", from: 29, to: 29 },
      { type: "replace", from: 32, to: 32 },
    ]);
  });

  it("creates no specs on the row's active line", () => {
    expect(createTableWhitespaceHideSpecs([headerRow()], new Set([1]))).toEqual([]);
  });
});

describe("createTablePipeHideSpecs", () => {
  it("hides the leading, inter-cell, and trailing pipe/padding runs outside the active line", () => {
    // headerRow cells touch at from:4/to:4. The lowering boundary drops that
    // degenerate inter-cell range instead of each generator filtering it.
    expect(createTablePipeHideSpecs([headerRow()], new Set())).toEqual([
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 4, to: 4 },
      { type: "replace", from: 11, to: 12 },
    ]);
  });

  it("creates no specs on the row's active line", () => {
    expect(createTablePipeHideSpecs([headerRow()], new Set([1]))).toEqual([]);
  });

  it("creates no specs for a row with no cells", () => {
    const empty: TableKitRow = { line: 9, from: 0, to: 3, cells: [] };
    expect(createTablePipeHideSpecs([empty], new Set())).toEqual([]);
  });
});

describe("displayWidth", () => {
  it("counts an ASCII string by its character length", () => {
    expect(displayWidth("abc")).toBe(3);
  });

  it("counts each full-width (CJK) character as two units", () => {
    expect(displayWidth("日本語")).toBe(6);
  });

  it("mixes ASCII and full-width counting within one string", () => {
    expect(displayWidth("a日本b")).toBe(6);
  });

  it("counts emoji as two units", () => {
    expect(displayWidth("a\u{1F600}b")).toBe(4);
  });

  it("keeps narrow non-BMP and ambiguous private-use characters at one unit", () => {
    expect(displayWidth("\u{10437}")).toBe(1); // Deseret Small Letter Yee
    expect(displayWidth("\uE000")).toBe(1); // Private Use Area (East Asian Width A)
  });

  it("counts CJK Extension B and compatibility ideographs as two units", () => {
    expect(displayWidth("\u{20000}")).toBe(2);
    expect(displayWidth("\uF900")).toBe(2);
  });

  it("keeps this CJK/emoji approximation's range boundaries stable", () => {
    const approximateWideRangeBoundaries: readonly [string, string][] = [
      ["\u1100", "\u115F"],
      ["\u2E80", "\u303E"],
      ["\u3041", "\u33FF"],
      ["\u3400", "\u4DBF"],
      ["\u4E00", "\u9FFF"],
      ["\uA000", "\uA4CF"],
      ["\uA960", "\uA97C"],
      ["\uAC00", "\uD7A3"],
      ["\uF900", "\uFAFF"],
      ["\uFE30", "\uFE4F"],
      ["\uFF01", "\uFF60"],
      ["\uFFE0", "\uFFE6"],
      ["\u{20000}", "\u{2FFFD}"],
      ["\u{30000}", "\u{3FFFD}"],
      ["\u{1F300}", "\u{1FAFF}"],
    ];

    for (const [first, last] of approximateWideRangeBoundaries) {
      expect(displayWidth(first)).toBe(2);
      expect(displayWidth(last)).toBe(2);
    }

    // Lone surrogates are outside every range. They catch the old accidental
    // U+8C48–U+FAFF range, which included the entire surrogate block.
    expect(displayWidth("\uD800")).toBe(1);
    expect(displayWidth("\uDFFF")).toBe(1);
    // Hangul Jamo Extended-B is East Asian Width N, so it must remain narrow.
    expect(displayWidth("\uD7B0")).toBe(1);
    expect(displayWidth("\uD7C6")).toBe(1);
    expect(displayWidth("\uD7CB")).toBe(1);
    expect(displayWidth("\uD7FB")).toBe(1);
    expect(displayWidth("\uFF00")).toBe(1);
    expect(displayWidth("\u{2FFFE}")).toBe(1);
    expect(displayWidth("\u{3FFFE}")).toBe(1);
  });

  it("returns 0 for an empty string", () => {
    expect(displayWidth("")).toBe(0);
  });
});

describe("TableKitCell.minimumColumnWidth", () => {
  function rowWith(cell: Partial<TableKitRow["cells"][number]>, options: Partial<TableKitRow> = {}): TableKitRow {
    return {
      line: 1,
      from: 0,
      to: 9,
      cells: [{ from: 1, to: 8, content: { from: 1, to: 8 }, value: "ab", ...cell }],
      ...options,
    };
  }

  it("raises a column that its text alone would leave narrower", () => {
    const specs = createTableCellSpecs([rowWith({ value: "ab", minimumColumnWidth: 32 })], new Set(), classNames);

    expect(columnWidth(specs[0]!)).toBe(32);
  });

  it("does not shrink a column whose text is already wider", () => {
    const specs = createTableCellSpecs([rowWith({ value: "a".repeat(40), minimumColumnWidth: 32 })], new Set(), classNames);

    // The minimum is a floor, not a size. A cell that asks for 32 next to a
    // 40-character neighbour must not squeeze it.
    expect(columnWidth(specs[0]!)).toBe(40);
  });

  it("is ignored on a row excluded from the column measurement", () => {
    const rows = [
      rowWith({ value: "ab" }),
      rowWith({ value: "--", minimumColumnWidth: 32 }, { line: 2, from: 10, to: 19, includeInColumnWidths: false }),
    ];

    // The exclusion says the row is not real column content; its demands are
    // part of that, or a delimiter row could silently set every column's width.
    expect(columnWidth(createTableCellSpecs(rows, new Set(), classNames)[0]!)).toBe(2);
  });

  it("is compared in the units the injected measureWidth returns, not in characters", () => {
    // This measurement calls every character two units wide. A four-character
    // cell therefore measures 8, and a minimum of 6 must lose to it -- which it
    // only does if the two are on the same scale. Compared against the
    // character count of 4, the minimum would wrongly win.
    const specs = createTableCellSpecs([rowWith({ value: "abcd", minimumColumnWidth: 6 })], new Set(), classNames, {
      measureWidth: (value) => value.length * 2,
    });

    expect(columnWidth(specs[0]!)).toBe(8);
  });

  it("keeps a fractional minimum rather than rounding it", () => {
    const specs = createTableCellSpecs([rowWith({ value: "", minimumColumnWidth: 12.5 })], new Set(), classNames);

    expect(columnWidth(specs[0]!)).toBe(12.5);
  });
});
