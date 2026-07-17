import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { parseScrapboxDocument } from "./parser.js";
import {
  scrapboxCommandClassName,
  scrapboxCommandLineClassName,
  scrapboxCommandLinePlugin,
  scrapboxCommandPromptClassName,
} from "./command-line.js";
import { createTestContext } from "../../editor/test-context.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxCommandLinePlugin().decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxCommandLineSpecs", () => {
  it("marks a $ command line, its prompt and command text", () => {
    expect(specsFor("$ ls")).toEqual([
      { type: "line", from: 0, className: scrapboxCommandLineClassName },
      { type: "mark", from: 0, to: 1, className: scrapboxCommandPromptClassName },
      { type: "mark", from: 2, to: 4, className: scrapboxCommandClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("accepts a % prompt and resolves offsets when indented", () => {
    expect(specsFor(" % cp a b")).toMatchObject([
      { type: "line", from: 0 },
      { type: "mark", from: 1, to: 2, className: scrapboxCommandPromptClassName },
      { type: "mark", from: 3, to: 9, className: scrapboxCommandClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });

  it("requires a space after the prompt and ignores plain lines", () => {
    expect(specsFor("$x")).toEqual([]);
    expect(specsFor("git status")).toEqual([]);
  });

  it("styles command lines even on the active line", () => {
    const document = parseScrapboxDocument("$ a\n$ b");

    // The command-line style hides no syntax (`$ ` stays literal), so it applies
    // as soon as `$ `/`% ` is typed, regardless of focus. The active line (1)
    // keeps its own line/prompt/command specs.
    const specs = specsFor("$ a\n$ b", [1]);

    expect(specs.filter((spec) => spec.from < 4)).toEqual([
      { type: "line", from: 0, className: scrapboxCommandLineClassName },
      { type: "mark", from: 0, to: 1, className: scrapboxCommandPromptClassName },
      { type: "mark", from: 2, to: 3, className: scrapboxCommandClassName, inclusiveStart: true, inclusiveEnd: true },
    ]);
  });
});

describe("scrapboxCommandLinePlugin", () => {
  it("provides specs through a decoration provider", () => {
    const state = EditorState.create({
      doc: "$ ls",
      extensions: [createMboxExtension({ plugins: [scrapboxCommandLinePlugin()] })],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);

    expect(provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]).length).toBe(3);
  });
});
