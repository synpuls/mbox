import { EditorSelection, EditorState } from "@codemirror/state";
import { getActiveLineNumbersFromState } from "./focused-line.js";
import { createMboxDecorationSetStrict, type MboxDecorationContext, type MboxDecorationSpec } from "./plugin.js";

export interface CreateTestContextOptions {
  /** Explicit 1-based active line numbers; overrides `selection` derivation. */
  activeLines?: Iterable<number>;
  /** A cursor offset or range whose lines become the active lines. */
  selection?: number | { anchor: number; head?: number };
}

/**
 * Build a decoration context straight from a document string, for exercising
 * `plugin.decorations(context)` in tests without a DOM or an editor view.
 * With no options the context is unfocused (no active lines), matching a
 * blurred editor.
 */
export function createTestContext(doc: string, options: CreateTestContextOptions = {}): MboxDecorationContext {
  const selection =
    options.selection === undefined
      ? undefined
      : typeof options.selection === "number"
        ? EditorSelection.cursor(options.selection)
        : EditorSelection.single(options.selection.anchor, options.selection.head ?? options.selection.anchor);
  const state = EditorState.create({ doc, selection });

  const activeLineNumbers =
    options.activeLines !== undefined
      ? new Set(options.activeLines)
      : options.selection !== undefined
        ? getActiveLineNumbersFromState(state)
        : new Set<number>();

  return { state, activeLineNumbers };
}

/**
 * Run a plugin's spec output through the same lowering a real `EditorView`
 * does (`createMboxDecorationSetStrict`), so a plugin/kit test catches a spec
 * that violates a CodeMirror decoration constraint (e.g. an empty mark range)
 * -- something asserting on the raw spec array alone cannot, since
 * `createTestContext` never lowers specs itself. Add one call at the end of
 * a test's `specsFor()` helper; it throws (failing the test) exactly when a
 * real EditorView would. Deliberately the throwing (Strict) variant, not the
 * live facet's Safe one -- a broken spec should fail the test, not be dropped.
 */
export function validateDecorationSpecs(context: MboxDecorationContext, specs: MboxDecorationSpec[]): void {
  createMboxDecorationSetStrict(context.state, specs);
}
