// The pieces the inline driver needs before a scanner can carry state.
//
// Three separate problems, kept separate on purpose:
//
//  1. A stateful scanner must either be built per parse or explicitly reset
//     when its input changes. Both prevent state left over from one parse from
//     being read as a position in the next document. Factories are the default
//     structure here; resets protect that contract if the driver later reuses
//     a scanner for another input.
//
//  2. Repeatedly asking "where is the next X at or after here?" from a loop
//     that only moves forward rescans the same tail over and over. A monotonic
//     cursor answers from a cached position instead -- and, being per-parse, it
//     cannot leak across documents.
//
//  3. Candidate arbitration only ever compares START POSITIONS. Building the
//     matched string for candidates that go on to lose is wasted work, and on a
//     pathological input it is most of the work. A deferred match carries only
//     an index plus a way to produce the text later.
//
// (3) is a separate type rather than an optional field on the existing match,
// so that reading the text of a candidate mid-comparison does not type-check.
// An optional field would leave the mistake available and only discourage it.

/** A match whose text is already in hand -- the shape `RegExp.exec` returns. */
interface InlinePatternMatch {
  0: string;
  index: number;
}

/**
 * A match that knows only where it starts. `resolve` produces the matched text
 * and is called at most once, after this candidate has won.
 */
interface DeferredInlinePatternMatch {
  index: number;
  resolve: () => string;
}

/**
 * What a scanner may return. Deliberately a union with no common text member:
 * `candidate[0]` does not compile, which is the point.
 *
 * The two members are not exported. A scanner writes `{ 0: text, index }` or
 * `{ index, resolve }` and structural typing does the rest; naming them
 * publicly before anything needs the names would be one more export to keep.
 */
export type InlineScanMatch = InlinePatternMatch | DeferredInlinePatternMatch;

/** Finds the next match at or after `from`, or null when there is none. */
export interface InlinePatternScanner {
  exec: (text: string, from: number) => InlineScanMatch | null;
}

/**
 * The default way to build a scanner for a parse. A stateful scanner may use a
 * factory, explicit reset when its input changes, or both. Prefer a factory
 * for a scanner whose cursor or cache belongs to one parse; retain a reset
 * when silently reusing that state for another input would yield plausible,
 * wrong positions. A stateless scanner does not need a factory.
 */
export interface InlineScannerFactory {
  createScanner: () => InlinePatternScanner;
}

export type InlinePattern = RegExp | InlinePatternScanner | InlineScannerFactory;

function isScannerFactory(pattern: InlinePattern): pattern is InlineScannerFactory {
  return "createScanner" in pattern;
}

/**
 * The per-parse instance of one pattern.
 *
 * A RegExp becomes a clone with the global flag, because the driver drives
 * `lastIndex` and two parses sharing one RegExp would share that position. A
 * factory is invoked. A plain scanner is returned unchanged -- it holds nothing
 * to keep apart.
 */
export function instantiateInlinePattern(pattern: InlinePattern): RegExp | InlinePatternScanner {
  if (pattern instanceof RegExp) {
    return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  }
  return isScannerFactory(pattern) ? pattern.createScanner() : pattern;
}

/** The matched text, producing it now if the match deferred it. */
export function inlineMatchText(match: InlineScanMatch | RegExpExecArray): string {
  return "resolve" in match ? match.resolve() : match[0];
}

/**
 * Wraps a monotone search so that a forward-only caller does not rescan.
 *
 * `find(from)` must return the first position at or after `from` that matches,
 * or -1. Monotone means: if `find(a)` is -1 then `find(b)` is -1 for every
 * `b >= a`, and results never move backwards as `from` grows. Every "next
 * newline", "next `]`", "next whitespace" search over a fixed string satisfies
 * this.
 *
 * Given that, a cached result at or after the requested position is still the
 * answer, and once the search comes up empty it stays empty.
 *
 * BUILD ONE PER PARSE. A shared cursor keeps positions from whichever document
 * it saw last, and the failure is silent: the cached index is a perfectly
 * plausible number for the new text.
 */
export function createMonotonicCursor(find: (from: number) => number): (from: number) => number {
  // The cache is a single fact: `cached` is the FIRST match at or after
  // `cachedFrom`. That is only an answer for a query in `[cachedFrom, cached]`
  // -- inside that window there is provably nothing earlier. A query below
  // `cachedFrom` is asking about text this cursor has never looked at, and
  // returning `cached` there would skip a match that is really present.
  //
  // Keeping only the match, and answering whenever `cached >= from`, is the
  // tempting shorter version. It is wrong for a caller that moves backwards,
  // and wrong silently: over "a.b.c", asking from 2 and then from 0 answered 3
  // instead of 1 -- a plausible position, just not the right one.
  let cachedFrom = -1;
  let cached = -1;
  // The lowest position known to have nothing at or after it. A position
  // rather than a flag, so a backwards-moving caller gets a real answer
  // instead of a stale -1.
  let emptyFrom = Number.POSITIVE_INFINITY;

  return (from: number) => {
    if (from >= emptyFrom) return -1;
    if (cached !== -1 && cachedFrom <= from && from <= cached) return cached;

    const found = find(from);
    if (found === -1) {
      emptyFrom = Math.min(emptyFrom, from);
      return -1;
    }
    cachedFrom = from;
    cached = found;
    return found;
  };
}
