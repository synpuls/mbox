// Shared measurement protocol for the ratio guards.
//
// A performance guard here asserts a SHAPE, not a speed: run the same work at
// size n and size 2n, and check the cost roughly doubled. A fixed millisecond
// budget cannot do that -- a quadratic parse that happens to finish in 98ms on
// this machine passes a "under 100ms" assertion and still explodes on a real
// document.
//
// The protocol below is what makes the ratio trustworthy on a noisy machine:
//
//   - both inputs are built BEFORE any timing, so string construction is never
//     inside a measured region
//   - both sizes are warmed once, so neither side pays for a cold JIT
//   - the two sizes alternate order across pairs, so a machine that gets
//     steadily slower (or faster) during the run cannot bias one side
//   - the median of the paired ratios is taken, so a single scheduling hiccup
//     cannot decide the verdict
//   - sample count, rather than input size, controls the remaining spread. In
//     eight runs of `"[$ x]".repeat(12000)`, the min-max ratio (and width) was
//     5 pairs: 2.010-2.228 (0.218), 9: 1.912-2.078 (0.166), 15:
//     2.024-2.078 (0.054), and 21: 2.014-2.067 (0.053). Fifteen is the default
//     because the results have converged there; 21 gives no useful improvement.
//
// `now` is injectable so the protocol itself can be tested against a logical
// clock. Its own tests must not measure real time: a test that asserts "a
// linear function scores about 2.0" is a flaky test, whatever it is measuring.
//
// This file is test-only. It is not reachable from any package entry, so
// neither the declaration build (tsconfig.build.json) nor the library bundle
// (vite.config.ts) emits it -- both are entry-driven.

export interface DoubledSizeRatio {
  /** Duration of the size-n run in the median pair. */
  smaller: number;
  /** Duration of the size-2n run in the median pair. */
  larger: number;
  /** `larger / smaller` for the median pair. ~2 is linear, ~4 is quadratic. */
  ratio: number;
}

export interface DoubledSizeRatioOptions<TInput> {
  /** The smaller size. The larger run uses `count * 2`. */
  count: number;
  /** Builds the input for one size. Called once per size, before timing. */
  makeInput: (size: number) => TInput;
  /** The work under measurement. Receives a prebuilt input. */
  run: (input: TInput) => void;
  /**
   * Pairs to sample. Defaults to 15; the median pair is returned. Use a
   * positive odd number -- with an even count the "median" is the upper of the
   * two middle pairs, which is a coin flip rather than a measurement.
   */
  samples?: number;
  /** Clock, in milliseconds. Defaults to `performance.now`. */
  now?: () => number;
}

const DEFAULT_SAMPLES = 15;

// A pair whose smaller side measures 0 would divide to Infinity and turn a
// fast linear case into a false failure. Floor the divisor instead: at this
// scale the guard is about the shape of the growth, not the exact quotient.
const MINIMUM_DIVISOR_MS = 0.01;

/**
 * Measure how the cost of `run` grows between `count` and `count * 2`.
 *
 * The caller checks the returned `ratio` against a threshold chosen by
 * measuring BOTH the fixed and the broken state -- see the work list's
 * "しきい値の決め方". A threshold picked without breaking the guarded code
 * first is a guess.
 */
export function measureDoubledSizeRatio<TInput>({
  count,
  makeInput,
  run,
  samples = DEFAULT_SAMPLES,
  now = () => performance.now(),
}: DoubledSizeRatioOptions<TInput>): DoubledSizeRatio {
  // Loudly, not quietly. This is test infrastructure: a caller that asks for
  // zero pairs, or an even number, has a bug, and the alternative is returning
  // `undefined` typed as a result -- which surfaces as a confusing failure in
  // whichever guard used it, far from the mistake.
  if (!Number.isInteger(samples) || samples < 1 || samples % 2 === 0) {
    throw new Error(`measureDoubledSizeRatio needs a positive odd sample count, received ${samples}`);
  }
  // `count` and `count * 2` have to be two different sizes. At 0 they are the
  // same number, and so is NaN with itself, which makes the two "sizes" one
  // entry in the input map -- a ratio of one size against itself, reported as
  // if it meant something.
  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`measureDoubledSizeRatio needs a positive finite count, received ${count}`);
  }

  const sizes = [count, count * 2] as const;
  const inputs = new Map(sizes.map((size) => [size, makeInput(size)]));

  for (const size of sizes) {
    run(inputs.get(size)!);
  }

  const pairs = Array.from({ length: samples }, (_, pair) => {
    // Alternate which size goes first so a monotonic drift in machine speed
    // lands on both sides equally.
    const order = pair % 2 === 0 ? sizes : [sizes[1], sizes[0]];
    const durations = new Map<number, number>();
    for (const size of order) {
      const started = now();
      run(inputs.get(size)!);
      durations.set(size, now() - started);
    }
    const smaller = durations.get(count)!;
    const larger = durations.get(count * 2)!;
    return { smaller, larger, ratio: larger / Math.max(smaller, MINIMUM_DIVISOR_MS) };
  }).sort((left, right) => left.ratio - right.ratio);

  return pairs[Math.floor(pairs.length / 2)]!;
}
