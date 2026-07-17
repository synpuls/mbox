import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { Decoration, keymap, WidgetType } from "@codemirror/view";
import { createEditorState } from "./create-editor.js";
import { mboxPlugins } from "../plugins/mbox/default.js";
import { getMboxDocumentFromState } from "../plugins/mbox/parser-cache.js";
import {
  createMboxDecorationSetSafe,
  createMboxDecorationSetStrict,
  createMboxExtension,
  createContentMarkSpec,
  mboxDecorationProviders,
} from "./plugin.js";
import type { MboxDecorationSpec, MboxLineDecorationSpec, MboxWidgetDecorationSpec } from "./plugin.js";
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

describe("createMboxDecorationSetStrict", () => {
  it("lowers a well-formed spec array to a sorted DecorationSet", () => {
    const state = EditorState.create({ doc: "abc" });
    const decorationSet = createMboxDecorationSetStrict(state, [
      { type: "mark", from: 1, to: 2, className: "x" },
    ]);

    expect(decorationSet.size).toBe(1);
  });

  it("drops empty mark and widget-less replace ranges", () => {
    const state = EditorState.create({ doc: "abc" });

    expect(createMboxDecorationSetStrict(state, [
      { type: "mark", from: 1, to: 1, className: "empty-mark" },
      { type: "replace", from: 2, to: 2 },
    ]).size).toBe(0);
  });

  it("promotes an empty replace range with a widget to a point widget", () => {
    const state = EditorState.create({ doc: "abc" });
    const widget = new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })();

    expect(createMboxDecorationSetStrict(state, [{ type: "replace", from: 1, to: 1, widget }]).size).toBe(1);
  });

  it.each<MboxDecorationSpec>([
    { type: "mark", from: 2, to: 1, className: "backwards-mark" },
    { type: "replace", from: 2, to: 1 },
    { type: "lineRange", from: 2, to: 1, className: "backwards-line-range" },
  ])("throws for a reverse-ordered $type range", (spec) => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSetStrict(state, [spec])).toThrow(/from.*to|empty/i);
  });

  it("keeps an empty line range as one line with both boundary classes", () => {
    const state = EditorState.create({ doc: "abc" });
    const decorations = createMboxDecorationSetStrict(state, [{ type: "lineRange", from: 1, to: 1, className: "range" }]);
    const classes: string[] = [];

    decorations.between(0, state.doc.length, (_from, _to, value) => {
      classes.push(value.spec.class);
    });

    expect(classes).toEqual(["range range-first range-last"]);
  });

  it.each<MboxDecorationSpec>([
    { type: "mark", from: -1, to: 1, className: "negative-mark" },
    { type: "replace", from: 0, to: 4 },
    { type: "widget", from: 4, widget: new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })() },
  ])("rejects an out-of-bounds $type position through the decoration position validator", (spec) => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSetStrict(state, [spec])).toThrow(/Invalid decoration position .*: expected an integer from 0 to 3/);
  });

  it.each<MboxDecorationSpec>([
    { type: "line", from: 4, className: "out-of-bounds-line" },
    { type: "lineRange", from: 0, to: 4, className: "out-of-bounds-line-range" },
  ])("rejects an out-of-bounds $type position before resolving its line", (spec) => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSetStrict(state, [spec])).toThrow("Invalid decoration position 4: expected an integer from 0 to 3");
  });

  it.each<[string, MboxDecorationSpec]>([
    ["an implicit mark's from", { from: Number.NaN, to: 1, className: "implicit-mark" }],
    ["a mark's to", { type: "mark", from: 1, to: Number.NaN, className: "mark" }],
    ["a replace's from", { type: "replace", from: Number.NaN, to: 1 }],
    ["a replace's to", { type: "replace", from: 1, to: Number.NaN }],
    ["a widget's from", { type: "widget", from: Number.NaN, widget: new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })() }],
    ["a line's from", { type: "line", from: Number.NaN, className: "line" }],
    ["a line range's from", { type: "lineRange", from: Number.NaN, to: 1, className: "line-range" }],
    ["a line range's to", { type: "lineRange", from: 1, to: Number.NaN, className: "line-range" }],
  ])("rejects NaN in $0 through the decoration position validator", (_description, spec) => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSetStrict(state, [spec])).toThrowError(
      new RangeError("Invalid decoration position NaN: expected an integer from 0 to 3"),
    );
  });

  it.each<[string, MboxDecorationSpec]>([
    ["mark", { type: "mark", from: 0.5, to: 1, className: "mark" }],
    ["replace", { type: "replace", from: 0.5, to: 1 }],
    ["widget", { type: "widget", from: 0.5, widget: new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })() }],
    ["line", { type: "line", from: 0.5, className: "line" }],
    ["line range", { type: "lineRange", from: 0.5, to: 1, className: "line-range" }],
    ["positive infinity", { type: "mark", from: Number.POSITIVE_INFINITY, to: 1, className: "infinity" }],
    ["negative infinity", { type: "mark", from: Number.NEGATIVE_INFINITY, to: 1, className: "negative-infinity" }],
  ])("rejects non-integer $0 positions through the decoration position validator", (_description, spec) => {
    const state = EditorState.create({ doc: "abc" });

    expect(() => createMboxDecorationSetStrict(state, [spec])).toThrowError(
      expect.objectContaining({
        name: "RangeError",
        message: expect.stringMatching(/^Invalid decoration position .*: expected an integer from 0 to 3$/),
      }),
    );
  });
});

