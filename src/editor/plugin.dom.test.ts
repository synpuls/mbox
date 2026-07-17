import { describe, expect, it, vi } from "vitest";
import { EditorState, Prec } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import { createEditorState, createEditorView } from "./create-editor.js";
import { createMboxExtension, mboxDecorationProviders } from "./plugin.js";
import type { MboxDecorationContext } from "./plugin.js";

function withEditorView<T>(state: EditorState, run: (context: { parent: HTMLElement; view: EditorView }) => T): T {
  const parent = document.createElement("div");
  const view = createEditorView({ parent, state });

  try {
    return run({ parent, view });
  } finally {
    view.destroy();
  }
}

describe("createMboxExtension", () => {
  it("reports a named provider failure with its original plugin position", () => {
    const error = new Error("provider failed");
    const onDecorationError = vi.fn();
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          onDecorationError,
          plugins: [{ name: "test/broken", decorations: () => { throw error; } }],
        }),
      ],
    });

    withEditorView(state, () => {
      expect(onDecorationError).toHaveBeenCalledWith({ phase: "provider", error, pluginName: "test/broken", pluginIndex: 0 });
    });
  });

  it("reports a named lowering failure while retaining that provider's valid specs", () => {
    const onDecorationError = vi.fn();
    const brokenSpec = { type: "mark" as const, from: 2, to: 1, className: "broken" };
    const state = createEditorState({
      doc: "abc",
      extensions: [createMboxExtension({
        onDecorationError,
        plugins: [{ name: "test/mixed", decorations: () => [
          { from: 0, to: 1, className: "good-first" }, brokenSpec, { from: 2, to: 3, className: "good-last" },
        ] }],
      })],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".good-first")?.textContent).toBe("a");
      expect(parent.querySelector(".good-last")?.textContent).toBe("c");
      expect(onDecorationError).toHaveBeenCalledTimes(1);
      expect(onDecorationError).toHaveBeenCalledWith({
        phase: "lowering", error: expect.any(Error), spec: brokenSpec, pluginName: "test/mixed", pluginIndex: 0,
      });
    });
  });

  it("contains a NaN provider spec while rendering a healthy provider through the live facet", () => {
    const onDecorationError = vi.fn();
    const brokenSpec = { type: "mark" as const, from: Number.NaN, to: 1, className: "broken" };
    const state = createEditorState({
      doc: "abc",
      extensions: [createMboxExtension({
        onDecorationError,
        plugins: [
          { name: "test/nan", decorations: () => [brokenSpec] },
          { name: "test/healthy", decorations: () => [{ type: "mark", from: 1, to: 2, className: "healthy" }] },
        ],
      })],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".healthy")?.textContent).toBe("b");
      expect(onDecorationError).toHaveBeenCalledTimes(1);
      expect(onDecorationError).toHaveBeenCalledWith({
        phase: "lowering",
        error: expect.objectContaining({
          name: "RangeError",
          message: "Invalid decoration position NaN: expected an integer from 0 to 3",
        }),
        spec: brokenSpec,
        pluginName: "test/nan",
        pluginIndex: 0,
      });
    });
  });

  it("contains throwing error handlers while continuing to render and report lowering failures", () => {
    const reported: unknown[] = [];
    const brokenSpec = { type: "mark" as const, from: 2, to: 1, className: "broken" };
    const state = createEditorState({
      doc: "abc",
      extensions: [
        createMboxExtension({
          onDecorationError: () => {
            throw new Error("reporter failed");
          },
          plugins: [
            {
              name: "test/mixed",
              decorations: () => [
                { from: 0, to: 1, className: "good-before" },
                brokenSpec,
                { from: 1, to: 2, className: "good-after" },
              ],
            },
            { name: "test/following", decorations: () => [{ from: 2, to: 3, className: "following-provider" }] },
          ],
        }),
        createMboxExtension({ onDecorationError: (error) => reported.push(error) }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".good-before")?.textContent).toBe("a");
      expect(parent.querySelector(".good-after")?.textContent).toBe("b");
      expect(parent.querySelector(".following-provider")?.textContent).toBe("c");
      expect(reported).toEqual([
        expect.objectContaining({ phase: "lowering", spec: brokenSpec, pluginName: "test/mixed", pluginIndex: 0 }),
      ]);
    });
  });

  it("keeps healthy providers rendering when another provider throws", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [createMboxExtension({
        plugins: [
          { name: "test/broken", decorations: () => { throw new Error("broken"); } },
          { name: "test/healthy", decorations: () => [{ from: 0, to: 2, className: "healthy" }] },
        ],
      })],
    });

    withEditorView(state, ({ parent }) => expect(parent.querySelector(".healthy")?.textContent).toBe("ab"));
  });

  it("preserves an unnamed plugin's position for provider and lowering failures", () => {
    const providerError = vi.fn();
    const loweringError = vi.fn();
    const providerState = createEditorState({
      extensions: [createMboxExtension({ plugins: [{ extensions: [], }, { decorations: () => { throw new Error("provider"); } }], onDecorationError: providerError })],
    });
    const loweringState = createEditorState({
      extensions: [createMboxExtension({ plugins: [{ extensions: [], }, { decorations: () => [{ type: "mark", from: 1, to: 0, className: "broken" }] }], onDecorationError: loweringError })],
    });

    withEditorView(providerState, () => expect(providerError).toHaveBeenCalledWith(expect.objectContaining({ phase: "provider", pluginName: undefined, pluginIndex: 1 })));
    withEditorView(loweringState, () => expect(loweringError).toHaveBeenCalledWith(expect.objectContaining({ phase: "lowering", pluginName: undefined, pluginIndex: 1 })));
  });

  it("leaves direct facet registration without provenance while rendering and reporting failures", () => {
    const onDecorationError = vi.fn();
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({ onDecorationError }),
        mboxDecorationProviders.of({ provider: () => [{ from: 0, to: 2, className: "direct-good" }, { type: "mark", from: 1, to: 0, className: "direct-broken" }] }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".direct-good")?.textContent).toBe("ab");
      expect(onDecorationError).toHaveBeenCalledWith(expect.objectContaining({ phase: "lowering", pluginName: undefined, pluginIndex: undefined }));
    });
  });

  it("reports direct facet provider failures without provenance", () => {
    const thrown = new Error("direct provider failed");
    const onDecorationError = vi.fn();
    const state = createEditorState({
      extensions: [
        createMboxExtension({ onDecorationError }),
        mboxDecorationProviders.of({ provider: () => { throw thrown; } }),
      ],
    });

    withEditorView(state, () => {
      expect(onDecorationError).toHaveBeenCalledWith({ phase: "provider", error: thrown, pluginName: undefined, pluginIndex: undefined });
    });
  });

  it("preserves the order of overlapping decorations from multiple providers", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [createMboxExtension({
        plugins: [
          { decorations: () => [{ from: 0, to: 2, className: "first-provider" }] },
          { decorations: () => [{ from: 0, to: 2, className: "second-provider" }] },
        ],
      })],
    });

    withEditorView(state, ({ parent }) => {
      const first = parent.querySelector(".first-provider");
      const second = parent.querySelector(".second-provider");

      expect(first?.textContent).toBe("ab");
      expect(second?.textContent).toBe("ab");
      expect(second?.contains(first)).toBe(true);
    });
  });

  it("reports original indices despite facet precedence", () => {
    const onDecorationError = vi.fn();
    const broken = (name: string) => ({ name, decorations: () => { throw new Error(name); } });
    const state = createEditorState({
      extensions: [
        Prec.low(createMboxExtension({ plugins: [{ extensions: [] }, broken("low")], onDecorationError })),
        Prec.high(createMboxExtension({ plugins: [{ extensions: [] }, broken("high")], onDecorationError })),
      ],
    });

    withEditorView(state, () => {
      expect(onDecorationError.mock.calls.map(([reported]) => [reported.pluginName, reported.pluginIndex])).toEqual(expect.arrayContaining([["low", 1], ["high", 1]]));
    });
  });

  it("numbers each createMboxExtension call from zero", () => {
    const onDecorationError = vi.fn();
    const broken = (name: string) => ({ name, decorations: () => { throw new Error(name); } });
    const state = createEditorState({
      extensions: [
        createMboxExtension({ plugins: [broken("first")], onDecorationError }),
        createMboxExtension({ plugins: [broken("second")], onDecorationError }),
      ],
    });

    withEditorView(state, () => {
      expect(onDecorationError.mock.calls.map(([reported]) => [reported.pluginName, reported.pluginIndex])).toEqual(expect.arrayContaining([["first", 0], ["second", 0]]));
    });
  });
  it("connects plugin theme fragments to the editor view", () => {
    withEditorView(
      createEditorState({
        extensions: [createMboxExtension()],
      }),
      ({ view: withoutPlugin }) => {
        withEditorView(
          createEditorState({
            extensions: [
              createMboxExtension({
                plugins: [
                  {
                    theme: {
                      ".cm-line": {
                        color: "red",
                      },
                    },
                  },
                ],
              }),
            ],
          }),
          ({ view: withPlugin }) => {
            expect(withPlugin.dom.classList.length).toBeGreaterThan(withoutPlugin.dom.classList.length);
          },
        );
      },
    );
  });

  it("derives an unfocused decoration context through the real decoration path without stringifying the document", () => {
    let received: MboxDecorationContext | undefined;
    const state = createEditorState({
      doc: "# Heading",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: (context) => {
                received = context;
                return [];
              },
            },
          ],
        }),
      ],
    });
    const toString = vi.spyOn(state.doc, "toString");

    withEditorView(state, ({ view }) => {
      expect(received?.state).toBe(view.state);
      expect([...(received?.activeLineNumbers ?? [])]).toEqual([]);
      expect(toString).not.toHaveBeenCalled();
    });
  });

  it("connects plugin context decoration providers to the editor view", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: (context) => [{ from: 0, to: context.state.doc.length, className: "mbox-test-context-decoration" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-test-context-decoration")?.textContent).toBe("ab");
    });
  });

  it("connects context decoration providers registered directly through the facet", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension(),
        mboxDecorationProviders.of({
          provider: (context) => [{ from: 0, to: context.state.doc.length, className: "mbox-direct-context-decoration" }],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-direct-context-decoration")?.textContent).toBe("ab");
    });
  });

  it("does not render facet context decorations twice when the mbox extension is installed twice", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension(),
        createMboxExtension(),
        mboxDecorationProviders.of({
          provider: (context) => [{ from: 0, to: context.state.doc.length, className: "mbox-shared-context-decoration" }],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelectorAll(".mbox-shared-context-decoration")).toHaveLength(1);
    });
  });

  it("connects context decoration providers in the same decoration cycle", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: (context) => [{ from: 0, to: 1, className: `mbox-context-${context.state.doc.length}` }],
            },
            {
              decorations: () => [{ from: 1, to: 2, className: "mbox-second-context-decoration" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-context-2")?.textContent).toBe("a");
      expect(parent.querySelector(".mbox-second-context-decoration")?.textContent).toBe("b");
    });
  });

  it("creates one shared context for context decoration providers in a decoration cycle", () => {
    const seenContexts: unknown[] = [];
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: (context) => {
                seenContexts.push(context);
                return [];
              },
            },
            {
              decorations: (context) => {
                seenContexts.push(context);
                return [];
              },
            },
          ],
        }),
      ],
    });

    withEditorView(state, () => {
      expect(seenContexts).toHaveLength(2);
      expect(seenContexts[1]).toBe(seenContexts[0]);
    });
  });

  it("connects plugin decoration providers to the editor view", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [{ from: 0, to: 1, className: "mbox-test-decoration" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-test-decoration")).not.toBeNull();
    });
  });

  it("does not stringify the document for context providers that do not read input or document", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [{ from: 0, to: 1, className: "mbox-test-decoration" }],
            },
          ],
        }),
      ],
    });
    const toString = vi.spyOn(state.doc, "toString");

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-test-decoration")).not.toBeNull();
      expect(toString).not.toHaveBeenCalled();
    });
  });

  it("connects plugin line decoration providers to the editor view", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [ { type: "line", from: 0, className: "mbox-test-line-decoration", attributes: { style: "--mbox-test-depth: 2" }, }, ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      const line = parent.querySelector(".cm-line");

      expect(line?.classList.contains("mbox-test-line-decoration")).toBe(true);
      expect(line?.getAttribute("style")).toContain("--mbox-test-depth: 2");
    });
  });

  it("normalizes a mid-line offset in a line decoration to its line start", () => {
    // Tree-based parsers naturally hand out a node's real offset (e.g. a nested
    // bullet, mid-line); CodeMirror line decorations demand the line START. The
    // renderer resolves the containing line so either offset works.
    const state = createEditorState({
      doc: "aa\n  bb",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [{ type: "line", from: 5, className: "mbox-test-midline" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect([...parent.querySelectorAll(".cm-line")][1]?.classList.contains("mbox-test-midline")).toBe(true);
    });
  });

  it("lowers a line-range decoration onto every line with boundary classes", () => {
    const state = createEditorState({
      doc: "aa\nbb\ncc",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [
                { type: "lineRange", from: 1, to: 7, className: "mbox-test-range", attributes: { style: "--mbox-test-depth: 1" } },
              ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      const lines = [...parent.querySelectorAll(".cm-line")];

      expect(lines.map((line) => line.classList.contains("mbox-test-range"))).toEqual([true, true, true]);
      expect(lines.map((line) => line.classList.contains("mbox-test-range-first"))).toEqual([true, false, false]);
      expect(lines.map((line) => line.classList.contains("mbox-test-range-last"))).toEqual([false, false, true]);
      expect(lines[1]?.getAttribute("style")).toContain("--mbox-test-depth: 1");
    });
  });

  it("marks a single-line range as both first and last", () => {
    const state = createEditorState({
      doc: "aa\nbb",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [{ type: "lineRange", from: 3, to: 4, className: "mbox-test-range" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      const lines = [...parent.querySelectorAll(".cm-line")];

      expect(lines[0]?.classList.contains("mbox-test-range")).toBe(false);
      expect(lines[1]?.classList.contains("mbox-test-range-first")).toBe(true);
      expect(lines[1]?.classList.contains("mbox-test-range-last")).toBe(true);
    });
  });

  it("stacks overlapping line ranges on shared lines", () => {
    const state = createEditorState({
      doc: "aa\nbb\ncc",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [
                { type: "lineRange", from: 0, to: 8, className: "mbox-test-outer" },
                { type: "lineRange", from: 3, to: 5, className: "mbox-test-inner" },
              ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      const middle = [...parent.querySelectorAll(".cm-line")][1];

      expect(middle?.classList.contains("mbox-test-outer")).toBe(true);
      expect(middle?.classList.contains("mbox-test-inner")).toBe(true);
      expect(middle?.classList.contains("mbox-test-inner-first")).toBe(true);
      expect(middle?.classList.contains("mbox-test-inner-last")).toBe(true);
    });
  });

  it("connects plugin mark decoration attributes to the editor view", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [ { from: 0, to: 2, className: "mbox-test-mark-decoration", attributes: { style: "--mbox-test-width: 4ch" }, }, ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      const mark = parent.querySelector(".mbox-test-mark-decoration");

      expect(mark?.getAttribute("style")).toContain("--mbox-test-width: 4ch");
    });
  });

  it("connects plugin replace widget decoration providers to the editor view", () => {
    class TestWidget extends WidgetType {
      toDOM(): HTMLElement {
        const element = document.createElement("span");
        element.className = "mbox-test-widget";
        element.textContent = "widget";
        return element;
      }
    }

    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [ { type: "replace", from: 0, to: 2, widget: new TestWidget(), }, ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-test-widget")?.textContent).toBe("widget");
      expect(parent.querySelector(".cm-line")?.textContent).toBe("widget");
    });
  });

  it("connects plugin point widget decoration providers to the editor view without replacing text", () => {
    class TestWidget extends WidgetType {
      toDOM(): HTMLElement {
        const element = document.createElement("span");
        element.className = "mbox-test-point-widget";
        element.textContent = "widget";
        return element;
      }
    }

    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [ { type: "widget", from: 2, widget: new TestWidget(), }, ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-test-point-widget")?.textContent).toBe("widget");
      expect(parent.querySelector(".cm-line")?.textContent).toBe("abwidget");
    });
  });

  it("connects widgetless replace decoration providers to the editor view", () => {
    const state = createEditorState({
      doc: "# h1",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [ { type: "replace", from: 0, to: 2, }, ],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".cm-line")?.textContent).toBe("h1");
    });
  });

  it("keeps rendering a healthy plugin's decorations when another plugin's decorations() throws", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => {
                throw new Error("broken plugin");
              },
            },
            {
              decorations: () => [{ from: 0, to: 1, className: "mbox-healthy-plugin" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-healthy-plugin")?.textContent).toBe("a");
    });
  });

  it("keeps rendering a healthy plugin's decorations when another plugin returns a reverse-ordered mark range", () => {
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          plugins: [
            {
              decorations: () => [{ type: "mark", from: 1, to: 0, className: "mbox-broken-plugin" }],
            },
            {
              decorations: () => [{ from: 0, to: 1, className: "mbox-healthy-plugin" }],
            },
          ],
        }),
      ],
    });

    withEditorView(state, ({ parent }) => {
      expect(parent.querySelector(".mbox-healthy-plugin")?.textContent).toBe("a");
    });
  });

  it("calls onDecorationError with phase \"provider\" when a plugin's decorations() throws", () => {
    const onDecorationError = vi.fn();
    const thrown = new Error("broken plugin");
    const state = createEditorState({
      doc: "ab",
      extensions: [
        createMboxExtension({
          onDecorationError,
          plugins: [
            {
              decorations: () => {
                throw thrown;
              },
            },
          ],
        }),
      ],
    });

    withEditorView(state, () => {
      expect(onDecorationError).toHaveBeenCalledWith({ phase: "provider", error: thrown, pluginName: undefined, pluginIndex: 0 });
    });
  });

});
