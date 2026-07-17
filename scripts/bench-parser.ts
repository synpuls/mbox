import { performance } from "node:perf_hooks";

import type { EditorState, TransactionSpec } from "@codemirror/state";

import { createEditorState } from "../src/editor/create-editor";
import { getActiveLineNumbersFromView } from "../src/editor/focused-line";
import {
  createMboxExtension,
  mboxDecorationProviders,
  type MboxDecorationContext,
  type MboxPlugin,
} from "../src/editor/plugin";

import { mboxPlugins } from "../src/plugins/mbox/default";
import { parseMboxDocument } from "../src/plugins/mbox/parser";
import { gfmPlugins } from "../src/plugins/gfm/index";
import { parseGfmDocument } from "../src/plugins/gfm/parser";
import { hatenaPlugins } from "../src/plugins/hatena/index";
import { parseHatenaDocument } from "../src/plugins/hatena/parser";
import { scrapboxPlugins } from "../src/plugins/scrapbox/index";
import { parseScrapboxDocument } from "../src/plugins/scrapbox/parser";

// A benchmark over EVERY notation namespace, not just mbox. The whole point is
// apples-to-apples: each notation parses input written in ITS OWN syntax (a
// scrapbox parser fed markdown measures nothing), so every notation carries its
// own line-pattern set — lifted from that notation's demo seed, i.e. syntax we
// already know the parser accepts. We import parsers/factories straight from
// `../src`, so this file is bundled from source (esbuild) rather than run
// against `dist`: the public barrel intentionally ships only the mbox core and
// scrapbox (the product), keeping gfm/hatena demo-only, and bundling
// from source also lets us reuse the internal `getActiveLineNumbersFromView`
// helper to build a faithful decoration context.

const lineCounts = (process.env.MBOX_BENCH_LINE_COUNTS ?? "100,1000,2000,10000")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const iterations = Number.parseInt(process.env.MBOX_BENCH_ITERATIONS ?? "20", 10);
const warmups = Number.parseInt(process.env.MBOX_BENCH_WARMUPS ?? "5", 10);
const notationFilter = (process.env.MBOX_BENCH_NOTATIONS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

type LinePattern = (index: number) => string;

interface Notation {
  name: string;
  parse: (input: string) => unknown;
  plugins: () => MboxPlugin[];
  patterns: LinePattern[];
}

// Count every array field of a parse result — shape-agnostic across the five
// Document types (mbox `{ blocks }`, hatena `{ lines, tables }`, etc.), so the
// "result" sanity column proves the parser actually produced structure.
function countUnits(parsed: unknown): number {
  if (!parsed || typeof parsed !== "object") {
    return 0;
  }
  return Object.values(parsed as Record<string, unknown>).reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0,
  );
}