describe("createContentMarkSpec", () => {
  it("creates one inclusive mark spec", () => {
    expect(createContentMarkSpec(1, 2, "x")).toEqual({
      type: "mark", from: 1, to: 2, className: "x", inclusiveStart: true, inclusiveEnd: true,
    });
  });

  it("keeps an empty range for lowering to handle", () => {
    expect(createContentMarkSpec(1, 1, "x")).toEqual({
      type: "mark", from: 1, to: 1, className: "x", inclusiveStart: true, inclusiveEnd: true,
    });
  });
});

describe("point decoration specs", () => {
  it("do not expose an unused to offset", () => {
    const line: MboxLineDecorationSpec = {
      type: "line", from: 0, className: "line",
      // @ts-expect-error -- line decorations are positioned by from only
      to: 0,
    };
    const widget: MboxWidgetDecorationSpec = {
      type: "widget", from: 0, widget: new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })(),
      // @ts-expect-error -- widget decorations are positioned by from only
      to: 0,
    };
    void line;
    void widget;
  });

  it("lowers a widget using its from offset", () => {
    const state = EditorState.create({ doc: "abc" });
    const widget = new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })();

    expect(createMboxDecorationSetStrict(state, [{ type: "widget", from: 1, widget }]).size).toBe(1);
  });

  it("allows a fractional widget side because it is ordering metadata, not a document position", () => {
    const state = EditorState.create({ doc: "abc" });
    const widget = new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })();

    expect(createMboxDecorationSetStrict(state, [{ type: "widget", from: 1, widget, side: 0.5 }]).size).toBe(1);
  });
});

