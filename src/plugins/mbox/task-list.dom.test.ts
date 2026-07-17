import { describe, expect, it } from "vitest";
import { Compartment, EditorSelection, EditorState, type Extension, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  taskListClassNames,
  taskListPlugin,
  TaskListCheckboxWidget,
} from "./task-list.js";

function withTaskListView<T>(
  options: { doc: string; selection?: EditorSelection | SelectionRange; extensions?: Extension[] },
  run: (context: { parent: HTMLElement; view: EditorView }) => T | Promise<T>,
): T | Promise<T> {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      selection: options.selection,
      extensions: [
        createMboxExtension({
          plugins: [taskListPlugin()],
        }),
        ...(options.extensions ?? []),
      ],
    }),
  });

  try {
    const result = run({ parent, view });
    if (result instanceof Promise) {
      return result.finally(() => {
        view.destroy();
        parent.remove();
      });
    }
    view.destroy();
    parent.remove();
    return result;
  } catch (error) {
    view.destroy();
    parent.remove();
    throw error;
  }
}

describe("taskListPlugin", () => {
  it("renders task list checkboxes on the initial unfocused editor view", () => {
    withTaskListView(
      {
        doc: "- [ ] task\n- [x] done",
        selection: EditorSelection.cursor(0),
      },
      ({ parent }) => {
        const checkboxes = parent.querySelectorAll<HTMLInputElement>(`.${taskListClassNames.checkbox}`);
        expect(parent.querySelectorAll(`.cm-line.${taskListClassNames.item}`)).toHaveLength(2);
        expect(parent.querySelectorAll(".cm-line")[0]?.textContent).toBe("task");
        expect(parent.querySelectorAll(".cm-line")[1]?.textContent).toBe("done");
        expect(checkboxes).toHaveLength(2);
        expect(checkboxes[0]?.checked).toBe(false);
        expect(checkboxes[1]?.checked).toBe(true);
      },
    );
  });

  it("renders task checkboxes as clickable widgets", () => {
    withTaskListView(
      {
        doc: "- [ ] task",
        selection: EditorSelection.cursor(10),
      },
      ({ parent }) => {
        const checkbox = parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`);

        expect(parent.querySelector(".mbox-task-checkbox-slot")).not.toBeNull();
        expect(checkbox?.disabled).toBe(false);
        expect(checkbox?.checked).toBe(false);
      },
    );
  });

  it("renders a disabled read-only checkbox that cannot change an unchecked task", () => {
    withTaskListView(
      {
        doc: "- [ ] task",
        selection: EditorSelection.cursor(10),
        extensions: [EditorState.readOnly.of(true)],
      },
      async ({ parent, view }) => {
        const checkbox = parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`);

        expect(checkbox?.disabled).toBe(true);
        checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(view.state.doc.toString()).toBe("- [ ] task");
      },
    );
  });

  it("toggles an unchecked task checkbox by replacing the document marker", async () => {
    await withTaskListView(
      {
        doc: "- [ ] task",
        selection: EditorSelection.cursor(10),
      },
      async ({ parent, view }) => {
        parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(view.state.doc.toString()).toBe("- [x] task");
        expect(parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.checked).toBe(true);
        expect(parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.getAttribute("aria-label")).toBe("checked task");
      },
    );
  });

  it("toggles a checked task checkbox by replacing the document marker", async () => {
    await withTaskListView(
      {
        doc: "- [x] task",
        selection: EditorSelection.cursor(10),
      },
      async ({ parent, view }) => {
        parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(view.state.doc.toString()).toBe("- [ ] task");
        expect(parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.checked).toBe(false);
        expect(parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.getAttribute("aria-label")).toBe("unchecked task");
      },
    );
  });

  it("keeps a focused checkbox node through two stable-marker toggles", async () => {
    await withTaskListView(
      { doc: "- [ ] task\nplain", selection: EditorSelection.cursor(16) },
      async ({ parent, view }) => {
        const checkbox = parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`);
        checkbox?.focus();

        checkbox?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view.state.doc.toString()).toBe("- [x] task\nplain");
        expect(parent.querySelector(`.${taskListClassNames.checkbox}`)).toBe(checkbox);
        expect(document.activeElement).toBe(checkbox);
        expect(checkbox?.checked).toBe(true);
        expect(checkbox?.getAttribute("aria-label")).toBe("checked task");

        checkbox?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view.state.doc.toString()).toBe("- [ ] task\nplain");
        expect(parent.querySelector(`.${taskListClassNames.checkbox}`)).toBe(checkbox);
        expect(document.activeElement).toBe(checkbox);
        expect(checkbox?.checked).toBe(false);
        expect(checkbox?.getAttribute("aria-label")).toBe("unchecked task");
      },
    );
  });

  it("reuses the checkbox while read-only is reconfigured", async () => {
    const readOnly = new Compartment();
    await withTaskListView(
      { doc: "- [ ] task\nplain", selection: EditorSelection.cursor(16), extensions: [readOnly.of([])] },
      async ({ parent, view }) => {
        const checkbox = parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`);
        view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(true)) });
        expect(parent.querySelector(`.${taskListClassNames.checkbox}`)).toBe(checkbox);
        expect(checkbox?.disabled).toBe(true);
        checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(view.state.doc.toString()).toBe("- [ ] task\nplain");

        view.dispatch({ effects: readOnly.reconfigure([]) });
        expect(parent.querySelector(`.${taskListClassNames.checkbox}`)).toBe(checkbox);
        expect(checkbox?.disabled).toBe(false);
        checkbox?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view.state.doc.toString()).toBe("- [x] task\nplain");
      },
    );
  });

  it("toggles the current marker after a preceding edit shifts its range", () => {
    withTaskListView(
      { doc: "- [ ] task\nplain", selection: EditorSelection.cursor(16) },
      ({ parent, view }) => {
        view.dispatch({ changes: { from: 0, insert: "note\n" } });
        parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.click();

        expect(view.state.doc.toString()).toBe("note\n- [x] task\nplain");
      },
    );
  });

  it("toggles a nested task checkbox without changing the surrounding list text", () => {
    withTaskListView(
      {
        doc: "- root\n  - [ ] nested",
        selection: EditorSelection.cursor(20),
      },
      ({ parent, view }) => {
        parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.click();

        expect(view.state.doc.toString()).toBe("- root\n  - [x] nested");
      },
    );
  });

  it("emits the checkbox toggle as a document transaction for controlled usage", () => {
    const docs: string[] = [];
    withTaskListView(
      {
        doc: "- [ ] task",
        selection: EditorSelection.cursor(10),
        extensions: [
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              docs.push(update.state.doc.toString());
            }
          }),
        ],
      },
      ({ parent }) => {
        parent.querySelector<HTMLInputElement>(`.${taskListClassNames.checkbox}`)?.click();

        expect(docs).toEqual(["- [x] task"]);
      },
    );
  });

  it("keeps focused task list lines as raw syntax", () => {
    withTaskListView(
      {
        doc: "- [ ] task\n- [x] done",
        selection: EditorSelection.cursor(2),
      },
      ({ parent, view }) => {
        Object.defineProperty(view, "hasFocus", { value: true });
        view.dispatch({ selection: EditorSelection.cursor(2) });

        expect(parent.querySelectorAll(`.${taskListClassNames.checkbox}`)).toHaveLength(1);
        expect(parent.querySelectorAll(".cm-line")[0]?.textContent).toBe("- [ ] task");
        expect(parent.querySelectorAll(".cm-line")[1]?.textContent).toBe("done");
      },
    );
  });
});

describe("TaskListCheckboxWidget", () => {
  it("updates a registered checkbox DOM in place and rejects malformed DOM", () => {
    const view = new EditorView({ state: EditorState.create({ doc: "- [x] task" }) });
    const slot = new TaskListCheckboxWidget(false, taskListClassNames.checkbox, 2, 5).toDOM(view);
    const input = slot.querySelector<HTMLInputElement>("input");

    expect(new TaskListCheckboxWidget(true, taskListClassNames.checkbox, 2, 5).updateDOM(slot, view)).toBe(true);
    expect(slot.querySelector("input")).toBe(input);
    expect(input?.checked).toBe(true);
    expect(input?.getAttribute("aria-label")).toBe("checked task");
    expect(new TaskListCheckboxWidget(true, taskListClassNames.checkbox, 2, 5).updateDOM(document.createElement("span"), view)).toBe(false);

    view.destroy();
  });
});
