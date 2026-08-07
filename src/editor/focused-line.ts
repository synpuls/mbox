import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type MboxActiveLineNumbers = Set<number>;

export interface PointerLease {
  pointerId: number;
  lineNumber: number;
}

export const setPointerLease = StateEffect.define<PointerLease>();
export const clearPointerLease = StateEffect.define<number>();

export const pointerLeaseField = StateField.define<ReadonlyMap<number, number>>({
  create: () => new Map(),
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setPointerLease)) {
        next = new Map(next).set(effect.value.pointerId, effect.value.lineNumber);
      }
      if (effect.is(clearPointerLease) && next.has(effect.value)) {
        const remaining = new Map(next);
        remaining.delete(effect.value);
        next = remaining;
      }
    }
    return next;
  },
});

export function getActiveLineNumbersFromState(state: EditorState): MboxActiveLineNumbers {
  const numbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const from = Math.min(Math.max(range.from, 0), state.doc.length);
    const to = Math.min(Math.max(range.to, 0), state.doc.length);
    const end = from === to ? to : Math.max(from, to - 1);
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(end).number;

    for (let number = startLine; number <= endLine; number += 1) {
      numbers.add(number);
    }
  }

  return numbers;
}

export function getActiveLineNumbersFromView(
  view: Pick<EditorView, "state"> & { hasFocus?: boolean },
): MboxActiveLineNumbers {
  if (view.hasFocus === false) {
    return new Set();
  }

  const numbers = getActiveLineNumbersFromState(view.state);
  const leases = view.state.field(pointerLeaseField, false);
  if (leases !== undefined) {
    for (const lineNumber of leases.values()) {
      numbers.delete(lineNumber);
    }
  }
  return numbers;
}
