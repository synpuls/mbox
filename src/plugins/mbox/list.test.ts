import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { createTestContext } from "../../editor/test-context.js";
import {
  listClassNames,
  listPlugin,
} from "./list.js";

const listDecorations = (doc: string, activeLines: Iterable<number> = []) =>
  listPlugin().decorations!(createTestContext(doc, { activeLines }));
const listUnfocusedSpecs = (doc: string, activeLines: Iterable<number>) =>
  listDecorations(doc, activeLines).filter(
    (spec) =>
      "className" in spec &&
      (spec.className.includes("mbox-list-unfocused-line") ||
        spec.className === "mbox-list-indent" ||
        spec.className === "mbox-list-content"),
  );
const listFocusedLineSpecs = (doc: string, activeLines: Iterable<number>) =>
  listDecorations(doc, activeLines).filter((spec) => "className" in spec && spec.className === "mbox-list-focused-line");

describe("createListUnfocusedLineSpecs", () => {
  it("creates line class specs for list item blocks outside the focused line", () => {
    const input = "# Heading\n- item";

    expect(listUnfocusedSpecs(input, [1])).toEqual([
      {
        type: "line",
        from: 10,
        className: `mbox-list-unfocused-line ${listClassNames.ul}`,
      },
      {
        type: "mark",
        from: 10,
        to: 10,
        className: "mbox-list-indent",
      },
      {
        type: "mark",
        from: 12,
        to: 16,
        className: "mbox-list-content",
        inclusiveStart: true,
        inclusiveEnd: true,
      },
    ]);
  });

  it("does not create bullet replacement specs for list items on the focused line", () => {
    const input = "# Heading\n- item";

    expect(listUnfocusedSpecs(input, [2])).toEqual([]);
  });

  it("creates line class specs for nested list items outside the focused line", () => {
    const input = "  - nested";

    expect(listUnfocusedSpecs(input, [2])).toEqual([
      {
        type: "line",
        from: 0,
        className: `mbox-list-unfocused-line ${listClassNames.ul}`,
      },
      {
        type: "mark",
        from: 0,
        to: 2,
        className: "mbox-list-indent",
      },
      {
        type: "mark",
        from: 4,
        to: 10,
        className: "mbox-list-content",
        inclusiveStart: true,
        inclusiveEnd: true,
      },
    ]);
  });
});

describe("createListFocusedLineSpecs", () => {
  it("creates a hanging indent line spec for focused raw list items", () => {
    const input = "  - nested";

    expect(listFocusedLineSpecs(input, [1])).toEqual([
      {
        type: "line",
        from: 0,
        className: "mbox-list-focused-line",
        attributes: {
          style: "--mbox-list-focused-marker-width: 4ch; --mbox-list-focused-marker-offset: 2ch",
        },
      },
    ]);
  });

  it("does not create focused line specs for unfocused list items", () => {
    const input = "  - nested";

    expect(listFocusedLineSpecs(input, [2])).toEqual([]);
  });
});

describe("listPlugin", () => {
  it("provides unfocused list line specs from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "# Heading\n- item",
      selection: EditorSelection.cursor(2),
      extensions: [
        createMboxExtension({
          plugins: [listPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);
    const specs = provider?.(createTestContext("# Heading\n- item", { selection: 2 }));

    expect(specs?.filter((spec) => "className" in spec && (spec.className.includes("mbox-list-unfocused-line") || spec.className === "mbox-list-indent" || spec.className === "mbox-list-content"))).toEqual([
      {
        type: "line",
        from: 10,
        className: `mbox-list-unfocused-line ${listClassNames.ul}`,
      },
      {
        type: "mark",
        from: 10,
        to: 10,
        className: "mbox-list-indent",
      },
      {
        type: "mark",
        from: 12,
        to: 16,
        className: "mbox-list-content",
        inclusiveStart: true,
        inclusiveEnd: true,
      },
    ]);
  });

  it("registers list editing keybindings", () => {
    const state = EditorState.create({
      extensions: [
        createMboxExtension({
          plugins: [listPlugin()],
        }),
      ],
    });
    const bindings = state.facet(keymap).flat();

    expect(bindings.some((binding) => binding.key === "Enter")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Tab")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Shift-Tab")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Backspace")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Ctrl-h")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Delete")).toBe(true);
    expect(bindings.some((binding) => binding.key === "Space")).toBe(true);
  });
});
