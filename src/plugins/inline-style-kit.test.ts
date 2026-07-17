import { describe, expect, it } from "vitest";
import { createInlineStyleKitSpecs } from "./inline-style-kit.js";

const span = {
  openMarker: { from: 0, to: 1 },
  content: { from: 1, to: 5 },
  closeMarker: { from: 5, to: 6 },
  className: "test-class",
};

describe("createInlineStyleKitSpecs", () => {
  it("marks the content and replaces both markers when markers are hidden", () => {
    expect(createInlineStyleKitSpecs(span, true)).toEqual([
      { type: "mark", from: 1, to: 5, className: "test-class", inclusiveStart: true, inclusiveEnd: true },
      { type: "replace", from: 0, to: 1 },
      { type: "replace", from: 5, to: 6 },
    ]);
  });

  it("marks the content but leaves both markers raw when markers are not hidden", () => {
    expect(createInlineStyleKitSpecs(span, false)).toEqual([{ type: "mark", from: 1, to: 5, className: "test-class", inclusiveStart: true, inclusiveEnd: true }]);
  });
});
