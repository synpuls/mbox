import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import {
  headingClassNames,
  headingPlugin,
} from "./heading.js";

import { createTestContext, validateDecorationSpecs } from "../../testing.js";

const headingDecorations = (doc: string, activeLines: Iterable<number> = []) =>
  headingPlugin().decorations!(createTestContext(doc, { activeLines }));
const validHeadingDecorations = (doc: string, activeLines: Iterable<number> = []) => {
  const context = createTestContext(doc, { activeLines });
  const specs = headingPlugin().decorations!(context);
  validateDecorationSpecs(context, specs);
  return specs;
};
const headingLineSpecs = (doc: string) =>
  headingDecorations(doc).filter((spec) => spec.type === "line");
const headingHideSpecs = (doc: string, activeLines: Iterable<number>) =>
  headingDecorations(doc, activeLines).filter((spec) => spec.type === "replace");

describe("createHeadingSyntaxHideSpecs", () => {
  it("creates hide specs for heading syntax outside active raw syntax lines", () => {
    const input = "# Heading\n## Other";

    expect(headingHideSpecs(input, new Set([1]))).toEqual([
      { type: "replace", from: 10, to: 13 },
    ]);
  });

  it("does not create hide specs for empty heading syntax outside active raw syntax lines", () => {
    expect(headingHideSpecs("# ", new Set())).toEqual([]);
    expect(headingHideSpecs("###   ", new Set())).toEqual([]);
  });

  it("does not create hide specs for headings on active raw syntax lines", () => {
    const input = "# Heading\n## Other";

    expect(headingHideSpecs(input, new Set([1, 2]))).toEqual([]);
  });

  it("produces valid specs for empty heading syntax", () => {
    expect(() => validHeadingDecorations("# \n###   ")).not.toThrow();
  });
});

describe("createHeadingLineSpecs", () => {
  it("creates heading level line specs", () => {
    const input = "# Heading\n## Other";

    expect(headingLineSpecs(input)).toEqual([
      {
        type: "line",
        from: 0,
        to: 0,
        className: `mbox-heading-line ${headingClassNames.h1}`,
        attributes: {
          style: "--mbox-heading-level: 1",
        },
      },
      {
        type: "line",
        from: 10,
        to: 10,
        className: `mbox-heading-line ${headingClassNames.h2}`,
        attributes: {
          style: "--mbox-heading-level: 2",
        },
      },
    ]);
  });

  it("does not create heading line specs for markers without trailing spaces", () => {
    expect(headingLineSpecs("#\n##")).toEqual([]);
  });
});

describe("headingPlugin", () => {
  it("carries no structural theme -- font-size/weight only come from the opt-in mboxDefaultPresentationTheme", () => {
    expect(headingPlugin().theme).toBeUndefined();
  });

  it("provides heading decorations from the default MboxDocument parser", () => {
    const state = EditorState.create({
      doc: "# Heading\n## Other",
      selection: EditorSelection.cursor(2),
      extensions: [
        createMboxExtension({
          plugins: [headingPlugin()],
        }),
      ],
    });
    const providers = state.facet(mboxDecorationProviders);

    expect(providers.flatMap(({ provider }) => provider(createTestContext("# Heading\n## Other", { selection: 2 })))).toContainEqual({
      type: "replace",
      from: 10,
      to: 13,
    });
  });

  it("provides heading decorations through context providers", () => {
    const state = EditorState.create({
      doc: "# Heading\n## Other",
      selection: EditorSelection.cursor(2),
      extensions: [
        createMboxExtension({
          plugins: [headingPlugin()],
        }),
      ],
    });
    const providers = state.facet(mboxDecorationProviders);

    expect(providers.flatMap(({ provider }) => provider(createTestContext("# Heading\n## Other", { selection: 2 })))).toContainEqual({
      type: "replace",
      from: 10,
      to: 13,
    });
  });
});
