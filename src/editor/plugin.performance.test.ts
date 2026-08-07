import { describe, expect, it } from "vitest";
import {
  filterSpecsThroughDecorationFirewallRanges,
  sortDecorationFirewallRanges,
  type MboxDecorationFirewallRange,
  type MboxDecorationSpec,
} from "./plugin.js";
import { measureDoubledSizeRatio } from "../test-kit/performance.js";

describe("decoration firewall performance", () => {
  it("looks up document-sized spec and firewall collections in O(S log F)", () => {
    const result = measureDoubledSizeRatio({
      count: 1_500,
      samples: 7,
      makeInput: (size) => {
        const ranges: MboxDecorationFirewallRange[] = Array.from({ length: size }, (_, index) => ({
          from: index * 2,
          to: index * 2 + 1,
        }));
        const specStart = size * 4;
        const specs: MboxDecorationSpec[] = Array.from({ length: size }, (_, index) => ({
          type: "mark",
          from: specStart + index * 2,
          to: specStart + index * 2 + 1,
          className: "probe",
        }));
        return { ranges: sortDecorationFirewallRanges(ranges), specs };
      },
      run: ({ ranges, specs }) => {
        expect(filterSpecsThroughDecorationFirewallRanges(specs, ranges)).toHaveLength(specs.length);
      },
    });

    expect(result.ratio).toBeLessThan(3);
  }, 15_000);
});
