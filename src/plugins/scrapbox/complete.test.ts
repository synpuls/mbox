import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import {
  createScrapboxCompletionSource,
  findScrapboxActiveToken,
  scrapboxCompletePlugin,
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

function completeAt(doc: string, pos: number, recommend = spyRecommend(["ruby", "rails"]).recommend) {
  const state = EditorState.create({ doc });
  return createScrapboxCompletionSource(recommend)(new CompletionContext(state, pos, false));
}

describe("findScrapboxActiveToken", () => {
  it("spans the whole bracket token including a trailing close bracket", () => {
    expect(findScrapboxActiveToken("[ru]", 3)).toEqual({ kind: "bracket", query: "ru", from: 0, to: 4 });
  });

  it("spans an unclosed bracket up to the caret", () => {
    expect(findScrapboxActiveToken("[ru", 3)).toEqual({ kind: "bracket", query: "ru", from: 0, to: 3 });
  });

  it("detects a hashtag only after start-of-line or whitespace", () => {
    expect(findScrapboxActiveToken("a #ru", 5)).toEqual({ kind: "hash", query: "ru", from: 2, to: 5 });
    expect(findScrapboxActiveToken("a#ru", 4)).toBeNull(); // "#" mid-word is not a tag
  });

  it("returns null outside any token", () => {
    expect(findScrapboxActiveToken("[a] b", 5)).toBeNull();
  });
});

describe("createScrapboxCompletionSource", () => {
  it("asks recommend with the bracket query and notation", () => {
    const spy = spyRecommend(["ruby", "rails"]);
    completeAt("[ru]", 3, spy.recommend);
    expect(spy.calls).toEqual([{ query: "ru", notation: "bracket" }]);
  });

  it("asks recommend with the hash query and notation", () => {
    const spy = spyRecommend(["ruby", "rails"]);
    completeAt("#ru", 3, spy.recommend);
    expect(spy.calls).toEqual([{ query: "ru", notation: "hash" }]);
  });

  it("replaces the whole bracket token and wraps the candidate in brackets", () => {
    const result = completeAt("[r]", 2); // caret before the "]"; query "r" matches both titles

    expect(result).toMatchObject({ from: 0, to: 3, filter: false });
    expect(result?.options.map((option) => option.apply)).toEqual(["[ruby]", "[rails]"]);
  });

  it("wraps hash candidates with a leading #", () => {
    const result = completeAt("#r", 2);
    expect(result?.options.map((option) => option.apply)).toEqual(["#ruby", "#rails"]);
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

  it("returns null inside code blocks", () => {
    const spy = spyRecommend(["ruby"]);
    const doc = "code:hello.js\n [r]";

    expect(completeAt(doc, doc.indexOf("[r]") + 2, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null inside table blocks", () => {
    const spy = spyRecommend(["ruby"]);
    const doc = "table:example\n [r]\tvalue";

    expect(completeAt(doc, doc.indexOf("[r]") + 2, spy.recommend)).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  it("returns null when recommend has no candidates", () => {
    expect(completeAt("[zz]", 3)).toBeNull(); // nothing starts with "zz"
  });

  it("still completes on the first (title) line — mbox does not treat it specially", () => {
    const result = completeAt("[ru]\nbody", 3); // caret on line 1
    expect(result).not.toBeNull();
  });
});

describe("scrapboxCompletePlugin", () => {
  it("is inert (no autocomplete extension) without a recommender", () => {
    expect(scrapboxCompletePlugin().extensions).toEqual([]);
  });

  it("installs autocomplete and completion keymap with a recommender", () => {
    const plugin = scrapboxCompletePlugin({ recommend: spyRecommend(["ruby"]).recommend });

    expect(plugin.extensions).toHaveLength(1);
    expect(plugin.keymap).toBeDefined();
    expect(plugin.keymap ?? []).not.toHaveLength(0);
    expect(plugin.keymap?.some((binding) => binding.key === "Tab")).toBe(true);
    expect(plugin.keymap?.some((binding) => binding.key === "Shift-Tab")).toBe(true);
  });
});
