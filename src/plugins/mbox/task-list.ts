import { WidgetType, type EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { createContentMarkSpec, type MboxDecorationSpec, type MboxPlugin, type MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import { createTaskCheckboxInput, updateTaskCheckboxInput } from "../task-checkbox-kit.js";

const taskListIndentClassName = "mbox-task-list-indent";
const taskListContentClassName = "mbox-task-list-content";
const taskListCheckboxSlotClassName = "mbox-task-checkbox-slot";
const taskListFocusedLineClassName = "mbox-task-list-focused-line";
export const taskListClassNames = {
  item: "mbox-task-list",
  checkbox: "mbox-task-checkbox",
};

export class TaskListCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly className: string,
    private readonly from: number,
    private readonly to: number,
    private readonly readOnly = false,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskListCheckboxWidget &&
      this.checked === other.checked &&
      this.className === other.className &&
      this.from === other.from &&
      this.to === other.to &&
      this.readOnly === other.readOnly
    );
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    if (dom.className !== taskListCheckboxSlotClassName || dom.childElementCount !== 1) {
      return false;
    }
    const input = dom.firstElementChild;
    return input instanceof HTMLInputElement && input.type === "checkbox"
      ? updateTaskCheckboxInput(input, view, {
          checked: this.checked,
          className: this.className,
          from: this.from,
          to: this.to,
        })
      : false;
  }

  toDOM(view: EditorView): HTMLElement {
    const slot = document.createElement("span");
    slot.className = taskListCheckboxSlotClassName;
    slot.appendChild(
      createTaskCheckboxInput(view, { checked: this.checked, className: this.className, from: this.from, to: this.to }),
    );
    return slot;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function createTaskListSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  state: EditorState,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block): MboxDecorationSpec[] =>
    block.type === "taskListItem"
      ? activeLines.has(block.line)
        ? [
            {
              type: "line",
              from: block.from,
              to: block.from,
              className: taskListFocusedLineClassName,
              attributes: {
                style: `--mbox-task-list-focused-marker-width: ${block.content.from - block.from}ch`,
              },
            },
          ]
        : [
            {
              type: "line",
              from: block.from,
              to: block.from,
              className: taskListClassNames.item,
            },
            ...(block.from < block.marker.from
              ? [
                  {
                    type: "mark" as const,
                    from: block.from,
                    to: block.marker.from,
                    className: taskListIndentClassName,
                  },
                ]
              : []),
            {
              type: "replace",
              from: block.syntax.from,
              to: block.syntax.to,
              widget: new TaskListCheckboxWidget(
                block.checked,
                taskListClassNames.checkbox,
                block.checkbox.from,
                block.checkbox.to,
                state.readOnly,
              ),
            },
            ...createContentMarkSpec(block.content.from, block.content.to, taskListContentClassName),
          ]
      : [],
  );
}

export function taskListPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${taskListFocusedLineClassName}`]: {
        boxSizing: "border-box",
        paddingLeft: "var(--mbox-task-list-focused-marker-width)",
        textIndent: "calc(-1 * var(--mbox-task-list-focused-marker-width))",
      },
      [`.${taskListClassNames.item}`]: {
        alignItems: "start",
        display: "flex",
      },
      [`.${taskListIndentClassName}`]: {
        flexShrink: "0",
        whiteSpace: "pre",
      },
      [`.${taskListContentClassName}`]: {
        display: "block",
        minWidth: "0",
        overflowWrap: "anywhere",
      },
      [`.${taskListCheckboxSlotClassName}`]: {
        alignItems: "center",
        display: "inline-flex",
        flexShrink: "0",
        blockSize: "1lh",
        inlineSize: "2ch",
        justifyContent: "flex-start",
      },
      [`.${taskListClassNames.checkbox}`]: {
        blockSize: "1em",
        boxSizing: "border-box",
        font: "inherit",
        inlineSize: "1em",
        margin: "0 0 0 calc(0.5ch - 0.5em)",
        verticalAlign: "-0.125em",
      },
    },
    name: "mbox/task-list",
    decorations: (context) =>
      createTaskListSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers, context.state),
  };
}
