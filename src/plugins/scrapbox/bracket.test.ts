import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { insertScrapboxBracketPair } from "./bracket.js";

function applyBracketPair(doc: string, ranges: Array<{ anchor: number; head?: number }>) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map((range) => EditorSelection.range(range.anchor, range.head ?? range.anchor))),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  });
  const next = state.update(insertScrapboxBracketPair(state)).state;
  return {
    doc: next.doc.toString(),
    ranges: next.selection.ranges.map((range) => ({ anchor: range.anchor, head: range.head })),
  };
}

describe("insertScrapboxBracketPair", () => {
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
    // Two carets: "a|b|c" -> "a[]b[]c" with a caret inside each new pair.
    expect(applyBracketPair("abc", [{ anchor: 1 }, { anchor: 2 }])).toEqual({
      doc: "a[]b[]c",
      ranges: [
        { anchor: 2, head: 2 },
        { anchor: 5, head: 5 },
      ],
    });
  });
});
