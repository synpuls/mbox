import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { keymap, WidgetType } from "@codemirror/view";
import { createEditorState } from "./create-editor.js";
import { mboxPlugins } from "../plugins/mbox/default.js";
import { getMboxDocumentFromState } from "../plugins/mbox/parser-cache.js";
import {
  createMboxDecorationSet,
  createMboxDecorationSetSafe,
  createMboxDecorationSetStrict,
  createMboxExtension,
  createMarkSpec,
  createReplaceSpec,
  createWidgetSpec,
  mboxDecorationProviders,
} from "./plugin.js";
import type { MboxDecorationSpec } from "./plugin.js";
import { createTestContext } from "./test-context.js";

describe("createMboxExtension", () => {
  it("adds no plugin-provided behavior when plugins are omitted", () => {
    const state = createEditorState({
      extensions: [createMboxExtension()],
    });

    expect(state.facet(EditorState.readOnly)).toBe(false);
  });

  it("adds plain-value plugin hooks without thunk indirection", () => {
    const command = () => true;
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              extensions: [EditorState.readOnly.of(true)],
              keymap: [{ key: "Mod-b", run: command }],
              theme: { ".cm-line": { color: "red" } },
              decorations: () => [{ from: 0, to: 1, className: "mbox-plain-hook" }],
            },
          ],
        }),
      ],
    });

    expect(state.facet(EditorState.readOnly)).toBe(true);
    expect(state.facet(keymap).flat()).toContainEqual({ key: "Mod-b", run: command });
  });

  it("removes plugin-provided behavior when the plugin is omitted", () => {
    const withPlugin = createEditorState({
      extensions: [
        createMboxExtension({
          plugins: [
            {
              extensions: [EditorState.readOnly.of(true)],
            },
          ],
        }),
      ],
    });
    const withoutPlugin = createEditorState({
      extensions: [createMboxExtension()],
    });

    expect(withPlugin.facet(EditorState.readOnly)).toBe(true);
    expect(withoutPlugin.facet(EditorState.readOnly)).toBe(false);
  });

  it("caches the changed document content after text changes", () => {
    const state = createEditorState({
      doc: "# before",
      extensions: [createMboxExtension()],
    });
    const nextState = state.update({ changes: { from: 0, to: state.doc.length, insert: "```ts\nconst x = 1\n```" } }).state;

    expect(getMboxDocumentFromState(nextState).blocks[0]?.type).toBe("codeBlock");
  });

  it("keeps default block syntax available after text changes", () => {
    const state = createEditorState({
      doc: "- item\n# Heading",
      extensions: [createMboxExtension({ plugins: mboxPlugins() })],
    });
    const nextState = state.update({
      changes: {
        from: 0,
        to: state.doc.length,
        insert: "```ts\nconst x = 1\n```\n| A | B |\n| --- | --- |\n| 1 | 2 |",
      },
    }).state;

    expect(getMboxDocumentFromState(nextState).blocks.map((block) => block.type)).toEqual(["codeBlock", "table"]);
  });

  it("connects plugin keymaps as a CodeMirror keymap extension", () => {
    const command = () => true;
    const state = createEditorState({
      extensions: [
        createMboxExtension({
          plugins: [
            {
              keymap: [{ key: "Mod-b", run: command }],
            },
          ],
        }),
      ],
    });

    expect(state.facet(keymap).flat()).toContainEqual({ key: "Mod-b", run: command });
  });

  it("creates a decoration provider context with exactly editor state and active line numbers", () => {
    const context = createTestContext("# Heading\nplain");

    expect(context.state.doc.toString()).toBe("# Heading\nplain");
    expect([...context.activeLineNumbers]).toEqual([]);
    expect(Object.keys(context).sort()).toEqual(["activeLineNumbers", "state"]);
  });

  it("stores active line numbers as a Set on the decoration context", () => {
    const context = createTestContext("# Heading");

    expect(context.activeLineNumbers).toBeInstanceOf(Set);
    expect([...context.activeLineNumbers]).toEqual([]);
  });

  it("uses one active line number Set within the same decoration context", () => {
    const context = createTestContext("# Heading");

    expect(context.activeLineNumbers).toBe(context.activeLineNumbers);
  });

  it("aggregates plugin context decoration providers", () => {
    const provider = () => [{ from: 0, to: 1, className: "mbox-test-context" }];
    const state = createEditorState({
      extensions: [
        createMboxExtension({
          plugins: [
            {
              name: "test/context",
              decorations: provider,
            },
          ],
        }),
      ],
    });

    expect(state.facet(mboxDecorationProviders)).toEqual([{ provider, pluginName: "test/context", pluginIndex: 0 }]);
  });

});

