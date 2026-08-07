import { describe, expect, it } from "vitest";
import { parseHatenaDocument } from "./parser.js";

const PERFORMANCE_SAMPLES = 5;

function doubledSizeRatio(count: number): { larger: number; ratio: number } {
  // Build inputs before timing: this guard measures the parser's scaling, not
  // string construction.
  const inputs = new Map([count, count * 2].map((size) => [size, "((".repeat(size)]));
  const run = (size: number) => parseHatenaDocument(inputs.get(size)!);

  // Warm both sizes, alternate their order, and take the paired-ratio median.
  run(count);
  run(count * 2);
  const samples = Array.from({ length: PERFORMANCE_SAMPLES }, (_, sample) => {
    const sizes = sample % 2 === 0 ? [count, count * 2] : [count * 2, count];
    const durations = new Map<number, number>();
    for (const size of sizes) {
      const started = performance.now();
      run(size);
      durations.set(size, performance.now() - started);
    }
    const larger = durations.get(count * 2)!;
    return { larger, ratio: larger / Math.max(durations.get(count)!, 0.01) };
  }).sort((left, right) => left.ratio - right.ratio);
  return samples[Math.floor(samples.length / 2)]!;
}

describe("parseHatenaDocument performance", () => {
  it("keeps unclosed footnote openers linear without collecting footnotes", () => {
    const count = 50_000;
    const result = doubledSizeRatio(count);

    for (const size of [count, count * 2]) {
      expect(parseHatenaDocument("((".repeat(size)).lines[0].footnotes).toEqual([]);
    }
    // The ratio detects superlinear scaling. This is only a coarse
    // post-completion ceiling; it cannot interrupt a synchronous parse.
    expect(result.ratio).toBeLessThan(3);
    expect(result.larger).toBeLessThan(5_000);
  }, 15_000);
});
