import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "../../editor/test-context.js";
import { GfmBulletWidget, GfmTaskCheckboxWidget, gfmListPlugin } from "./list.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  const context = createTestContext(input, { activeLines });
  const specs = gfmListPlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
}

describe("gfmListPlugin", () => {
  it("styles a bullet line and replaces its marker with a fixed-width bullet widget", () => {
    const specs = specsFor("- item");
    expect(specs[0]).toEqual({
      type: "line",
      from: 0,
      className: "mbox-gfm-list-line mbox-gfm-li-d0",
    });
    expect(specs[1].type).toBe("replace");
    expect(specs[1]).toMatchObject({ from: 0, to: 2 });
    const widget = (specs[1] as unknown as { widget: GfmBulletWidget }).widget;
    expect(widget).toBeInstanceOf(GfmBulletWidget);
    // Reserve exactly the marker width so hiding `- ` never slides content.
    expect(widget.width).toBe(2);
  });

  it("produces valid specs for a bare marker with no trailing whitespace", () => {
    // Line 1 (the bare "-") is NOT active, so its marker is lowered as it
    // would be in a blurred editor.
    const specs = specsFor("-\nplain", [2]);
    const replace = specs.find((spec) => spec.type === "replace");
    expect(replace).toMatchObject({ from: 0, to: 1 });
  });

  it("tags nested items with their depth class and keeps the raw indentation", () => {
    const specs = specsFor("- a\n  - b");
    const lineSpecs = specs.filter((spec) => spec.type === "line");
    expect(lineSpecs[0]).toMatchObject({ className: "mbox-gfm-list-line mbox-gfm-li-d0" });
    expect(lineSpecs[1]).toMatchObject({ className: "mbox-gfm-list-line mbox-gfm-li-d1", from: 4 });
  });

  it("keeps an ordered item's number as the bullet widget label", () => {
    const specs = specsFor("1. first\n2. second");
    const replace = specs.find((spec) => spec.type === "replace") as unknown as { widget: GfmBulletWidget };
    expect(replace.widget).toBeInstanceOf(GfmBulletWidget);
    expect(replace.widget.label).toBe("1.");
  });

  it("reveals the raw marker on an active line (only the line style remains)", () => {
    const specs = specsFor("- item", [1]);
    expect(specs).toEqual([{ type: "line", from: 0, className: "mbox-gfm-list-line mbox-gfm-li-d0" }]);
  });

  it("replaces a task item's `- [ ] ` with a checkbox widget carrying the checked state", () => {
    const specs = specsFor("- [ ] todo\n- [x] done");
    const replaces = specs.filter((spec) => spec.type === "replace") as unknown as Array<{ from: number; to: number; widget: GfmTaskCheckboxWidget }>;
    expect(replaces[0]).toMatchObject({ from: 0, to: 6 });
    expect(replaces[0].widget).toBeInstanceOf(GfmTaskCheckboxWidget);
    expect(replaces[0].widget.checked).toBe(false);
    // The checkbox renders in a COMPACT 2ch slot like the mbox notation's, not a
    // slot reserving the whole raw `- [ ] ` width (that left a gaping hole).
    expect("width" in replaces[0].widget).toBe(false);
    // The widget carries the `[ ]` bracket range (chars 2..5) it toggles on click.
    expect(replaces[0].widget).toMatchObject({ from: 2, to: 5 });
    expect(replaces[1]).toMatchObject({ from: 11, to: 17 });
    expect(replaces[1].widget.checked).toBe(true);
    expect(replaces[1].widget).toMatchObject({ from: 13, to: 16 });
    // The task line also carries a task class for styling.
    const taskLine = specs.find((spec) => spec.type === "line") as { className: string };
    expect(taskLine.className).toContain("mbox-gfm-task-line");
  });

  it("keeps a task checkbox replacement range stable when its marker toggles", () => {
    const unchecked = specsFor("- [ ] todo").find((spec) => spec.type === "replace")!;
    const checked = specsFor("- [x] todo").find((spec) => spec.type === "replace")!;

    expect({ from: checked.from, to: checked.to }).toEqual({ from: unchecked.from, to: unchecked.to });
  });

  it("reveals the raw task syntax on an active line", () => {
    const specs = specsFor("- [x] done", [1]);
    expect(specs.every((spec) => spec.type === "line")).toBe(true);
  });
});
