import { describe, expect, it, vi } from "vitest";
import { completionStatus, startCompletion } from "@codemirror/autocomplete";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import {
  scrapboxCompletePlugin,
  scrapboxCompletionOptionClassName,
  scrapboxCompletionOptionWithPreviewClassName,
  scrapboxCompletionPreviewClassName,
  scrapboxCompletionPreviewImageClassName,
  type ScrapboxCompletionCandidate,
  type ScrapboxCompletionNotation,
} from "./complete.js";

/** A recommender that prefix-matches a fixed title list, recording its calls. */
function spyRecommend(candidates: Array<string | ScrapboxCompletionCandidate>) {
  const calls: Array<{ query: string; notation: ScrapboxCompletionNotation }> = [];
  const normalizedCandidates = candidates.map((candidate) =>
    typeof candidate === "string" ? { title: candidate } : candidate,
  );
  const recommend = (query: string, notation: ScrapboxCompletionNotation) => {
    calls.push({ query, notation });
    return normalizedCandidates.filter((candidate) => candidate.title.toLowerCase().startsWith(query.toLowerCase()));
  };
  return { recommend, calls };
}

describe("scrapboxCompletePlugin", () => {
  it("consumes Tab while completion is open even before CodeMirror's interaction delay allows movement", async () => {
    const plugin = scrapboxCompletePlugin({ recommend: spyRecommend(["ruby", "rails"]).recommend });
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
    const plugin = scrapboxCompletePlugin({
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
        expect(document.querySelector(`.${scrapboxCompletionPreviewClassName}`)).not.toBeNull();
      });

      const options = [...document.querySelectorAll("li")].filter((option) =>
        option.classList.contains(scrapboxCompletionOptionClassName),
      );
      expect(options).toHaveLength(2);
      expect(options[0]?.classList.contains(scrapboxCompletionOptionWithPreviewClassName)).toBe(true);
      expect(options[1]?.classList.contains(scrapboxCompletionOptionWithPreviewClassName)).toBe(false);

      const image = options[0]?.querySelector<HTMLImageElement>(`.${scrapboxCompletionPreviewImageClassName}`);
      expect(image).not.toBeNull();
      expect(image?.src).toBe(iconUrl);
      expect(image?.alt).toBe("");
      expect(image?.getAttribute("aria-hidden")).toBe("true");
      expect(options[1]?.querySelector(`.${scrapboxCompletionPreviewClassName}`)).toBeNull();
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("inserts a bracket page icon link when the preview image is pressed", async () => {
    const iconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    const plugin = scrapboxCompletePlugin({
      recommend: spyRecommend([{ title: "ruby", iconUrl }]).recommend,
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[ru]",
        selection: EditorSelection.cursor(3),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector(`.${scrapboxCompletionPreviewImageClassName}`)).not.toBeNull();
      });

      const image = document.querySelector<HTMLImageElement>(`.${scrapboxCompletionPreviewImageClassName}`);
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      const dispatchResult = image?.dispatchEvent(event);

      expect(dispatchResult).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("[ruby.icon]");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("keeps normal completion acceptance inserting the bracket page link", async () => {
    const iconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    const plugin = scrapboxCompletePlugin({
      recommend: spyRecommend([{ title: "ruby", iconUrl }]).recommend,
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[ru]",
        selection: EditorSelection.cursor(3),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector(`.${scrapboxCompletionOptionClassName}`)).not.toBeNull();
      });

      document
        .querySelector(`.${scrapboxCompletionOptionClassName}`)
        ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

      expect(view.state.doc.toString()).toBe("[ruby]");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("does not insert a bracket page icon link from hash completion preview images", async () => {
    const iconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    const plugin = scrapboxCompletePlugin({
      recommend: spyRecommend([{ title: "ruby", iconUrl }]).recommend,
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "#ru",
        selection: EditorSelection.cursor(3),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector(`.${scrapboxCompletionPreviewImageClassName}`)).not.toBeNull();
      });

      const image = document.querySelector<HTMLImageElement>(`.${scrapboxCompletionPreviewImageClassName}`);
      const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      const dispatchResult = image?.dispatchEvent(event);

      expect(dispatchResult).toBe(false);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("#ru");
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it("inserts the icon link for the candidate whose preview image was pressed, not the first one", async () => {
    const iconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    // Only the second candidate carries an icon, so its preview image is the
    // only one rendered — pressing it must insert *that* candidate's `.icon`.
    const plugin = scrapboxCompletePlugin({
      recommend: spyRecommend([{ title: "ruby" }, { title: "rails", iconUrl }]).recommend,
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[r]",
        selection: EditorSelection.cursor(2),
        extensions: plugin.extensions ?? [],
      }),
    });

    try {
      expect(startCompletion(view)).toBe(true);
      await vi.waitFor(() => {
        expect(document.querySelector(`.${scrapboxCompletionPreviewImageClassName}`)).not.toBeNull();
      });

      const options = [...document.querySelectorAll("li")].filter((option) =>
        option.classList.contains(scrapboxCompletionOptionClassName),
      );
      expect(options[0]?.textContent).toContain("ruby");
      expect(options[1]?.textContent).toContain("rails");

      const image = options[1]?.querySelector<HTMLImageElement>(`.${scrapboxCompletionPreviewImageClassName}`);
      image?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

      expect(view.state.doc.toString()).toBe("[rails.icon]");
    } finally {
      view.destroy();
      parent.remove();
    }
  });
});
