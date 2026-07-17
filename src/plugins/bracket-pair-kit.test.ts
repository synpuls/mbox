import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createBracketPairTransaction } from "./bracket-pair-kit.js";

function applyBracketPair(
  doc: string,
  ranges: Array<{ anchor: number; head?: number }>,
  options: { open: string; close: string } = { open: "[", close: "]" },
) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map((range) => EditorSelection.range(range.anchor, range.head ?? range.anchor))),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });
  const next = state.update(createBracketPairTransaction(state, options)).state;
  return {
    doc: next.doc.toString(),
    ranges: next.selection.ranges.map((range) => ({ anchor: range.anchor, head: range.head })),
  };
}

describe("createBracketPairTransaction", () => {
  it("inserts a closing bracket and puts the caret between the pair", () => {
    expect(applyBracketPair("ab", [{ anchor: 1 }])).toEqual({
      doc: "a[]b",
      ranges: [{ anchor: 2, head: 2 }],
    });
  });

  it("wraps a non-empty selection and keeps the text selected", () => {
    expect(applyBracketPair("abc", [{ anchor: 0, head: 3 }])).toEqual({
      doc: "[abc]",
      ranges: [{ anchor: 1, head: 4 }],
    });
  });

  it("closes a bracket at every caret for multiple selections", () => {
    expect(applyBracketPair("abc", [{ anchor: 1 }, { anchor: 2 }])).toEqual({
      doc: "a[]b[]c",
      ranges: [
        { anchor: 2, head: 2 },
        { anchor: 5, head: 5 },
      ],
    });
  });

  it("uses arbitrary bracket pair characters from options", () => {
    expect(applyBracketPair("ab", [{ anchor: 1 }], { open: "(", close: ")" })).toEqual({
      doc: "a()b",
      ranges: [{ anchor: 2, head: 2 }],
    });
  });
});
