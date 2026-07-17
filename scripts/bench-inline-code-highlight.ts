import { performance } from "node:perf_hooks";

import { LanguageDescription, type Language } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";

import { createCodeBlockKitHighlightSpecs } from "../src/plugins/code-block-kit";
import type { MboxDecorationSpec } from "../src/editor/plugin";

// Measures the cost of highlighting Scrapbox inline code spans (`` `...` ``)
// as a single fixed language (Ruby, per the design under discussion), both
// naively (re-tokenize every span on every decoration pass -- what a first
// implementation would do) and with a simple text-keyed cache (what a
// decoration pass looks like once unchanged spans are memoized). The whole
// point is to quantify whether the "no caching anywhere in code-block-kit"
// gap found during investigation is a real problem for MANY short inline
// spans specifically (code blocks are typically few per document; inline
// code can be dozens), informing whether caching is a launch requirement.

const spanCounts = (process.env.MBOX_BENCH_SPAN_COUNTS ?? "10,30,100,300")
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const iterations = Number.parseInt(process.env.MBOX_BENCH_ITERATIONS ?? "20", 10);
const warmups = Number.parseInt(process.env.MBOX_BENCH_WARMUPS ?? "5", 10);

// A realistic mix: some genuinely Ruby-ish, some not (JS/plain-English/shell)
// -- inline code in real notes is not exclusively Ruby, which is the whole
// point of "highlight everything as Ruby" as a fixed-language approximation.
const sampleSpans = [
  "describe User do",
  'it "is valid ~"',
  "object_id",
  "equal?",
  "==",
  "const value = 42;",
  "git reset --hard HEAD^",
  "cp a.txt b.txt",
  "SELECT * FROM users WHERE id = 1",
  "npm install --save-dev vitest",
  "def initialize(name); @name = name; end",
  "class Greeter < Base",
  "puts Greeter.new.call(name)",
  "$PATH environment variable",
  "docker run -it ubuntu bash",
];

function createSpans(count: number): string[] {
  return Array.from({ length: count }, (_, index) => sampleSpans[index % sampleSpans.length]);
}

interface Measurement {
  name: string;
  min: number;
  median: number;
  max: number;
}

function measure(name: string, fn: () => unknown): Measurement {
  for (let index = 0; index < warmups; index += 1) {
    fn();
  }

  const times: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    fn();
    times.push(performance.now() - startedAt);
  }

  times.sort((a, b) => a - b);
  return { name, min: times[0], median: times[Math.floor(times.length / 2)], max: times[times.length - 1] };
}

function formatMs(value: number): string {
  return `${value.toFixed(3)}ms`;
}

function printMeasurement(spanCount: number, measurement: Measurement): void {
  console.log(
    [
      `${String(spanCount).padStart(5, " ")} spans`,
      measurement.name.padEnd(28, " "),
      `min ${formatMs(measurement.min).padStart(9, " ")}`,
      `median ${formatMs(measurement.median).padStart(9, " ")}`,
      `max ${formatMs(measurement.max).padStart(9, " ")}`,
    ].join(" | "),
  );
}

function highlightNaively(spans: string[], language: Language): MboxDecorationSpec[] {
  let from = 0;
  const specs: MboxDecorationSpec[] = [];
  for (const span of spans) {
    specs.push(...createCodeBlockKitHighlightSpecs(span, from, language, "mbox-scrapbox-code"));
    from += span.length + 1;
  }
  return specs;
}

function createCachedHighlighter(language: Language) {
  const cache = new Map<string, MboxDecorationSpec[]>();
  return function highlightCached(spans: string[]): MboxDecorationSpec[] {
    let from = 0;
    const specs: MboxDecorationSpec[] = [];
    for (const span of spans) {
      let cached = cache.get(span);
      if (!cached) {
        cached = createCodeBlockKitHighlightSpecs(span, 0, language, "mbox-scrapbox-code");
        cache.set(span, cached);
      }
      // Re-offset the cached (from=0) specs to this span's real position --
      // still cheaper than re-parsing, and the point being measured here.
      specs.push(...cached.map((spec) => ({ ...spec, from: spec.from + from, to: spec.to + from })));
      from += span.length + 1;
    }
    return specs;
  };
}

async function main() {
  const rubyDescription = codeMirrorLanguages.find(
    (description: LanguageDescription) => description.name === "Ruby",
  );
  if (!rubyDescription) {
    throw new Error("Ruby not found in @codemirror/language-data's registry");
  }
  const rubyLanguage = (await rubyDescription.load()).language;

  console.log(`inline-code highlight benchmark: ${iterations} iterations, ${warmups} warmups, language=Ruby`);
  console.log(
    "Compares naive (re-tokenize every span, every call -- simulating every decoration pass, e.g. every cursor move) vs a simple text-keyed cache (steady state after the first pass).",
  );

  for (const spanCount of spanCounts) {
    const spans = createSpans(spanCount);
    printMeasurement(
      spanCount,
      measure("naive (no cache)", () => highlightNaively(spans, rubyLanguage)),
    );

    const highlightCached = createCachedHighlighter(rubyLanguage);
    highlightCached(spans); // warm the cache once, outside the measured loop
    printMeasurement(
      spanCount,
      measure("cached (steady state)", () => highlightCached(spans)),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
