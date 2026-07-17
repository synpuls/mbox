import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  createMboxCompletionSource,
  findMboxActiveToken,
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

function completeAt(doc: string, pos: number, recommend = spyRecommend([{ title: "ruby" }, { title: "rails" }]).recommend) {
  const state = EditorState.create({ doc });
  return createMboxCompletionSource(recommend)(new CompletionContext(state, pos, false));
}

describe("findMboxActiveToken", () => {
  it("spans the whole bracket token including a trailing close bracket", () => {
    expect(findMboxActiveToken("[ru]", 3)).toEqual({ query: "ru", from: 0, to: 4 });
  });

  it("spans an unclosed bracket up to the caret", () => {
    expect(findMboxActiveToken("[ru", 3)).toEqual({ query: "ru", from: 0, to: 3 });
  });

  it("returns null outside any token", () => {
    expect(findMboxActiveToken("[a] b", 5)).toBeNull();
  });

  it("returns null while typing a footnote label", () => {
    expect(findMboxActiveToken("[^lab", 5)).toBeNull();
  });
});

describe("createMboxCompletionSource", () => {
  it("asks recommend with the bracket query", () => {
    const spy = spyRecommend([{ title: "ruby" }, { title: "rails" }]);
    completeAt("[ru]", 3, spy.recommend);
    expect(spy.calls).toEqual([{ query: "ru" }]);
  });

  it("replaces the whole bracket token and wraps page candidates in brackets", () => {
    const result = completeAt("[r]", 2);

    expect(result).toMatchObject({ from: 0, to: 3, filter: false });
    expect(result?.options.map((option) => option.apply)).toEqual(["[ruby]", "[rails]"]);
  });

  it("uses [title.icon] as the default apply text for icon candidates", () => {
    const result = completeAt("[r]", 2, spyRecommend([{ title: "ruby", type: "icon" }]).recommend);

    expect(result?.options.map((option) => option.apply)).toEqual(["[ruby.icon]"]);
  });

  it("prefers an explicit candidate apply text", () => {
    const result = completeAt("[r]", 2, spyRecommend([{ title: "ruby", type: "icon", apply: "[Ruby Custom]" }]).recommend);

    expect(result?.options.map((option) => option.apply)).toEqual(["[Ruby Custom]"]);
  });

  it("keeps candidate iconUrl values on completion options", () => {
    const result = completeAt(
      "[r]",
      2,
      spyRecommend([
        { title: "ruby", iconUrl: "data:image/svg+xml,<svg />" },
        { title: "rails" },
      ]).recommend,
    );

    expect(result?.options).toMatchObject([{ iconUrl: "data:image/svg+xml,<svg />" }, { iconUrl: undefined }]);
  });

  it("returns null outside a token", () => {
    expect(completeAt("hello", 5)).toBeNull();
  });

  it("does not ask recommend while typing a footnote label", () => {
    const spy = spyRecommend([{ title: "label" }]);

    expect(completeAt("[^lab]", 5, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null before at least one query character is typed", () => {
    const spy = spyRecommend([{ title: "ruby" }]);

    expect(completeAt("[]", 1, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null inside fenced code blocks", () => {
    const spy = spyRecommend([{ title: "ruby" }]);
    const doc = "```\n[r]\n```";

    expect(completeAt(doc, 6, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null inside table blocks", () => {
    const spy = spyRecommend([{ title: "ruby" }]);
    const doc = "| Name |\n| --- |\n| [r] |";

    expect(completeAt(doc, doc.indexOf("[r]") + 2, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null when recommend has no candidates", () => {
    expect(completeAt("[zz]", 3)).toBeNull();
  });

  it("still completes on the first line", () => {
    const result = completeAt("[ru]\nbody", 3);
    expect(result).not.toBeNull();
  });
});

describe("mboxCompletePlugin", () => {
  it("is inert (no autocomplete extension) without a recommender", () => {
    expect(mboxCompletePlugin().extensions).toEqual([]);
  });

  it("installs autocomplete and completion keymap with a recommender", () => {
    const plugin = mboxCompletePlugin({ recommend: spyRecommend([{ title: "ruby" }]).recommend });

    expect(plugin.extensions).toHaveLength(1);
    expect(plugin.keymap).toBeDefined();
    expect(plugin.keymap ?? []).not.toHaveLength(0);
    expect(plugin.keymap?.some((binding) => binding.key === "Tab")).toBe(true);
    expect(plugin.keymap?.some((binding) => binding.key === "Shift-Tab")).toBe(true);
  });
});
