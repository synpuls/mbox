import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createTaskCheckboxInput, updateTaskCheckboxInput } from "./task-checkbox-kit.js";

function createView(doc: string, extensions: Extension = []): EditorView {
  return new EditorView({ state: EditorState.create({ doc, extensions }) });
}

describe("createTaskCheckboxInput", () => {
  it("creates a checkbox input reflecting the checked state", () => {
    const view = createView("- [ ] task");
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(false);
    expect(input.getAttribute("aria-label")).toBe("unchecked task");

    view.destroy();
  });

  it("sets the given class name on the input, or none at all", () => {
    const view = createView("- [ ] task");
    const withClass = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5, className: "test-checkbox" });
    const withoutClass = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    expect(withClass.className).toBe("test-checkbox");
    expect(withoutClass.className).toBe("");

    view.destroy();
  });

  it("updates an existing input in place and clicks its current marker range", () => {
    const view = createView("- [ ] first\n- [x] second");
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5, className: "old-checkbox" });

    updateTaskCheckboxInput(input, view, { checked: true, from: 14, to: 17, className: "new-checkbox" });

    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(false);
    expect(input.className).toBe("new-checkbox");
    expect(input.getAttribute("aria-label")).toBe("checked task");
    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe("- [ ] first\n- [ ] second");

    view.destroy();
  });

  it("toggles an unchecked marker to checked on click", () => {
    const view = createView("- [ ] task");
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe("- [x] task");

    view.destroy();
  });

  it("toggles a checked marker back to unchecked on click", () => {
    const view = createView("- [x] task");
    const input = createTaskCheckboxInput(view, { checked: true, from: 2, to: 5 });

    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe("- [ ] task");

    view.destroy();
  });

  it("does not change a read-only document when a synthetic click is dispatched", () => {
    const view = createView("- [ ] task", [EditorState.readOnly.of(true)]);
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe("- [ ] task");

    view.destroy();
  });

  it("creates disabled inputs for a read-only editor", () => {
    const view = createView("- [ ] task", [EditorState.readOnly.of(true)]);
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    expect(input.disabled).toBe(true);

    view.destroy();
  });

  it.each([
    [false, "- [ ] task"],
    [true, "- [x] task"],
  ])("creates a disabled read-only input for a %s task", (checked, doc) => {
    const view = createView(doc, [EditorState.readOnly.of(true)]);
    const input = createTaskCheckboxInput(view, { checked, from: 2, to: 5 });

    expect(input.checked).toBe(checked);
    expect(input.disabled).toBe(true);

    view.destroy();
  });

  it("does not change a document when an existing input is reconfigured read-only", () => {
    const readOnly = new Compartment();
    const view = createView("- [ ] task", [readOnly.of([])]);
    const input = createTaskCheckboxInput(view, { checked: false, from: 2, to: 5 });

    view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(true)) });
    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe("- [ ] task");

    view.destroy();
  });
});
