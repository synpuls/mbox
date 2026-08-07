import { describe, expect, it } from "vitest";
import { measureDoubledSizeRatio } from "../../test-kit/performance.js";
import { parseScrapboxInline } from "./inline.js";

// Ratio guards for the Scrapbox inline scanner.
//
// This file is the infrastructure, registered in vitest.config.ts's isolated
// `performance` project. The guards themselves arrive with the work that makes
// them pass -- every one of them fails today, because the quadratic scans they
// guard against are still in the scanner. Writing them now would mean either a
// red suite or a threshold loosened until it proved nothing.
//
// So the owed guards are listed as todos rather than left to memory. The work
// list is the record of record; this list is what a reader of the performance
// project sees.
//
// Each replacement follows the same procedure, and none of it is optional:
//
//   1. measure the ratio after the fix (linear should land near 2.0)
//   2. BREAK the thing being guarded and measure the ratio again
//   3. pick a threshold that clearly separates the two -- not one the broken
//      state only just exceeds
//   4. write both numbers, and the reason for the threshold, in a comment
//
// A threshold chosen without step 2 is a guess, and a guess that happens to
// pass is worse than no guard.
//
// Use measureDoubledSizeRatio from src/test-kit/performance.ts: it builds both
// inputs before timing, warms both sizes, alternates their order across pairs
// and takes the median, none of which is safe to reimplement per file.
//
// Sizes need choosing too. Pick them so the BROKEN state still finishes in a
// reasonable time: a synchronous parse cannot be interrupted by a test
// timeout, so a size that makes the broken case run for minutes hangs the
// suite instead of failing it. Any absolute-duration assertion alongside the
// ratio is an after-the-fact record of an abnormal run, never a stop.

