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
 * Run a plugin's spec output through the same normalization and lowering as a
 * real `EditorView`. Empty mark and replace ranges are normalized as they are
 * in production; invalid positions and reversed ranges still throw, so a
 * plugin/kit test catches malformed output that raw spec assertions alone
 * cannot. Add one call at the end of a test's `specsFor()` helper.
 *
 * This deliberately uses the throwing Strict variant rather than the live
 * facet's Safe variant: malformed specs should fail a test, not be dropped.
 */
export function validateDecorationSpecs(context: MboxDecorationContext, specs: MboxDecorationSpec[]): void {
  createMboxDecorationSetStrict(context.state, specs);
}
