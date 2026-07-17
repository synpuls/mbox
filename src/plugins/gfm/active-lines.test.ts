import { describe, expect, it } from "vitest";
import { isLineSpanActive } from "./active-lines.js";

describe("isLineSpanActive", () => {
  it("is true when a single-line span's line is active", () => {
    expect(isLineSpanActive({ startLine: 3, endLine: 3 }, new Set([3]))).toBe(true);
  });

  it("is false when a single-line span's line is not active", () => {
    expect(isLineSpanActive({ startLine: 3, endLine: 3 }, new Set([4]))).toBe(false);
  });

  it("is true when any line within a multi-line span is active", () => {
    expect(isLineSpanActive({ startLine: 2, endLine: 5 }, new Set([4]))).toBe(true);
  });

  it("is false when no line within a multi-line span is active", () => {
    expect(isLineSpanActive({ startLine: 2, endLine: 5 }, new Set([1, 6]))).toBe(false);
  });
});