const notations: Notation[] = [
  {
    name: "mbox",
    parse: parseMboxDocument,
    plugins: () => mboxPlugins(),
    patterns: [
      (index) => `# 見出し ${index}`,
      (index) => `本文 ${index} に [ページリンク${index}] と :smile: と https://example.com/${index}`,
      (index) => `- item ${index}`,
      (index) => ` - nested item ${index}`,
      (index) => `- [${index % 2 === 0 ? "x" : " "}] task ${index}`,
      (index) => `> 引用 ${index}`,
      (index) => `\`code ${index}\` と **太字 ${index}** と ~~取り消し ${index}~~`,
      (index) => `[Label ${index}](https://example.com/${index}) と ![Alt ${index}](image-${index}.png)`,
      (index) => `| 記法 ${index} | 状態 ${index} |`,
      () => "| --- | --- |",
      (index) => "```sample.ts\n" + `const value${index} = ${index};\n` + "```",
    ],
  },
  {
    name: "gfm",
    parse: parseGfmDocument,
    plugins: () => gfmPlugins(),
    patterns: [
      (index) => `# Heading ${index}`,
      (index) => `## Sub ${index}`,
      (index) => `Setext ${index}\n======`,
      (index) => `Para ${index} with *em*, **strong**, ~~strike~~, \`code\`, [link](https://e.com/${index}) and www.e.com`,
      (index) => `- bullet ${index}`,
      (index) => `  - nested ${index}`,
      (index) => `${index}. ordered ${index}`,
      (index) => `- [${index % 2 === 0 ? "x" : " "}] task ${index}`,
      (index) => `> quote ${index}`,
      (index) => `>> nested quote ${index}`,
      (index) => `| Col ${index} | Val ${index} |`,
      () => "| --- | --- |",
      () => "---",
      (index) => "```js\n" + `const answer${index} = ${index}; // comment\n` + "```",
      (index) => `A claim[^${index}] needs a source.`,
      (index) => `[^${index}]: footnote body ${index}`,
    ],
  },
  {
    name: "hatena",
    parse: parseHatenaDocument,
    plugins: () => hatenaPlugins(),
    patterns: [
      (index) => `*大見出し ${index}`,
      (index) => `**中見出し ${index}`,
      (index) => `***小見出し ${index}`,
      (index) => `-順序なしリスト ${index}`,
      (index) => `--順序なしリスト レベル2 ${index}`,
      (index) => `+順序ありリスト ${index}`,
      (index) => `:用語${index}:説明 ${index}`,
      (index) => `|*見出し${index}|*色|`,
      (index) => `|セル${index}|赤|`,
      (index) => `>>\nこれは引用ブロック ${index}\n<<`,
      (index) => `>||\nスーパーpre ${index} <b>tag</b>\n||<`,
      (index) => `本文 ${index} に脚注((脚注${index}))と [http://example.com/${index}:title]`,
      (index) => `[tex:x^2 + ${index}]`,
    ],
  },
  {
    name: "scrapbox",
    parse: parseScrapboxDocument,
    plugins: () => scrapboxPlugins({}),
    patterns: [
      (index) => `[* 強調 ${index}]`,
      (index) => `[** もっと大きく ${index}]`,
      (index) => ` 半角スペースで bullet ${index}`,
      (index) => `  さらに深いネスト ${index}`,
      (index) => `${index}. 番号付きリスト ${index}`,
      (index) => ` [/ 斜体 ${index}] [- 打ち消し] [[強調]]`,
      (index) => ` [ページリンク${index}] と [https://example.com/${index} 外部] と #タグ${index}`,
      (index) => `> 引用 ${index} と \`code${index}\``,
      (index) => `[demo-user.icon] アイコン ${index}`,
      (index) => `code:hello${index}.js\n function greet${index}() {\n   return ${index}\n }`,
      (index) => `table:サンプル${index}\n 見出しA\t見出しB\n abc\tdef`,
    ],
  },
];

function createSyntheticDocument(patterns: LinePattern[], lineCount: number): string {
  const lines: string[] = [];
  for (let index = 0; lines.length < lineCount; index += 1) {
    const pattern = patterns[index % patterns.length];
    for (const line of pattern(index).split("\n")) {
      if (lines.length < lineCount) {
        lines.push(line);
      }
    }
  }
  return lines.join("\n");
}

interface Measurement {
  name: string;
  min: number;
  median: number;
  max: number;
  lastResult: unknown;
}

