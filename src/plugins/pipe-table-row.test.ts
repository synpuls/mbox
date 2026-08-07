import { describe, expect, it } from "vitest";
import { findPipeOffsets } from "./pipe-table-row.js";

describe("findPipeOffsets", () => {
  it.each([
    ["returns no offsets for text without pipes", "a😀e\u0301𐐷", []],
    ["returns no offsets for an empty string", "", []],
    ["includes a pipe at offset zero", "|cell", [0]],
    ["keeps adjacent pipes as adjacent offsets", "a||b", [1, 2]],
    ["includes a trailing pipe", "cell|", [4]],
    ["scans lone surrogates as UTF-16 code units", "\uD83D|", [1]],
    ["returns UTF-16 offsets after non-BMP characters", "a😀|e\u0301|𐐷|", [3, 6, 9]],
  ])("%s", (_description, text, expected) => {
    expect(findPipeOffsets(text)).toEqual(expected);
  });
});
