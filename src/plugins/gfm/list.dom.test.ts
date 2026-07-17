import { describe, expect, it } from "vitest";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createGfmEditor } from "../../gfm.js";
import {
  GfmBulletWidget,
  GfmTaskCheckboxWidget,
  gfmBulletClassName,
  gfmTaskCheckboxClassName,
} from "./list.js";

describe("GfmBulletWidget", () => {
  it("renders the label inside a box pinned to the marker's width", () => {
    const bullet = new GfmBulletWidget(2, "•").toDOM();

    expect(bullet.className).toBe(gfmBulletClassName);
    expect(bullet.style.display).toBe("inline-block");
    expect(bullet.style.width).toBe("2ch");
    expect(bullet.textContent).toBe("•");
  });

  it("renders an ordered marker's raw label", () => {
    const bullet = new GfmBulletWidget(3, "1.").toDOM();

    expect(bullet.style.width).toBe("3ch");
    expect(bullet.textContent).toBe("1.");
  });

  it("treats widgets as equal only when width and label both match", () => {
    expect(new GfmBulletWidget(2, "•").eq(new GfmBulletWidget(2, "•"))).toBe(true);
    expect(new GfmBulletWidget(2, "•").eq(new GfmBulletWidget(3, "•"))).toBe(false);
    expect(new GfmBulletWidget(2, "•").eq(new GfmBulletWidget(2, "1."))).toBe(false);
  });
});

describe("GfmTaskCheckboxWidget", () => {
  function createView(doc: string): EditorView {
    return new EditorView({ state: EditorState.create({ doc }) });
  }

  it("renders an interactive checkbox whose click dispatches the bracket edit", () => {
    const view = createView("- [ ] task");
    const span = new GfmTaskCheckboxWidget(false, 2, 5).toDOM(view);

    expect(span.className).toBe(gfmTaskCheckboxClassName);
    const input = span.querySelector("input");
    expect(input?.type).toBe("checkbox");
    expect(input?.checked).toBe(false);

    input?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe("- [x] task");

    view.destroy();
  });

  it("renders a checked box for a checked task", () => {
    const view = createView("- [x] task");
    const input = new GfmTaskCheckboxWidget(true, 2, 5).toDOM(view).querySelector("input");

    expect(input?.checked).toBe(true);

    view.destroy();
  });

  it("renders a disabled read-only checked box that cannot change the document", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "- [x] task", extensions: [EditorState.readOnly.of(true)] }),
    });
    const input = new GfmTaskCheckboxWidget(true, 2, 5).toDOM(view).querySelector<HTMLInputElement>("input");

    expect(input?.disabled).toBe(true);
    input?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe("- [x] task");

    view.destroy();
  });

  it("treats widgets as equal only when checked state and bracket range all match", () => {
    expect(new GfmTaskCheckboxWidget(false, 2, 5).eq(new GfmTaskCheckboxWidget(false, 2, 5))).toBe(true);
    expect(new GfmTaskCheckboxWidget(false, 2, 5).eq(new GfmTaskCheckboxWidget(true, 2, 5))).toBe(false);
    expect(new GfmTaskCheckboxWidget(false, 2, 5).eq(new GfmTaskCheckboxWidget(false, 3, 6))).toBe(false);
    expect(new GfmTaskCheckboxWidget(false, 2, 5).eq(new GfmTaskCheckboxWidget(false, 2, 5, true))).toBe(false);
  });

  it("updates a registered checkbox DOM in place and rejects malformed DOM", () => {
    const view = createView("- [x] task");
    const widget = new GfmTaskCheckboxWidget(false, 2, 5);
    const span = widget.toDOM(view);
    const input = span.querySelector<HTMLInputElement>("input");

    expect(new GfmTaskCheckboxWidget(true, 2, 5).updateDOM(span, view)).toBe(true);
    expect(span.querySelector("input")).toBe(input);
    expect(input?.checked).toBe(true);
    expect(input?.getAttribute("aria-label")).toBe("checked task");
    expect(new GfmTaskCheckboxWidget(true, 2, 5).updateDOM(document.createElement("span"), view)).toBe(false);

    view.destroy();
  });

  it("keeps a focused checkbox node through toggles and read-only reconfiguration", async () => {
    const readOnly = new Compartment();
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createGfmEditor({
      parent,
      doc: "- [ ] task\nplain",
      selection: { anchor: 16 },
      extensions: [readOnly.of([])],
    });

    try {
      const input = parent.querySelector<HTMLInputElement>(`.${gfmTaskCheckboxClassName} input`);
      input?.focus();
      input?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.state.doc.toString()).toBe("- [x] task\nplain");
      expect(parent.querySelector(`.${gfmTaskCheckboxClassName} input`)).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input?.checked).toBe(true);
      expect(input?.getAttribute("aria-label")).toBe("checked task");

      input?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.state.doc.toString()).toBe("- [ ] task\nplain");
      expect(parent.querySelector(`.${gfmTaskCheckboxClassName} input`)).toBe(input);
      expect(document.activeElement).toBe(input);

      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(true)) });
      expect(parent.querySelector(`.${gfmTaskCheckboxClassName} input`)).toBe(input);
      expect(input?.disabled).toBe(true);
      input?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(view.state.doc.toString()).toBe("- [ ] task\nplain");

      view.dispatch({ effects: readOnly.reconfigure([]) });
      expect(parent.querySelector(`.${gfmTaskCheckboxClassName} input`)).toBe(input);
      expect(input?.disabled).toBe(false);
      input?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(view.state.doc.toString()).toBe("- [x] task\nplain");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("toggles the current marker after a preceding edit shifts its range", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createGfmEditor({ parent, doc: "- [ ] task\nplain", selection: { anchor: 16 } });

    try {
      view.dispatch({ changes: { from: 0, insert: "note\n" } });
      parent.querySelector<HTMLInputElement>(`.${gfmTaskCheckboxClassName} input`)?.click();

      expect(view.state.doc.toString()).toBe("note\n- [x] task\nplain");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("keeps CodeMirror away from events on the checkbox", () => {
    expect(new GfmTaskCheckboxWidget(false, 2, 5).ignoreEvent()).toBe(true);
  });
});