function measure(name: string, fn: () => unknown): Measurement {
  for (let index = 0; index < warmups; index += 1) {
    fn();
  }

  const samples: { ms: number; result: unknown }[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const result = fn();
    samples.push({ ms: performance.now() - startedAt, result });
  }

  const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  return {
    name,
    min: times[0],
    median: times[Math.floor(times.length / 2)],
    max: times[times.length - 1],
    lastResult: samples.at(-1)?.result,
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function printMeasurement(lineCount: number, measurement: Measurement): void {
  console.log(
    [
      `${String(lineCount).padStart(5, " ")} lines`,
      measurement.name.padEnd(30, " "),
      `min ${formatMs(measurement.min).padStart(8, " ")}`,
      `median ${formatMs(measurement.median).padStart(8, " ")}`,
      `max ${formatMs(measurement.max).padStart(8, " ")}`,
      `result ${String(measurement.lastResult ?? "").padStart(8, " ")}`,
    ].join(" | "),
  );
}

function getDocumentPositions(doc: string) {
  const end = doc.length;
  const middle = Math.floor(end / 2);

  return {
    start: 0,
    middle,
    end,
    deleteStart: 0,
    deleteMiddle: Math.min(middle, Math.max(end - 1, 0)),
    deleteEnd: Math.max(end - 1, 0),
  };
}

type BenchState = EditorState;

function runDecorationProviders(state: BenchState, hasFocus = false): number {
  const providers = state.facet(mboxDecorationProviders);
  const context: MboxDecorationContext = {
    state,
    activeLineNumbers: getActiveLineNumbersFromView({ state, hasFocus }),
  };
  return providers.reduce((count, { provider }) => count + provider(context).length, 0);
}

function applyTransaction(state: BenchState, spec: TransactionSpec): BenchState {
  return state.update(spec).state;
}

function applyTransactionAndDecorate(state: BenchState, spec: TransactionSpec, hasFocus = true): number {
  const nextState = applyTransaction(state, spec);
  return runDecorationProviders(nextState, hasFocus);
}

function benchmarkNotation(notation: Notation, lineCount: number): void {
  const doc = createSyntheticDocument(notation.patterns, lineCount);
  const state = createEditorState({
    doc,
    extensions: [createMboxExtension({ plugins: notation.plugins() })],
  });
  const positions = getDocumentPositions(doc);

  printMeasurement(
    lineCount,
    measure(`${notation.name} parse`, () => countUnits(notation.parse(doc))),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} decorations`, () => runDecorationProviders(state)),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} insert start`, () =>
      applyTransaction(state, { changes: { from: positions.start, insert: "x" } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} insert middle`, () =>
      applyTransaction(state, { changes: { from: positions.middle, insert: "x" } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} insert end`, () =>
      applyTransaction(state, { changes: { from: positions.end, insert: "x" } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} delete start`, () =>
      applyTransaction(state, { changes: { from: positions.deleteStart, to: positions.deleteStart + 1 } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} delete middle`, () =>
      applyTransaction(state, { changes: { from: positions.deleteMiddle, to: positions.deleteMiddle + 1 } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} delete end`, () =>
      applyTransaction(state, { changes: { from: positions.deleteEnd, to: positions.deleteEnd + 1 } }).doc.length,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} select start`, () =>
      applyTransaction(state, { selection: { anchor: positions.start } }).selection.main.head,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} select middle`, () =>
      applyTransaction(state, { selection: { anchor: positions.middle } }).selection.main.head,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} select end`, () =>
      applyTransaction(state, { selection: { anchor: positions.end } }).selection.main.head,
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} insert middle + decorations`, () =>
      applyTransactionAndDecorate(state, { changes: { from: positions.middle, insert: "x" } }),
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} delete middle + decorations`, () =>
      applyTransactionAndDecorate(state, { changes: { from: positions.deleteMiddle, to: positions.deleteMiddle + 1 } }),
    ),
  );
  printMeasurement(
    lineCount,
    measure(`${notation.name} select middle + decorations`, () =>
      applyTransactionAndDecorate(state, { selection: { anchor: positions.middle } }),
    ),
  );
}

const selectedNotations =
  notationFilter.length > 0 ? notations.filter((notation) => notationFilter.includes(notation.name)) : notations;

console.log(`mbox notation benchmark: ${iterations} iterations, ${warmups} warmups`);
console.log("Note: document-change transactions include one cached-document reparse through the mbox StateField.");
console.log(`Notations: ${selectedNotations.map((notation) => notation.name).join(", ")}`);

for (const notation of selectedNotations) {
  console.log(`\n=== ${notation.name} ===`);
  for (const lineCount of lineCounts) {
    benchmarkNotation(notation, lineCount);
  }
}
