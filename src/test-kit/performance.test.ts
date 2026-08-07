import { describe, expect, it } from "vitest";
import { measureDoubledSizeRatio } from "./performance.js";

// These tests check the MEASUREMENT PROTOCOL, not any real performance. They
// drive a logical clock that advances by a declared cost model, so a busy
// machine cannot change a single result. Asserting "a linear function scores
// about 2.0" against the wall clock would be a flaky test about nothing.
//
// The guards that use this helper are the ones that measure real work.

/** A clock that only moves when a cost model says it does. */
function logicalClock(costOf: (size: number) => number) {
  let elapsed = 0;
  const measuredSizes: number[] = [];
  return {
    now: () => elapsed,
    run: (size: number) => {
      measuredSizes.push(size);
      elapsed += costOf(size);
    },
    /** Every size passed to `run`, in call order (warm-up runs included). */
    measuredSizes,
  };
}

/** Drives the helper with a cost model over sizes, returning the run order. */
function measureWith(costOf: (size: number) => number, count: number, samples?: number) {
  const clock = logicalClock(costOf);
  const built: number[] = [];
  const result = measureDoubledSizeRatio<number>({
    count,
    samples,
    now: clock.now,
    makeInput: (size) => {
      built.push(size);
      return size;
    },
    run: (size) => clock.run(size),
  });
  return { result, built, measuredSizes: clock.measuredSizes };
}

describe("measureDoubledSizeRatio input handling", () => {
  it("builds each size's input exactly once, before any run", () => {
    const built: number[] = [];
    const buildOrder: string[] = [];
    measureDoubledSizeRatio<number>({
      count: 10,
      now: () => 0,
      makeInput: (size) => {
        built.push(size);
        buildOrder.push(`build:${size}`);
        return size;
      },
      run: (size) => buildOrder.push(`run:${size}`),
    });

    expect(built).toEqual([10, 20]);
    // Construction cost must never land inside a measured region.
    expect(buildOrder.slice(0, 2)).toEqual(["build:10", "build:20"]);
    expect(buildOrder.slice(2).every((entry) => entry.startsWith("run:"))).toBe(true);
  });

  it("passes the prebuilt input to run rather than the size", () => {
    const seen: string[] = [];
    measureDoubledSizeRatio<string>({
      count: 3,
      now: () => 0,
      makeInput: (size) => `input-${size}`,
      run: (input) => seen.push(input),
    });

    expect(new Set(seen)).toEqual(new Set(["input-3", "input-6"]));
  });
});

describe("measureDoubledSizeRatio sampling protocol", () => {
  it("warms both sizes once before the sampled pairs", () => {
    const { measuredSizes } = measureWith((size) => size, 10);

    expect(measuredSizes.slice(0, 2)).toEqual([10, 20]);
  });

  it("takes the requested number of pairs after the warm-up", () => {
    const { measuredSizes } = measureWith((size) => size, 10, 3);

    // Two warm-up runs, then one run per size per pair.
    expect(measuredSizes).toHaveLength(2 + 3 * 2);
  });

  it("defaults to fifteen pairs", () => {
    const { measuredSizes } = measureWith((size) => size, 10);

    expect(measuredSizes).toHaveLength(2 + 15 * 2);
  });

  it("alternates which size runs first across pairs", () => {
    const { measuredSizes } = measureWith((size) => size, 10, 5);
    const pairs = measuredSizes.slice(2);

    expect([pairs[0], pairs[2], pairs[4], pairs[6], pairs[8]]).toEqual([10, 20, 10, 20, 10]);
  });

  it("picks the median by ratio, not by the larger side's duration", () => {
    // Five pairs whose ranking differs depending on the key:
    //   (smaller, larger)  ratio
    //   (1, 10)            10
    //   (10, 20)            2
    //   (2, 6)              3
    //   (1, 4)              4
    //   (10, 50)            5
    // By ratio:  2, 3, 4, 5, 10  -> median pair (1, 4), ratio 4
    // By larger: 4, 6, 10, 20, 50 -> median pair (1, 10), ratio 10
    // Sorting on the wrong key is invisible when every pair shares a smaller
    // side, which is why this case gives each pair its own.
    const smallerCosts = [1, 10, 2, 1, 10];
    const largerCosts = [10, 20, 6, 4, 50];
    let elapsed = 0;
    let smallerRuns = 0;
    let largerRuns = 0;
    let warmedUp = 0;
    const result = measureDoubledSizeRatio<number>({
      count: 10,
      samples: 5,
      now: () => elapsed,
      makeInput: (size) => size,
      run: (size) => {
        if (warmedUp < 2) {
          warmedUp += 1;
          return;
        }
        elapsed += size === 10 ? smallerCosts[smallerRuns++]! : largerCosts[largerRuns++]!;
      },
    });

    expect(result.ratio).toBe(4);
    expect(result.smaller).toBe(1);
    expect(result.larger).toBe(4);
  });

  it("returns the median of the requested pair count, not a hardcoded index", () => {
    // Three pairs with ratios 3, 1, 2. The median is 2; a hardcoded middle
    // index for five pairs would reach past the end or land on 3.
    const largerCosts = [3, 1, 2];
    let elapsed = 0;
    let largerRuns = 0;
    let warmedUp = 0;
    const result = measureDoubledSizeRatio<number>({
      count: 10,
      samples: 3,
      now: () => elapsed,
      makeInput: (size) => size,
      run: (size) => {
        if (warmedUp < 2) {
          warmedUp += 1;
          return;
        }
        elapsed += size === 10 ? 1 : largerCosts[largerRuns++]!;
      },
    });

    expect(result.ratio).toBe(2);
  });

  it("returns the median pair, not the mean and not the last", () => {
    // The smaller side always costs 1, so each pair's ratio is its larger
    // cost. These five are chosen so the three plausible answers differ:
    // median 3, mean 4, last 1. An implementation that returned any of the
    // other two would fail here.
    const largerCosts = [10, 2, 4, 3, 1];
    let elapsed = 0;
    let largerRuns = 0;
    let warmedUp = 0;
    const result = measureDoubledSizeRatio<number>({
      count: 10,
      samples: 5,
      now: () => elapsed,
      makeInput: (size) => size,
      run: (size) => {
        if (warmedUp < 2) {
          warmedUp += 1;
          return;
        }
        elapsed += size === 10 ? 1 : largerCosts[largerRuns++]!;
      },
    });

    // Sorted: 1, 2, 3, 4, 10. Median 3, mean 4, last 1.
    expect(result.ratio).toBe(3);
    expect(result.larger).toBe(3);
    expect(result.smaller).toBe(1);
  });
});

