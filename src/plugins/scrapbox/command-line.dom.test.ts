import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxCommandClassName,
  scrapboxCommandLineClassName,
  scrapboxCommandLinePlugin,
} from "./command-line.js";
import { scrapboxLinkClassName, scrapboxLinkPlugin } from "./link.js";

describe("createScrapboxCommandLineSpecs", () => {
  it("nests a link that is the ENTIRE command so the command's styling still applies", () => {
    // Regression test: the command mark's range coincides exactly with the
    // link's own replace range when the command is nothing but a link, so
    // CodeMirror needs inclusiveStart/inclusiveEnd on the command mark to nest
    // the link instead of splitting it out as a DOM sibling.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "$ [http://example.com]",
        extensions: [createMboxExtension({ plugins: [scrapboxCommandLinePlugin(), scrapboxLinkPlugin()] })],
      }),
    });

    const command = parent.querySelector(`.${scrapboxCommandClassName}`);
    expect(command).not.toBeNull();
    expect(command?.querySelector(`.${scrapboxLinkClassName}`)).not.toBeNull();

    view.destroy();
  });
});

describe("scrapboxCommandLinePlugin", () => {
  it("adds a command line class in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "$ git status",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxCommandLinePlugin()] })],
      }),
    });

    expect(parent.querySelector(`.${scrapboxCommandLineClassName}`)).not.toBeNull();
    expect(parent.querySelector(`.${scrapboxCommandClassName}`)?.textContent).toBe("git status");

    view.destroy();
  });
});
