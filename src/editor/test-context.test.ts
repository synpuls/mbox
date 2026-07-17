import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "./test-context.js";

describe("createTestContext", () => {
  it("creates an unfocused decoration context by default", () => {
    const context = createTestContext("# Heading");

    expect(context.state.doc.toString()).toBe("# Heading");
    expect([...context.activeLineNumbers]).toEqual([]);
  });

  it("derives active line numbers from a cursor selection", () => {
    const context = createTestContext("# Heading\nbody", { selection: 2 });

    expect([...context.activeLineNumbers]).toEqual([1]);
    expect(context.state.selection.main.head).toBe(2);
  });

  it("derives active line numbers from a range selection spanning lines", () => {
    const context = createTestContext("# Heading\nbody", { selection: { anchor: 0, head: 12 } });

    expect([...context.activeLineNumbers]).toEqual([1, 2]);
  });

  it("accepts explicit active line numbers", () => {
    const context = createTestContext("a\nb\nc", { activeLines: [3] });

    expect([...context.activeLineNumbers]).toEqual([3]);
  });
});

describe("validateDecorationSpecs", () => {
  it("does not throw for well-formed specs", () => {
    const context = createTestContext("abc");

    expect(() => validateDecorationSpecs(context, [{ type: "mark", from: 0, to: 1, className: "x" }])).not.toThrow();
  });

  it("throws for a spec that would crash a real EditorView (e.g. an empty mark range)", () => {
    const context = createTestContext("abc");

    expect(() => validateDecorationSpecs(context, [{ type: "mark", from: 1, to: 1, className: "x" }])).toThrow();
  });
});
