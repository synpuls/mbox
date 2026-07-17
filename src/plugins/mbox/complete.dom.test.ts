import { describe, expect, it, vi } from "vitest";
import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import {
  completionOptionClassName,
  completionOptionWithPreviewClassName,
  completionPreviewClassName,
  completionPreviewImageClassName,
  mboxCompletePlugin,
  type MboxCompletionCandidate,
} from "./complete.js";

/** A recommender that prefix-matches a fixed candidate list, recording its calls. */
function spyRecommend(candidates: MboxCompletionCandidate[]) {
  const calls: Array<{ query: string }> = [];
  const recommend = (query: string) => {
    calls.push({ query });
    return candidates.filter((candidate) => candidate.title.toLowerCase().startsWith(query.toLowerCase()));
  };
  return { recommend, calls };
}

describe("mboxCompletePlugin", () => {
  it("consumes Tab while completion is open even before CodeMirror's interaction delay allows movement", async () => {
    const plugin = mboxCompletePlugin({ recommend: spyRecommend([{ title: "ruby" }, { title: "rails" }]).recommend });
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[r",
        selection: EditorSelection.cursor(2),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(completionStatus(view.state)).not.toBeNull();
      });

      const tab = plugin.keymap?.find((binding) => binding.key === "Tab");
      expect(tab?.run?.(view)).toBe(true);
    } finally {
      view.destroy();
    }
  });

  it("renders a decorative preview image for candidates with iconUrl", async () => {
    const iconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='22'%3E%3C/svg%3E";
    const plugin = mboxCompletePlugin({
      recommend: spyRecommend([{ title: "ruby", iconUrl }, { title: "rails" }]).recommend,
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[r",
        selection: EditorSelection.cursor(2),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector(`.${completionPreviewClassName}`)).not.toBeNull();
      });

      const options = [...document.querySelectorAll("li")].filter((option) =>
        option.classList.contains(completionOptionClassName),
      );
      expect(options).toHaveLength(2);
      expect(options[0]?.classList.contains(completionOptionWithPreviewClassName)).toBe(true);
      expect(options[1]?.classList.contains(completionOptionWithPreviewClassName)).toBe(false);

      const image = options[0]?.querySelector<HTMLImageElement>(`.${completionPreviewImageClassName}`);
      expect(image).not.toBeNull();
      expect(image?.src).toBe(iconUrl);
      expect(image?.alt).toBe("");
      expect(image?.getAttribute("aria-hidden")).toBe("true");
      expect(options[1]?.querySelector(`.${completionPreviewClassName}`)).toBeNull();
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});