describe("parseScrapboxInline performance", () => {
  // Work list 3-1. A bare URL candidate that keeps losing arbitration, so the
  // scanner re-derives it from a later position on every round.
  // Original measurements on this input, 8k against 16k, median of five pairs:
  //   deferred resolution          2.03, 2.08   (linear)
  //   scanning to the whitespace
  //   terminator during arbitration 3.98, 4.23  (quadratic)
  // In ten cooled, performance-first repaired runs the maximum was 2.114.
  // Restoring the eager regexp three times produced 3.946--3.951; the fresh
  // minimum is 3.946. Their midpoint is 3.030.
  it("keeps a repeatedly-losing bare url candidate linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 8_000,
      makeInput: (n) => "[https://e.test/x]".repeat(n),
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(3.03);
    expect(result.larger).toBeLessThan(5_000);
  });

  // Work list 3-2. Two independent causes, so two guards: the strong scanner
  // rescanning a run with no line terminator in it, and the same scanner
  // walking to a single distant closing marker across line boundaries.
  // Original measurements here, 16k against 32k, median of five pairs:
  //   repaired: no-line 2.04, 2.11, 2.13; cross-line 1.97, 1.99, 2.02
  //   line-terminator cursor absent: no-line 5.032; cross-line 3.49
  //   closing-marker cursor absent:  no-line 2.07; cross-line 3.60
  // The line-terminator cursor protects both inputs, whereas the closing-marker
  // cursor is exposed only by the cross-line input. Keeping either one alone
  // therefore still leaves a superlinear case: no-line or cross-line, respectively.
  // Ten cooled, performance-first repaired runs reached 2.095 for no-line and
  // 2.016 for cross-line. The fresh no-line line-cursor break was 4.973. On the
  // cross-line guard, fresh line-cursor and closing-cursor breaks were 3.485 and
  // 3.442, so its broken minimum is 3.442. The repaired/broken midpoints are
  // 3.534 and 2.729 respectively.
  it("keeps a repeated strong opener with no line terminator linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 16_000,
      makeInput: (n) => "[[x]]".repeat(n),
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(3.534);
    expect(result.larger).toBeLessThan(5_000);
  });
  it("keeps a strong candidate that crosses lines to one distant closer linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 16_000,
      makeInput: (n) => "[[x\n".repeat(n) + "]]",
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(2.729);
    expect(result.larger).toBeLessThan(5_000);
  });

  // Work list 4-1 uses three inputs, rather than the earlier two todos:
  // successful bare candidates can still make the spaced search quadratic,
  // so they expose a third, independent cursor.
  // Original measurements here, median of five pairs:
  //   repaired: repeated bare (12k -> 24k) 2.20, distant closer
  //             (24k -> 48k) 2.05
  //   line-end cursor removed: repeated bare (12k -> 24k) 5.15
  //             (495.58ms -> 2553.94ms)
  //   spaced-closer cursor removed: repeated bare (12k -> 24k) 3.99
  //             (480.10ms -> 1917.16ms)
  //   bare-closer cursor removed: distant closer (24k -> 48k) 3.86
  //             (25.01ms -> 96.58ms)
  // Ten cooled, performance-first repaired runs reached 2.342 for repeated
  // bare (one outlier; the other nine were at most 2.110) and 2.063 for the
  // distant closer. Fresh line-end and spaced-closer breaks were 5.136 and
  // 3.923, so the repeated-bare broken minimum is 3.923. The fresh bare-closer
  // break was 3.602. Their repaired/broken midpoints are 3.133 and 2.832.
  it("keeps repeated bare-closing formulas linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 12_000,
      makeInput: (n) => "[$ x]".repeat(n),
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(3.133);
    expect(result.larger).toBeLessThan(5_000);
  });

  it("keeps formulas from crossing lines to one distant closer", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 24_000,
      makeInput: (n) => "[$ x\n".repeat(n) + "]",
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(2.832);
    expect(result.larger).toBeLessThan(5_000);
  });

  // Work list 4-7 has two guards because image-token termination and the
  // two-element link side are independent scans. The requested 4k -> 8k
  // starting point made an intentional broken run take about 20 seconds, so
  // these use 2k -> 4k. Original measurements used a median of five pairs:
  //   repaired image side: 1.310ms -> 2.622ms, 2.002
  //   image terminator cursors removed: 181.941ms -> 752.897ms, 4.138
  //   repaired link side: 1.441ms -> 2.930ms, 2.032
  //   link terminator cursors removed: 352.480ms -> 1471.304ms, 4.174
  // Ten cooled, performance-first repaired runs reached 2.045 on the image
  // side and 2.030 on the link side. Fresh one-side terminator-cursor breaks
  // were 4.466 and 4.329. Their repaired/broken midpoints are 3.256 and 3.179.
  // Each one-side mutation fails its ratio assertion, while the broken larger
  // runs remain under the 5s sanity bound.
  it("keeps repeated image-url openers with one distant closer linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 2_000,
      makeInput: (n) => "[https://".repeat(n) + "]",
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(3.256);
    expect(result.larger).toBeLessThan(5_000);
  });

  it("keeps repeated two-element link-side candidates linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 2_000,
      makeInput: (n) => "[https://e.test/a".repeat(n) + ".png]",
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(3.179);
    expect(result.larger).toBeLessThan(5_000);
  });

  // Work list 4-7 #3 reuses the image scanner's terminator cursors for the
  // double-bracket form. At 2k -> 4k, the repaired scanner measured
  // 4.965ms -> 10.033ms (2.021). In the fresh measurement, ten cooled,
  // performance-first repaired runs reached 2.063. Replacing the shared closing
  // cursor with a fresh indexOf produced 2.428--2.456 across three runs, far
  // below the stale 3.195 record. The repaired/broken midpoint is therefore
  // 2.246; the old 2.5 threshold did not detect this regression.
  it("keeps double-bracket src-first candidates linear", { timeout: 10_000 }, () => {
    const result = measureDoubledSizeRatio({
      count: 2_000,
      makeInput: (n) => "[[https://i.test/a.png ".repeat(n) + "https://link.test]]",
      run: parseScrapboxInline,
    });
    expect(result.ratio).toBeLessThan(2.246);
    expect(result.larger).toBeLessThan(5_000);
  });

  // Deliberately absent: a hashtag guard. Work list 4-3 decided against one and
  // records fixed measurements instead of a ratio. Do not add one here without
  // reopening that decision.
  // Also absent: a formula-with-no-closer guard. With all three formula cursors
  // removed, three broken runs stayed linear at 2.088--2.129, so that input does
  // not protect a superlinear path and a ratio threshold would prove nothing.
});