describe("createMboxDecorationSet", () => {
  it("lowers a well-formed spec array to a sorted DecorationSet", () => {
    const state = EditorState.create({ doc: "abc" });
    const decorationSet = createMboxDecorationSet(state, [
      { type: "mark", from: 1, to: 2, className: "x" },
    ]);

    expect(decorationSet.size).toBe(1);
  });

  // This is the whole point of the function: a spec that violates a real
  // CodeMirror constraint must throw here exactly as it would in a live
  // EditorView, so a unit test running specs through this function catches
  // what asserting on the raw spec array alone cannot (see table-kit's empty
  // table cell, which crashed a real EditorView while createTestContext-based
  // assertions saw nothing wrong).
  it("throws for an empty mark range, matching what a real EditorView does", () => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSet(state, [{ type: "mark", from: 1, to: 1, className: "x" }])).toThrow(
      /empty/i,
    );
  });
});

describe("createReplaceSpec", () => {
  class TestWidget extends WidgetType {
    toDOM(): HTMLElement {
      return document.createElement("span");
    }
  }

  it("builds a replace spec for a non-empty range", () => {
    const widget = new TestWidget();

    expect(createReplaceSpec(0, 2, widget)).toEqual([{ type: "replace", from: 0, to: 2, widget }]);
  });

  it("falls back to a point widget spec when the range is empty and a widget is given", () => {
    const widget = new TestWidget();

    expect(createReplaceSpec(3, 3, widget)).toEqual([{ type: "widget", from: 3, to: 3, widget }]);
  });

  it("drops the spec entirely when the range is empty and no widget is given", () => {
    expect(createReplaceSpec(3, 3)).toEqual([]);
  });
});

describe("createMarkSpec", () => {
  it("builds a mark spec for a non-empty range", () => {
    expect(createMarkSpec(0, 2, "mbox-test-mark")).toEqual([
      { type: "mark", from: 0, to: 2, className: "mbox-test-mark" },
    ]);
  });

  it("carries optional attributes", () => {
    expect(createMarkSpec(0, 2, "mbox-test-mark", { style: "color: red" })).toEqual([
      { type: "mark", from: 0, to: 2, className: "mbox-test-mark", attributes: { style: "color: red" } },
    ]);
  });

  it("carries optional inclusiveStart/inclusiveEnd", () => {
    expect(createMarkSpec(0, 2, "mbox-test-mark", undefined, true, true)).toEqual([
      { type: "mark", from: 0, to: 2, className: "mbox-test-mark", inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("drops the spec entirely when the range is empty", () => {
    expect(createMarkSpec(3, 3, "mbox-test-mark")).toEqual([]);
  });
});

describe("createWidgetSpec", () => {
  it("builds a widget spec at a point position", () => {
    class TestWidget extends WidgetType {
      toDOM(): HTMLElement {
        return document.createElement("span");
      }
    }
    const widget = new TestWidget();

    expect(createWidgetSpec(3, widget)).toEqual([{ type: "widget", from: 3, to: 3, widget }]);
  });

  it("carries an optional side", () => {
    class TestWidget extends WidgetType {
      toDOM(): HTMLElement {
        return document.createElement("span");
      }
    }
    const widget = new TestWidget();

    expect(createWidgetSpec(3, widget, -1)).toEqual([{ type: "widget", from: 3, to: 3, widget, side: -1 }]);
  });
});

describe("createMboxDecorationSetStrict", () => {
  it("is the same function as the deprecated createMboxDecorationSet name (backward compat)", () => {
    expect(createMboxDecorationSet).toBe(createMboxDecorationSetStrict);
  });
});

describe("createMboxDecorationSetSafe", () => {
  it("keeps the valid specs when one spec in the array is broken", () => {
    const state = EditorState.create({ doc: "abc" });

    const decorationSet = createMboxDecorationSetSafe(state, [
      { type: "mark", from: 0, to: 1, className: "good-one" },
      { type: "mark", from: 1, to: 1, className: "broken" },
      { type: "mark", from: 2, to: 3, className: "good-two" },
    ]);

    expect(decorationSet.size).toBe(2);
  });

  it("matches createMboxDecorationSet's output when every spec is well-formed", () => {
    const state = EditorState.create({ doc: "abc" });
    const specs: MboxDecorationSpec[] = [
      { type: "mark", from: 0, to: 1, className: "a" },
      { type: "mark", from: 1, to: 2, className: "b" },
    ];

    const safeSet = createMboxDecorationSetSafe(state, specs);
    const strictSet = createMboxDecorationSet(state, specs);

    expect(safeSet.size).toBe(strictSet.size);
  });

  it("reports the broken spec through onDecorationError, once per broken spec", () => {
    const state = EditorState.create({ doc: "abc" });
    const brokenSpec: MboxDecorationSpec = { type: "mark", from: 1, to: 1, className: "broken" };
    const onDecorationError = vi.fn();

    createMboxDecorationSetSafe(
      state,
      [{ type: "mark", from: 0, to: 1, className: "good-one" }, brokenSpec],
      onDecorationError,
    );

    expect(onDecorationError).toHaveBeenCalledTimes(1);
    expect(onDecorationError).toHaveBeenCalledWith({
      phase: "lowering",
      error: expect.any(Error),
      spec: brokenSpec,
    });
  });
});