describe("createMboxDecorationSetSafe", () => {
  it("keeps the valid specs when one spec in the array is reverse ordered", () => {
    const state = EditorState.create({ doc: "abc" });
    const onDecorationError = vi.fn();
    const brokenSpec: MboxDecorationSpec = { type: "mark", from: 2, to: 1, className: "broken" };

    const decorationSet = createMboxDecorationSetSafe(state, [
      { type: "mark", from: 0, to: 1, className: "good-one" },
      brokenSpec,
      { type: "mark", from: 2, to: 3, className: "good-two" },
    ], onDecorationError);

    expect(decorationSet.size).toBe(2);
    expect(onDecorationError).toHaveBeenCalledWith({ phase: "lowering", error: expect.any(Error), spec: brokenSpec });
  });

  it("matches createMboxDecorationSetStrict's output when every spec is well-formed", () => {
    const state = EditorState.create({ doc: "abc" });
    const specs: MboxDecorationSpec[] = [
      { type: "mark", from: 0, to: 1, className: "a" },
      { type: "mark", from: 1, to: 2, className: "b" },
    ];

    const safeSet = createMboxDecorationSetSafe(state, specs);
    const strictSet = createMboxDecorationSetStrict(state, specs);

    expect(safeSet.size).toBe(strictSet.size);
  });

  it("drops normalized empty ranges without reporting an error", () => {
    const state = EditorState.create({ doc: "abc" });
    const onDecorationError = vi.fn();

    const decorations = createMboxDecorationSetSafe(
      state,
      [
        { type: "mark", from: 1, to: 1, className: "empty-mark" },
        { type: "replace", from: 2, to: 2 },
        { type: "replace", from: 3, to: 3, widget: new (class extends WidgetType { toDOM(): HTMLElement { return document.createElement("span"); } })() },
      ],
      onDecorationError,
    );

    expect(decorations.size).toBe(1);
    expect(onDecorationError).not.toHaveBeenCalled();
  });

  it("drops an out-of-bounds spec locally and reports it", () => {
    const state = EditorState.create({ doc: "abc" });
    const brokenSpec: MboxDecorationSpec = { type: "replace", from: 0, to: 4 };
    const onDecorationError = vi.fn();

    const decorations = createMboxDecorationSetSafe(state, [
      { type: "mark", from: 0, to: 1, className: "good-one" }, brokenSpec, { type: "mark", from: 2, to: 3, className: "good-two" },
    ], onDecorationError);

    expect(decorations.size).toBe(2);
    expect(onDecorationError).toHaveBeenCalledWith({ phase: "lowering", error: expect.any(Error), spec: brokenSpec });
  });

  it("drops a NaN mark locally through the decoration position validator", () => {
    const state = EditorState.create({ doc: "abc" });
    const brokenSpec: MboxDecorationSpec = { type: "mark", from: Number.NaN, to: 1, className: "broken" };
    const onDecorationError = vi.fn();

    expect(() => {
      const decorations = createMboxDecorationSetSafe(state, [
        brokenSpec,
        { type: "mark", from: 1, to: 2, className: "good" },
      ], onDecorationError);
      expect(decorations.size).toBe(1);
    }).not.toThrow();
    expect(onDecorationError).toHaveBeenCalledTimes(1);
    expect(onDecorationError).toHaveBeenCalledWith({
      phase: "lowering",
      error: expect.objectContaining({
        name: "RangeError",
        message: "Invalid decoration position NaN: expected an integer from 0 to 3",
      }),
      spec: brokenSpec,
    });
  });

  it.each<MboxDecorationSpec>([
    { type: "line", from: Number.NaN, className: "broken-line" },
    { type: "lineRange", from: 0, to: Number.NaN, className: "broken-line-range" },
  ])("drops a NaN $type locally through the decoration position validator", (brokenSpec) => {
    const state = EditorState.create({ doc: "abc" });
    const onDecorationError = vi.fn();

    const decorations = createMboxDecorationSetSafe(state, [
      brokenSpec,
      { type: "mark", from: 1, to: 2, className: "good" },
    ], onDecorationError);

    expect(decorations.size).toBe(1);
    expect(onDecorationError).toHaveBeenCalledWith(expect.objectContaining({
      phase: "lowering",
      error: expect.objectContaining({
        name: "RangeError",
        message: "Invalid decoration position NaN: expected an integer from 0 to 3",
      }),
      spec: brokenSpec,
    }));
  });

  it("contains a final Decoration.set failure and reports it without spec provenance", () => {
    const state = EditorState.create({ doc: "abc" });
    const onDecorationError = vi.fn();
    const failure = new Error("Decoration.set failed");
    const set = vi.spyOn(Decoration, "set").mockImplementationOnce(() => { throw failure; });

    try {
      const decorations = createMboxDecorationSetSafe(state, [{ type: "mark", from: 0, to: 1, className: "good" }], onDecorationError);

      expect(decorations.size).toBe(0);
      expect(set).toHaveBeenCalledTimes(1);
      expect(onDecorationError).toHaveBeenCalledTimes(1);
      expect(onDecorationError).toHaveBeenCalledWith({ phase: "lowering", error: failure });
    } finally {
      set.mockRestore();
    }
  });

  it("leaves Decoration.set failures visible on the strict path", () => {
    const state = EditorState.create({ doc: "abc" });
    const failure = new Error("Decoration.set failed");
    const set = vi.spyOn(Decoration, "set").mockImplementationOnce(() => { throw failure; });

    try {
      expect(() => createMboxDecorationSetStrict(state, [{ type: "mark", from: 0, to: 1, className: "good" }])).toThrow(failure);
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      set.mockRestore();
    }
  });
});
