import { describe, expect, it, vi } from "vitest";
import {
  createMonotonicCursor,
  inlineMatchText,
  instantiateInlinePattern,
  type InlinePatternScanner,
  type InlineScannerFactory,
} from "./inline-scanner-kit.js";

describe("instantiateInlinePattern", () => {
  it("clones a RegExp so its shared lastIndex cannot reach another parse", () => {
    const source = /a/;
    const first = instantiateInlinePattern(source) as RegExp;
    const second = instantiateInlinePattern(source) as RegExp;

    first.lastIndex = 5;

    expect(first).not.toBe(second);
    expect(second.lastIndex).toBe(0);
    expect(source.lastIndex).toBe(0);
  });

  it("adds the global flag the driver needs to advance lastIndex", () => {
    expect((instantiateInlinePattern(/a/i) as RegExp).flags).toContain("g");
    expect((instantiateInlinePattern(/a/i) as RegExp).flags).toContain("i");
  });

  it("keeps an already-global RegExp's flags rather than doubling them", () => {
    expect((instantiateInlinePattern(/a/gi) as RegExp).flags).toBe("gi");
  });

  it("clones an already-global RegExp too, which is the one that carries a position", () => {
    // The tempting shortcut is "it is already global, hand it back". That is
    // exactly the pattern whose `lastIndex` survives between parses, so it is
    // the one case where sharing does damage. Today every pattern here is
    // non-global, which is why nothing else would notice.
    const source = /a/g;
    const instance = instantiateInlinePattern(source) as RegExp;

    instance.lastIndex = 5;

    expect(instance).not.toBe(source);
    expect(source.lastIndex).toBe(0);
  });

  it("returns a stateless scanner unchanged, because there is nothing to keep apart", () => {
    const scanner: InlinePatternScanner = { exec: () => null };

    expect(instantiateInlinePattern(scanner)).toBe(scanner);
  });

  it("builds a fresh scanner from a factory on every call", () => {
    const createScanner = vi.fn((): InlinePatternScanner => ({ exec: () => null }));
    const factory: InlineScannerFactory = { createScanner };

    const first = instantiateInlinePattern(factory);
    const second = instantiateInlinePattern(factory);

    expect(createScanner).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });
});

describe("inlineMatchText", () => {
  it("reads the text a match already carries", () => {
    expect(inlineMatchText({ 0: "abc", index: 2 })).toBe("abc");
  });

  it("produces a deferred match's text on demand, once", () => {
    const resolve = vi.fn(() => "abc");

    expect(inlineMatchText({ index: 2, resolve })).toBe("abc");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("reads a RegExp match array", () => {
    const match = /b(c)/.exec("abc")!;

    expect(inlineMatchText(match)).toBe("bc");
  });
});

describe("createMonotonicCursor", () => {
  /** Wraps indexOf so the calls it makes can be counted. */
  function countingCursor(text: string, needle: string) {
    const find = vi.fn((from: number) => text.indexOf(needle, from));
    return { next: createMonotonicCursor(find), find };
  }

  it("returns the first match at or after the requested position", () => {
    const { next } = countingCursor("a.b.c", ".");

    expect(next(0)).toBe(1);
    expect(next(2)).toBe(3);
  });

  it("answers from the cached result instead of searching again", () => {
    const { next, find } = countingCursor("a.b.c", ".");

    expect(next(0)).toBe(1);
    expect(next(1)).toBe(1);
    expect(next(1)).toBe(1);
    // The whole point: a forward-only caller asking about the same region does
    // not re-walk it.
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("searches again only once the caller has moved past the cached match", () => {
    const { next, find } = countingCursor("a.b.c", ".");

    next(0);
    expect(next(2)).toBe(3);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it("stops searching once nothing is left, without calling find again", () => {
    const { next, find } = countingCursor("abc", ".");

    expect(next(0)).toBe(-1);
    expect(next(1)).toBe(-1);
    expect(next(2)).toBe(-1);
    // The position that came up empty counts as empty too, not just the ones
    // after it. Asking again from exactly there is what a caller does when
    // several patterns share one cursor.
    expect(next(0)).toBe(-1);
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("still answers correctly for a caller that moves backwards past an empty result", () => {
    // Forward-only is the documented contract, but a wrong answer here would be
    // silent: -1 is a plausible result, not an obvious bug.
    const { next } = countingCursor("a.bc", ".");

    expect(next(2)).toBe(-1);
    expect(next(0)).toBe(1);
  });

  it("still answers correctly for a caller that moves backwards past a cached match", () => {
    // The one the first version got wrong. After caching the dot at 3, asking
    // from 0 must find the dot at 1 -- the cache is only an answer for the
    // window the cursor has actually searched.
    const { next } = countingCursor("a.b.c", ".");

    expect(next(2)).toBe(3);
    expect(next(0)).toBe(1);
    // And the earlier answer must not be lost again on the way forward.
    expect(next(2)).toBe(3);
  });

  it("keeps two cursors over the same text independent", () => {
    const text = "a.b.c";
    const first = createMonotonicCursor((from) => text.indexOf(".", from));
    const second = createMonotonicCursor((from) => text.indexOf(".", from));

    expect(first(0)).toBe(1);
    expect(first(2)).toBe(3);
    // The second cursor has advanced nowhere, so it must still see the first
    // dot. A shared cursor would report 3 here -- a position from someone
    // else's scan.
    expect(second(0)).toBe(1);
  });
});
