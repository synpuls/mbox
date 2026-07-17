import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  taskListClassNames,
  taskListPlugin,
  TaskListCheckboxWidget,
} from "./task-list.js";

import { createTestContext, validateDecorationSpecs } from "../../testing.js";

const taskListSpecs = (doc: string, activeLines: Iterable<number> = []) =>
  taskListPlugin().decorations!(createTestContext(doc, { activeLines }));
const validTaskListSpecs = (doc: string, activeLines: Iterable<number> = []) => {
  const context = createTestContext(doc, { activeLines });
  const specs = taskListPlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
};

describe("createTaskListSpecs", () => {
  it("creates task list line and checkbox replacement specs outside active raw syntax lines", () => {
    const input = "- [ ] task\n- [x] done";

    expect(taskListSpecs(input, [1])).toEqual([
      {
        type: "line",
        from: 0,
        className: "mbox-task-list-focused-line",
        attributes: {
          style: "--mbox-task-list-focused-marker-width: 6ch",
        },
      },
      {
        type: "line",
        from: 11,
        className: taskListClassNames.item,
      },
      {
        type: "replace",
        from: 11,
        to: 17,
        widget: new TaskListCheckboxWidget(true, taskListClassNames.checkbox, 13, 16),
      },
      {
        type: "mark",
        from: 17,
        to: 21,
        className: "mbox-task-list-content",
        inclusiveStart: true,
        inclusiveEnd: true,
      },
    ]);
  });

  it("creates a hanging indent line spec on active raw syntax lines", () => {
    const input = "- [ ] task";

    expect(taskListSpecs(input, [1])).toEqual([
      {
        type: "line",
        from: 0,
        className: "mbox-task-list-focused-line",
        attributes: {
          style: "--mbox-task-list-focused-marker-width: 6ch",
        },
      },
    ]);
  });

  it("produces valid specs for empty task list items", () => {
    expect(() => validTaskListSpecs("- [ ]\n- [x]\n- [ ]  ")).not.toThrow();
  });
});

describe("taskListPlugin", () => {
  it("provides task list specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "- [ ] task\n- [x] done",
      selection: EditorSelection.cursor(2),
      extensions: [
        createMboxExtension({
          plugins: [taskListPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("- [ ] task\n- [x] done", { selection: 2 }))).toEqual([
      {
        type: "line",
        from: 0,
        className: "mbox-task-list-focused-line",
        attributes: {
          style: "--mbox-task-list-focused-marker-width: 6ch",
        },
      },
      {
        type: "line",
        from: 11,
        className: taskListClassNames.item,
      },
      {
        type: "replace",
        from: 11,
        to: 17,
        widget: new TaskListCheckboxWidget(true, taskListClassNames.checkbox, 13, 16),
      },
      {
        type: "mark",
        from: 17,
        to: 21,
        className: "mbox-task-list-content",
        inclusiveStart: true,
        inclusiveEnd: true,
      },
    ]);
  });
});

describe("TaskListCheckboxWidget", () => {
  it("keeps the original constructor arity and treats read-only as an invalidation key", () => {
    const original = new TaskListCheckboxWidget(false, taskListClassNames.checkbox, 2, 5);

    expect(original.eq(new TaskListCheckboxWidget(false, taskListClassNames.checkbox, 2, 5))).toBe(true);
    expect(original.eq(new TaskListCheckboxWidget(false, taskListClassNames.checkbox, 2, 5, true))).toBe(false);
  });
});
