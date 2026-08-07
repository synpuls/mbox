import { WidgetType } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createInactiveInlineNotationSpecs } from "./inline-notation-kit.js";

class TestWidget extends WidgetType {
  toDOM(): HTMLElement {
    return document.createElement("span");
  }
}

describe("createInactiveInlineNotationSpecs", () => {
  it("replaces the range with the widget the factory creates when inactive", () => {
    const widget = new TestWidget();
    const specs = createInactiveInlineNotationSpecs({ from: 3, to: 8 }, false, "0123456789", () => widget);
    expect(specs).toEqual([{ type: "replace", from: 3, to: 8, widget }]);
  });

  it("creates no specs when active, and never calls the widget factory", () => {
    const createWidget = vi.fn(() => new TestWidget());
    const specs = createInactiveInlineNotationSpecs({ from: 3, to: 8 }, true, "0123456789", createWidget);
    expect(specs).toEqual([]);
    expect(createWidget).not.toHaveBeenCalled();
  });

  it("leaves an inactive range raw when it spans a line break", () => {
    const createWidget = vi.fn(() => new TestWidget());

    expect(createInactiveInlineNotationSpecs({ from: 1, to: 4 }, false, "a\nbc", createWidget)).toEqual([]);
    expect(createWidget).not.toHaveBeenCalled();
  });
});
