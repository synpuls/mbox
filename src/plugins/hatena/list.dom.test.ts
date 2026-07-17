import { describe, expect, it } from "vitest";
import { createTestContext } from "../../editor/test-context.js";
import {
  HatenaListMarkerWidget,
  hatenaListIndentClassName,
  hatenaListMarkerClassName,
  hatenaListMarkerSlotActiveClassName,
  hatenaListMarkerSlotClassName,
  hatenaListMarkerSlotCollapsedClassName,
  hatenaListMarkerSlotOrderedClassName,
  hatenaListPlugin,
} from "./list.js";

describe("HatenaListMarkerWidget.toDOM", () => {
  it("renders a depth-1 collapsed marker as a single empty slot", () => {
    const marker = new HatenaListMarkerWidget(1, false, null).toDOM();

    expect(marker.className).toBe(hatenaListMarkerClassName);
    expect(marker.children).toHaveLength(1);
    expect(marker.children[0]?.className).toBe(`${hatenaListMarkerSlotClassName} ${hatenaListMarkerSlotCollapsedClassName}`);
    expect(marker.children[0]?.textContent).toBe("​");
  });

  it("marks the innermost slot active on active lines", () => {
    const marker = new HatenaListMarkerWidget(1, true, null).toDOM();

    expect(marker.children[0]?.className).toBe(`${hatenaListMarkerSlotClassName} ${hatenaListMarkerSlotActiveClassName}`);
  });

  it("pads outer depth levels with indent slots before the innermost marker slot", () => {
    const marker = new HatenaListMarkerWidget(3, false, null).toDOM();

    expect(Array.from(marker.children, (slot) => slot.className)).toEqual([
      hatenaListIndentClassName,
      hatenaListIndentClassName,
      `${hatenaListMarkerSlotClassName} ${hatenaListMarkerSlotCollapsedClassName}`,
    ]);
  });

  it("renders an ordered item's ordinal as the marker text instead of a bullet slot", () => {
    const marker = new HatenaListMarkerWidget(2, false, 3).toDOM();

    expect(marker.children[0]?.className).toBe(hatenaListIndentClassName);
    expect(marker.children[1]?.className).toBe(`${hatenaListMarkerSlotClassName} ${hatenaListMarkerSlotOrderedClassName}`);
    expect(marker.children[1]?.textContent).toBe("3.");
  });
});

describe("HatenaListMarkerWidget.eq", () => {
  it("treats widgets with the same depth, active state, and ordinal as equal", () => {
    expect(new HatenaListMarkerWidget(2, true, null).eq(new HatenaListMarkerWidget(2, true, null))).toBe(true);
    expect(new HatenaListMarkerWidget(1, false, 2).eq(new HatenaListMarkerWidget(1, false, 2))).toBe(true);
  });

  it("distinguishes depth, active state, and ordinal", () => {
    expect(new HatenaListMarkerWidget(1, false, null).eq(new HatenaListMarkerWidget(2, false, null))).toBe(false);
    expect(new HatenaListMarkerWidget(1, false, null).eq(new HatenaListMarkerWidget(1, true, null))).toBe(false);
    expect(new HatenaListMarkerWidget(1, false, 1).eq(new HatenaListMarkerWidget(1, false, 2))).toBe(false);
  });
});

describe("hatenaListPlugin widget wiring", () => {
  it("puts a marker widget carrying the item's depth, active state, and ordinal in each replace spec", () => {
    const specs = hatenaListPlugin().decorations!(createTestContext("+one\n+two", { activeLines: [2] }));

    const widgets = specs.flatMap((spec) => (spec.type === "replace" && spec.widget ? [spec.widget] : []));
    expect(widgets).toHaveLength(2);
    expect(widgets[0]).toBeInstanceOf(HatenaListMarkerWidget);
    expect(widgets[0]?.eq(new HatenaListMarkerWidget(1, false, 1))).toBe(true);
    expect(widgets[1]?.eq(new HatenaListMarkerWidget(1, true, 2))).toBe(true);
  });
});
