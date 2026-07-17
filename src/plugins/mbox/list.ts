// Renders a `- ` bullet list with a hanging indent. An UNFOCUSED list line
// becomes a flex line whose leading indent is one mark span and whose content is
// another, with the raw `- ` marker syntax hidden and replaced by a painted dot
// (the `::after` in the theme below). A FOCUSED (selected) line reveals its raw
// text but paints its own aligned dot via a zero-width replace widget, so the
// content column never shifts between the two states. The keymap turns Enter/Tab/
// Backspace/etc. into list-aware edits.
//
// Structural convention: one create*Specs function = one visual concern of that
// picture — createListUnfocusedLineSpecs (indent + content spans), *SyntaxHideSpecs
// (hide the raw `- `), *FocusedLineSpecs (the focused line's alignment vars), and
// *FocusedSyntaxSpecs (the focused dot widget). The create*Edit functions are the
// keymap's pure edit builders and the runList* wrappers dispatch them; getSelectedLines,
// findEditableListBlockAtLine, isInsideCodeBlock etc. are their supporting math.
//
// Styling: this plugin emits stable `mbox-*` classes; the visual styling lives in
// consumer CSS (src/styles.css for the demos). Unlike code-block/table, list DOES
// ship a plugin `theme` (below) — but only the structural CSS the mechanism itself
// needs: the hanging-indent flex layout and the fixed-width bullet slot.
import { EditorSelection, type ChangeSpec, type EditorState, type SelectionRange } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import { createContentMarkSpec, type MboxDecorationSpec, type MboxPlugin, type MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxBlock, MboxDocument, MboxListItemBlock, MboxTaskListItemBlock } from "./types.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

const listSyntaxHideClassName = "mbox-list-syntax-hide";
const listUnfocusedLineClassName = "mbox-list-unfocused-line";
const listFocusedLineClassName = "mbox-list-focused-line";
const listFocusedSyntaxClassName = "mbox-list-focused-syntax";
const listIndentClassName = "mbox-list-indent";
const listContentClassName = "mbox-list-content";
const listBulletGlyphSlotWidth = "1ch";
export const listClassNames = {
  ul: "mbox-ul",
};

type EditableListBlock = MboxListItemBlock | MboxTaskListItemBlock;

class ListFocusedSyntaxWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = listFocusedSyntaxClassName;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

interface ListEditResult {
  changes: ChangeSpec[];
  selection: number;
}

interface ListIndentResult {
  changes: ChangeSpec[];
  selection?: number;
}

function createListUnfocusedLineSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "listItem" && !activeLines.has(block.line)
      ? [
          {
            type: "line",
            from: block.from,
            to: block.from,
            className: `${className} ${listClassNames.ul}`,
          },
          ...(block.from < block.marker.from
            ? [
                {
                  type: "mark" as const,
                  from: block.from,
                  to: block.marker.from,
                  className: listIndentClassName,
                },
              ]
            : []),
          ...createContentMarkSpec(block.content.from, block.content.to, listContentClassName),
        ]
      : [],
  );
}

function createListSyntaxHideSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "listItem" && !activeLines.has(block.line) ? [{ ...block.syntax, className }] : [],
  );
}

function createListFocusedLineSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "listItem" && activeLines.has(block.line)
      ? [
          {
            type: "line",
            from: block.from,
            to: block.from,
            className,
            attributes: {
              style: `--mbox-list-focused-marker-width: ${block.content.from - block.from}ch; --mbox-list-focused-marker-offset: ${
                block.marker.from - block.from
              }ch`,
            },
          },
        ]
      : [],
  );
}

function createListFocusedSyntaxSpecs(document: MboxDocument, activeLines: MboxActiveLineNumbers): MboxDecorationSpec[] {
  return document.blocks.flatMap((block) =>
    block.type === "listItem" && activeLines.has(block.line)
      ? [
          {
            type: "replace",
            from: block.from,
            to: block.content.from,
            widget: new ListFocusedSyntaxWidget(),
          },
        ]
      : [],
  );
}

function createListEnterEdit(state: EditorState): ListEditResult | null {
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) {
    return null;
  }
  const document = getMboxDocumentFromState(state);
  if (isInsideCodeBlock(state, document, line.number)) {
    return null;
  }

  const emptyListMatch = /^(\s*)-\s*$/.exec(line.text);
  if (emptyListMatch) {
    return {
      changes: [{ from: line.from, to: line.to, insert: "\n" }],
      selection: line.from + 1,
    };
  }

  const block = findEditableListBlockAtLine(document, line.number);
  if (!block || block.content.from === block.content.to) {
    return null;
  }

  const marker = `${" ".repeat(block.depth)}${block.type === "taskListItem" ? "- [ ] " : "- "}`;
  return {
    changes: [{ from: range.head, insert: `\n${marker}` }],
    selection: range.head + marker.length + 1,
  };
}

