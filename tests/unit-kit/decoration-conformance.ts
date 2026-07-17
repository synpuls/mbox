import { describe, expect, it } from "vitest";
import type { MboxDecorationContext, MboxDecorationSpec, MboxPlugin } from "../../src/editor/plugin.js";
import { createTestContext, validateDecorationSpecs } from "../../src/testing.js";

// The shared conformance harness: every notation bundle runs over a document
// corpus asserting only the invariants ALL plugins share. Notation grammar,
// class names, and exact offsets belong in each notation's co-located tests —
// never here — so corpus entries need no expected values, which is what makes
// "add the doc that broke" a one-line contribution (see TESTING.md §9).

export interface DecorationCorpusCase {
  /** Shown in the generated test name. */
  name: string;
  doc: string;
}

export interface DecorationConformanceOptions {
  /** Notation name for the describe title. */
  name: string;
  /**
   * Factory, not an array: each verification run gets fresh plugin instances,
   * so the determinism check also catches state a plugin hides per instance.
   */
  plugins: () => MboxPlugin[];
  corpus: readonly DecorationCorpusCase[];
}

export function runDecorationConformance(options: DecorationConformanceOptions): void {
  describe(`${options.name} decoration conformance`, () => {
    for (const item of options.corpus) {
      it(`${item.name}: specs lower, stay in bounds, and are deterministic`, () => {
        for (const { label, context } of contextsFor(item.doc)) {
          const first = collectVerifiedSpecs(options.plugins(), context, label);
          const second = collectVerifiedSpecs(options.plugins(), context, label);
          expect(second, `${label}: two runs over the same context must produce identical specs`).toEqual(first);
        }
      });
    }
  });
}

/**
 * The three context shapes a real editor cycles through: blurred (no active
 * lines), fully focused (every line active — raw syntax shown everywhere),
 * and a cursor-derived active line.
 */
function contextsFor(doc: string): Array<{ label: string; context: MboxDecorationContext }> {
  const unfocused = createTestContext(doc);
  const lineNumbers = Array.from({ length: unfocused.state.doc.lines }, (_, index) => index + 1);
  return [
    { label: "unfocused", context: unfocused },
    { label: "all lines active", context: createTestContext(doc, { activeLines: lineNumbers }) },
    // The state's length, not doc.length: EditorState normalizes CRLF, so the
    // raw string can be longer than the document it produces.
    { label: "cursor at end", context: createTestContext(doc, { selection: unfocused.state.doc.length }) },
  ];
}

function collectVerifiedSpecs(plugins: MboxPlugin[], context: MboxDecorationContext, label: string): MboxDecorationSpec[] {
  const combined: MboxDecorationSpec[] = [];

  plugins.forEach((plugin, index) => {
    let specs: MboxDecorationSpec[];
    try {
      specs = plugin.decorations?.(context) ?? [];
    } catch (error) {
      throw new Error(`${label}: plugin #${index} threw while building specs: ${String(error)}`);
    }

    for (const spec of specs) {
      expect(spec.from, `${label}: plugin #${index} produced a negative from`).toBeGreaterThanOrEqual(0);
      const to = "to" in spec ? spec.to : spec.from;
      expect(to, `${label}: plugin #${index} produced to < from`).toBeGreaterThanOrEqual(spec.from);
      expect(to, `${label}: plugin #${index} produced to past the document end`).toBeLessThanOrEqual(
        context.state.doc.length,
      );
    }

    try {
      validateDecorationSpecs(context, specs);
    } catch (error) {
      throw new Error(`${label}: plugin #${index}'s specs failed to lower: ${String(error)}`);
    }

    combined.push(...specs);
  });

  // Individually lowering specs is not enough: a boundary collision between
  // two plugins only surfaces when the whole bundle lowers together, which is
  // what a real editor does.
  try {
    validateDecorationSpecs(context, combined);
  } catch (error) {
    throw new Error(`${label}: the combined specs of all plugins failed to lower: ${String(error)}`);
  }

  return combined;
}
