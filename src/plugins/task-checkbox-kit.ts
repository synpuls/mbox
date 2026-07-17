import type { EditorView } from "@codemirror/view";

export interface TaskCheckboxKitOptions {
  checked: boolean;
  /** Document range of the `[ ]` / `[x]` marker, for the toggle dispatch. */
  from: number;
  to: number;
  className?: string;
}

interface TaskCheckboxController {
  view: EditorView;
  options: TaskCheckboxKitOptions;
  pointerStartedFocused: boolean | undefined;
}

const controllers = new WeakMap<HTMLInputElement, TaskCheckboxController>();

function synchronizeTaskCheckboxInput(
  input: HTMLInputElement,
  view: EditorView,
  options: TaskCheckboxKitOptions,
): void {
  input.checked = options.checked;
  input.disabled = view.state.readOnly;
  input.className = options.className ?? "";
  input.setAttribute("aria-label", options.checked ? "checked task" : "unchecked task");
}

/** Rebind a registered checkbox widget to its current decoration data. */
export function updateTaskCheckboxInput(
  input: HTMLInputElement,
  view: EditorView,
  options: TaskCheckboxKitOptions,
): boolean {
  const controller = controllers.get(input);
  if (controller === undefined) {
    return false;
  }
  controller.view = view;
  controller.options = options;
  synchronizeTaskCheckboxInput(input, view, options);
  return true;
}

/**
 * The interactive `<input type="checkbox">` every task-list checkbox widget
 * renders: reflects `checked`, and a click dispatches the `[ ]` <-> `[x]`
 * text edit directly (mbox and GFM's identical toggle behavior). The
 * surrounding wrapper element (and whether it carries its own class) is the
 * caller's own layout, not this function's concern.
 */
export function createTaskCheckboxInput(view: EditorView, options: TaskCheckboxKitOptions): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  const controller: TaskCheckboxController = { view, options, pointerStartedFocused: undefined };
  controllers.set(input, controller);
  synchronizeTaskCheckboxInput(input, view, options);
  input.addEventListener("mousedown", (event) => {
    // Preserve an already focused checkbox through its document update without
    // blocking the native focus transition for an initially unfocused input.
    controller.pointerStartedFocused = document.activeElement === input;
    if (controller.pointerStartedFocused) {
      event.preventDefault();
    }
  });
  input.addEventListener("click", (event) => {
    // WebKit focuses an input between mousedown and click. Use the focus state
    // from pointer start so an initial click still gets its native focus action.
    const startedFocused = controller.pointerStartedFocused ?? document.activeElement === input;
    const focusAfterToggle = controller.pointerStartedFocused === false;
    controller.pointerStartedFocused = undefined;
    if (startedFocused) {
      event.preventDefault();
    }
    event.stopPropagation();
    if (controller.view.state.readOnly) {
      return;
    }
    controller.view.dispatch({
      changes: {
        from: controller.options.from,
        to: controller.options.to,
        insert: controller.options.checked ? "[ ]" : "[x]",
      },
    });
    // Native checkbox activation runs after this handler. Reapply the current
    // widget state in the next task, once its default action has completed.
    setTimeout(() => {
      const current = controllers.get(input);
      if (current !== undefined) {
        synchronizeTaskCheckboxInput(input, current.view, current.options);
        if (focusAfterToggle) {
          input.focus();
        }
      }
    }, 0);
  });
  return input;
}