function createListIndentEdit(state: EditorState, direction: "indent" | "outdent"): ListIndentResult | null {
  const document = getMboxDocumentFromState(state);
  const selectedLines = getSelectedLines(state);
  const changes: ChangeSpec[] = [];
  let selection: number | undefined;

  for (const lineNumber of selectedLines) {
    const line = state.doc.line(lineNumber);
    const block = findEditableListBlockAtLine(document, lineNumber);

    if (direction === "indent") {
      if (block) {
        changes.push({ from: line.from, insert: " " });
      } else if (!isInsideCodeBlock(state, document, lineNumber)) {
        const marker = line.text.trim().length > 0 ? " - " : "- ";
        changes.push({ from: line.from, insert: marker });
        if (line.text.length === 0 && state.selection.ranges.length === 1 && state.selection.main.empty) {
          selection = line.from + marker.length;
        }
      }
      continue;
    }

    if (!block) {
      continue;
    }

    if (block.depth > 0) {
      changes.push({ from: line.from, to: line.from + 1, insert: "" });
    } else {
      changes.push({ from: line.from, to: block.content.from, insert: "" });
    }
  }

  return changes.length > 0 ? { changes, selection } : null;
}

function createListDeleteBackwardEdit(state: EditorState): ListEditResult | null {
  return createListContentStartOutdentEdit(state) ?? createListSyntaxDeleteEdit(state) ?? createEmptyListMarkerOutdentEdit(state);
}

function createListDeleteForwardEdit(state: EditorState): ListEditResult | null {
  return createListSyntaxDeleteEdit(state) ?? createEmptyListMarkerOutdentEdit(state);
}

function createListContentStartOutdentEdit(state: EditorState): ListEditResult | null {
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  const document = getMboxDocumentFromState(state);
  if (isInsideCodeBlock(state, document, line.number)) {
    return null;
  }

  const block = findEditableListBlockAtLine(document, line.number);
  if (!block || block.type !== "listItem" || range.head !== block.content.from) {
    return null;
  }

  if (block.depth > 0) {
    return {
      changes: [{ from: line.from, to: line.from + 1, insert: "" }],
      selection: range.head - 1,
    };
  }

  return {
    changes: [{ from: line.from, to: block.content.from, insert: "" }],
    selection: line.from,
  };
}

function createListSyntaxDeleteEdit(state: EditorState): ListEditResult | null {
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  const document = getMboxDocumentFromState(state);
  if (isInsideCodeBlock(state, document, line.number)) {
    return null;
  }

  const block = findEditableListBlockAtLine(document, line.number);
  if (!block || block.type !== "listItem" || block.depth <= 0) {
    return null;
  }

  if (range.head <= block.from || range.head > block.marker.from) {
    return null;
  }

  return {
    changes: [{ from: range.head - 1, to: range.head, insert: "" }],
    selection: range.head - 1,
  };
}

function createEmptyListMarkerOutdentEdit(state: EditorState): ListEditResult | null {
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  const document = getMboxDocumentFromState(state);
  if (isInsideCodeBlock(state, document, line.number)) {
    return null;
  }

  const block = findEditableListBlockAtLine(document, line.number);
  if (!block || block.type !== "listItem" || block.content.from !== block.content.to || range.head !== block.content.from) {
    return null;
  }

  if (block.depth > 0) {
    return {
      changes: [{ from: line.from, to: line.from + 1, insert: "" }],
      selection: range.head - 1,
    };
  }

  return {
    changes: [{ from: line.from, to: block.content.from, insert: "" }],
    selection: line.from,
  };
}

function createListSpaceEdit(state: EditorState): ListEditResult | null {
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) {
    return null;
  }

  const line = state.doc.lineAt(range.head);
  const document = getMboxDocumentFromState(state);
  if (isInsideCodeBlock(state, document, line.number)) {
    return null;
  }

  const block = findEditableListBlockAtLine(document, line.number);
  if (block?.type === "listItem" && block.content.from === block.content.to && range.head === block.content.from) {
    return {
      changes: [{ from: line.from, insert: " " }],
      selection: range.head + 1,
    };
  }

  return null;
}

function createListLineStartEdit(state: EditorState): number | null {
  const document = getMboxDocumentFromState(state);
  let touchedList = false;

  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => {
      const line = state.doc.lineAt(range.head);
      const block = findEditableListBlockAtLine(document, line.number);
      if (!block || block.type !== "listItem") {
        return EditorSelection.cursor(range.head);
      }

      touchedList = true;
      return EditorSelection.cursor(block.content.from);
    }),
    state.selection.mainIndex,
  );

  if (!touchedList || selection.eq(state.selection)) {
    return null;
  }

  return selection.main.head;
}

export function runListEnter(view: EditorView): boolean {
  const edit = createListEnterEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection },
  });
  return true;
}

export function runListIndent(view: EditorView): boolean {
  const edit = createListIndentEdit(view.state, "indent");
  if (!edit) {
    return false;
  }

  view.dispatch({
    changes: edit.changes,
    selection: edit.selection == null ? undefined : { anchor: edit.selection },
  });
  return true;
}

