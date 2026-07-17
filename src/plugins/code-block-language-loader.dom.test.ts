import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { createCodeBlockKitLanguageLoader } from "./code-block-language-loader.js";

describe("createCodeBlockKitLanguageLoader's extension", () => {
  it("scans the document for code block info strings and loads their languages automatically", async () => {
    let infoValues = ["python"];
    const loader = createCodeBlockKitLanguageLoader(() => infoValues);
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "```python\nx = 1\n```", extensions: [loader.extension] }),
    });

    await loader.ensureLanguageLoaded("python");

    expect(loader.getLanguage("python")).not.toBeNull();
    view.destroy();
  });

  it("dispatches an empty transaction to live views once a language finishes loading", async () => {
    const loader = createCodeBlockKitLanguageLoader(() => ["python"]);
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "```python\nx = 1\n```", extensions: [loader.extension] }),
    });
    const dispatchSpy = vi.spyOn(view, "dispatch");

    // Shares the cache with whatever the extension's own constructor-time
    // scan already kicked off; awaiting it settles once that resolves too.
    await loader.ensureLanguageLoaded("python");

    expect(dispatchSpy).toHaveBeenCalled();
    view.destroy();
  });

  it("stops dispatching to a destroyed view", async () => {
    const loader = createCodeBlockKitLanguageLoader(() => ["python"]);
    const parent = document.createElement("div");
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "```python\nx = 1\n```", extensions: [loader.extension] }),
    });
    const dispatchSpy = vi.spyOn(view, "dispatch");
    view.destroy();

    await loader.ensureLanguageLoaded("python");

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
