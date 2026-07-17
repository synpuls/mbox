import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorState } from "../../editor/create-editor.js";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { plainMarkerPlugin } from "./plain-marker.js";
import { createTestContext, validateDecorationSpecs } from "../../testing.js";

describe("plainMarkerPlugin", () => {
  it("provides marker decoration specs from the default MboxDocument parser", () => {
    const state = createEditorState({
      doc: "# Heading",
      extensions: [
        createMboxExtension({
          plugins: [plainMarkerPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("# Heading")).filter((spec) => "className" in spec && spec.className === "mbox-plain-marker")).toEqual([{ from: 0, to: 1, className: "mbox-plain-marker" }]);
  });

  it("keeps marker syntax on every selected line out of the hide class", () => {
    const state = EditorState.create({
      doc: "# Heading\n- item",
      selection: EditorSelection.range(0, 16),
      extensions: [
        createMboxExtension({
          plugins: [plainMarkerPlugin()],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider(createTestContext("# Heading\n- item", { selection: { anchor: 0, head: 16 } })).filter((spec) => "className" in spec && spec.className === "mbox-plain-marker-hide")).toEqual([]);
  });
});

describe("plainMarkerPlugin specs", () => {
  const plainMarkerSpecs = (doc: string, activeLines: Iterable<number> = []) =>
    plainMarkerPlugin().decorations!(createTestContext(doc, { activeLines }));
  const validPlainMarkerSpecs = (doc: string, activeLines: Iterable<number> = []) => {
    const context = createTestContext(doc, { activeLines });
    const specs = plainMarkerPlugin().decorations!(context);
    validateDecorationSpecs(context, specs);
    return specs;
  };

  it("produces valid specs for empty heading syntax", () => {
    expect(() => validPlainMarkerSpecs("# \n###   ")).not.toThrow();
  });

  it("hides empty heading syntax outside active raw syntax lines", () => {
    expect(
      plainMarkerSpecs("# \n###   ").filter((spec) => "className" in spec && spec.className === "mbox-plain-marker-hide"),
    ).toEqual([
      { type: "mark", from: 0, to: 2, className: "mbox-plain-marker-hide" },
      { type: "mark", from: 3, to: 9, className: "mbox-plain-marker-hide" },
    ]);
  });

  it("creates marker specs for nested list markers at their real offsets", () => {
    expect(plainMarkerSpecs("  - nested").filter((spec) => "className" in spec && spec.className === "mbox-plain-marker")).toEqual([
      { from: 2, to: 3, className: "mbox-plain-marker" },
    ]);
  });

  it("creates marker specs across multiple blocks", () => {
    expect(
      plainMarkerSpecs("# Heading\nText\n  - nested").filter((spec) => "className" in spec && spec.className === "mbox-plain-marker"),
    ).toEqual([
      { from: 0, to: 1, className: "mbox-plain-marker" },
      { from: 17, to: 18, className: "mbox-plain-marker" },
    ]);
  });

  it("hides marker syntax only outside active raw syntax lines", () => {
    expect(
      plainMarkerSpecs("# Heading\n## Other", [1]).filter((spec) => "className" in spec && spec.className === "mbox-plain-marker-hide"),
    ).toEqual([{ type: "mark", from: 10, to: 13, className: "mbox-plain-marker-hide" }]);
  });

  it("hides every marker syntax range outside active raw syntax lines", () => {
    expect(
      plainMarkerSpecs("# Heading\nText\n  - nested", [2]).filter((spec) => "className" in spec && spec.className === "mbox-plain-marker-hide"),
    ).toEqual([
      { type: "mark", from: 0, to: 2, className: "mbox-plain-marker-hide" },
      { type: "mark", from: 17, to: 19, className: "mbox-plain-marker-hide" },
    ]);
  });
});