describe("measureDoubledSizeRatio cost models", () => {
  it("scores a linear cost model at 2", () => {
    const { result } = measureWith((size) => size, 1_000);

    expect(result.ratio).toBe(2);
    expect(result.smaller).toBe(1_000);
    expect(result.larger).toBe(2_000);
  });

  it("scores a quadratic cost model at 4", () => {
    const { result } = measureWith((size) => size * size, 1_000);

    expect(result.ratio).toBe(4);
  });

  it("scores a constant cost model at 1", () => {
    const { result } = measureWith(() => 7, 1_000);

    expect(result.ratio).toBe(1);
  });

  it("separates linear from quadratic by more than any plausible threshold", () => {
    const linear = measureWith((size) => size, 1_000).result.ratio;
    const quadratic = measureWith((size) => size * size, 1_000).result.ratio;

    // Every threshold this repository uses sits between these two.
    expect(linear).toBeLessThan(2.5);
    expect(quadratic).toBeGreaterThan(2.5);
  });
});

describe("measureDoubledSizeRatio bad arguments", () => {
  const options = { count: 10, makeInput: (size: number) => size, run: () => {}, now: () => 0 };

  it.each([0, -1, 2, 4, 1.5, Number.NaN])("refuses a sample count of %s", (samples) => {
    // Returning `undefined` typed as a result would surface as a puzzling
    // failure inside whichever guard used it, nowhere near the mistake.
    expect(() => measureDoubledSizeRatio({ ...options, samples })).toThrow(/positive odd sample count/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("refuses a count of %s", (count) => {
    // At 0 -- and for NaN against itself -- `count` and `count * 2` are the
    // same number, so the two sizes collapse into one and the ratio compares a
    // size against itself.
    expect(() => measureDoubledSizeRatio({ ...options, count })).toThrow(/positive finite count/);
  });

  it("accepts the odd counts a caller would actually use", () => {
    for (const samples of [1, 3, 5, 9, 15]) {
      expect(() => measureDoubledSizeRatio({ ...options, samples })).not.toThrow();
    }
  });
});

describe("measureDoubledSizeRatio degenerate timings", () => {
  it("floors the divisor at 0.01ms when the smaller side measures nothing", () => {
    const { result } = measureWith((size) => (size === 10 ? 0 : 1), 10);

    expect(result.smaller).toBe(0);
    expect(result.larger).toBe(1);
    // Pinning the quotient, not just its finiteness: the floor's VALUE decides
    // how large a bogus ratio a zero-cost smaller side can produce, and a
    // guard threshold is read against that number. 1ms / 0.01ms = 100.
    expect(result.ratio).toBe(100);
  });
});