export function runListOutdent(view: EditorView): boolean {
  const edit = createListIndentEdit(view.state, "outdent");
  if (!edit) {
    return false;
  }

  view.dispatch({ changes: edit.changes });
  return true;
}

export function runListDeleteBackward(view: EditorView): boolean {
  const edit = createListDeleteBackwardEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection },
  });
  return true;
}

export function runListDeleteForward(view: EditorView): boolean {
  const edit = createListDeleteForwardEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection },
  });
  return true;
}

export function runListSpace(view: EditorView): boolean {
  const edit = createListSpaceEdit(view.state);
  if (!edit) {
    return false;
  }

  view.dispatch({
    changes: edit.changes,
    selection: { anchor: edit.selection },
  });
  return true;
}

export function runListLineStart(view: EditorView): boolean {
  const selection = createListLineStartEdit(view.state);
  if (selection == null) {
    return false;
  }

  view.dispatch({
    selection: { anchor: selection },
    scrollIntoView: true,
  });
  return true;
}

function getSelectedLines(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(selectionLineEnd(range));
    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }

  return [...lines].sort((a, b) => a - b);
}

function selectionLineEnd(range: SelectionRange): number {
  return range.empty ? range.to : Math.max(range.from, range.to - 1);
}

function findEditableListBlockAtLine(document: MboxDocument, lineNumber: number): EditableListBlock | null {
  return (
    document.blocks.find(
      (block): block is EditableListBlock =>
        (block.type === "listItem" || block.type === "taskListItem") && block.line === lineNumber,
    ) ?? null
  );
}

function isInsideCodeBlock(state: EditorState, document: MboxDocument, lineNumber: number): boolean {
  return document.blocks.some((block: MboxBlock) => {
    if (block.type !== "codeBlock") {
      return false;
    }

    const fromLine = state.doc.lineAt(block.from).number;
    const toLine = state.doc.lineAt(block.to).number;
    return fromLine <= lineNumber && lineNumber <= toLine;
  });
}

export function listPlugin(): MboxPlugin {
  return {
    theme: {
      [`.${listFocusedLineClassName}`]: {
        boxSizing: "border-box",
        paddingLeft: "calc(6px + var(--mbox-list-focused-marker-width))",
        textIndent: "calc(-1 * var(--mbox-list-focused-marker-width))",
      },
      [`.${listFocusedSyntaxClassName}`]: {
        display: "inline-block",
        flexShrink: "0",
        height: "0.6em",
        position: "relative",
        verticalAlign: "baseline",
        whiteSpace: "pre",
        width: "var(--mbox-list-focused-marker-width)",
      },
      [`.${listFocusedSyntaxClassName}::after`]: {
        content: '""',
        position: "absolute",
        left: "var(--mbox-list-focused-marker-offset)",
        top: "calc(50% - 1px)",
        width: listBulletGlyphSlotWidth,
        height: "2px",
        borderRadius: "999px",
        background: "var(--mbox-list-marker-color, #222)",
        pointerEvents: "none",
      },
      [`.${listUnfocusedLineClassName}`]: {
        alignItems: "start",
        display: "flex",
      },
      [`.${listIndentClassName}`]: {
        flexShrink: "0",
        whiteSpace: "pre",
      },
      [`.${listContentClassName}`]: {
        display: "block",
        minWidth: "0",
        overflowWrap: "anywhere",
      },
      [`.${listSyntaxHideClassName}`]: {
        flexShrink: "0",
        position: "relative",
        visibility: "hidden",
        whiteSpace: "pre",
      },
      [`.${listSyntaxHideClassName}::after`]: {
        content: '""',
        position: "absolute",
        left: "0",
        top: "0",
        width: listBulletGlyphSlotWidth,
        height: "100%",
        clipPath: "circle(0.2em at center)",
        background: "var(--mbox-list-bullet-color, #222)",
        pointerEvents: "none",
        visibility: "visible",
      },
    },
    keymap: [
      { key: "Enter", run: runListEnter },
      { key: "Tab", run: runListIndent },
      { key: "Shift-Tab", run: runListOutdent },
      { key: "Backspace", run: runListDeleteBackward },
      { key: "Ctrl-h", run: runListDeleteBackward },
      { key: "Ctrl-a", run: runListLineStart },
      { key: "Delete", run: runListDeleteForward },
      { key: "Space", run: runListSpace },
    ],
    name: "mbox/list",
    decorations: (context) => {
      const document = getMboxDocumentFromState(context.state);
      return [
        ...createListFocusedLineSpecs(document, context.activeLineNumbers, listFocusedLineClassName),
        ...createListFocusedSyntaxSpecs(document, context.activeLineNumbers),
        ...createListUnfocusedLineSpecs(document, context.activeLineNumbers, listUnfocusedLineClassName),
        ...createListSyntaxHideSpecs(document, context.activeLineNumbers, listSyntaxHideClassName),
      ];
    },
  };
}
