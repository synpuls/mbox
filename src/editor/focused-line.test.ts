import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  getActiveLineNumbersFromState,
  getActiveLineNumbersFromView,
} from "./focused-line.js";

describe("getActiveLineNumbersFromState", () => {
  it("gets the cursor line for an empty selection", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree",
      selection: EditorSelection.cursor(5),
    });

    expect(getActiveLineNumbersFromState(state)).toEqual(new Set([2]));
  });

  it("gets active raw syntax lines from an EditorState selection", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree",
      selection: EditorSelection.range(1, 10),
    });

    expect(getActiveLineNumbersFromState(state)).toEqual(new Set([1, 2, 3]));
  });

  it("keeps the end line out when the selection ends at the start of that line", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree",
      selection: EditorSelection.range(0, 4),
    });

    expect(getActiveLineNumbersFromState(state)).toEqual(new Set([1]));
  });

  it("gets every cursor line for multiple empty selections", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree",
      selection: EditorSelection.create([
        EditorSelection.cursor(1),
        EditorSelection.cursor(9),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });

    expect(getActiveLineNumbersFromState(state)).toEqual(new Set([1, 3]));
  });

  it("does not stringify the document to get active raw syntax lines from EditorState", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree\nfour",
      selection: EditorSelection.create([
        EditorSelection.range(1, 6),
        EditorSelection.range(14, 18),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    const toString = vi.spyOn(state.doc, "toString");

    expect(getActiveLineNumbersFromState(state)).toEqual(new Set([1, 2, 4]));
    expect(toString).not.toHaveBeenCalled();
  });
});

describe("getActiveLineNumbersFromView", () => {
  it("returns no active raw syntax lines when the editor is not focused", () => {
    const state = EditorState.create({
      doc: "# h1",
      selection: EditorSelection.cursor(0),
    });

    expect(getActiveLineNumbersFromView({ state, hasFocus: false })).toEqual(new Set());
  });

  it("returns selected raw syntax lines when the editor is focused", () => {
    const state = EditorState.create({
      doc: "one\ntwo\nthree",
      selection: EditorSelection.range(1, 10),
    });

    expect(getActiveLineNumbersFromView({ state, hasFocus: true })).toEqual(new Set([1, 2, 3]));
  });
});
