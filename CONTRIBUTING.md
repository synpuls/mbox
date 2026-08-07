# Contributing

## Running the tests

Developing requires **Node >= 20.19** (vite 7's floor), even though the
published package supports Node >= 18 for consumers — CI verifies that claim
separately against the built dist.

- **While developing:** `npm test` — the fast package loop (vitest over
  `src/`). Demo tests are a separate signal: `npm run test:demo`.
- **Before pushing:** `npm run typecheck && npm test`.
- **Before a release, or for changes touching layout, presentation themes, or
  focus behavior:** `npm run test:all` — the coverage-gated package run plus
  the demo tests, the packed-tarball smoke (`test:package`), and the
  Playwright layout suite (`test:layout`, Chromium, Firefox, and WebKit).
  Each engine is part of the layout baseline: do not dismiss an engine-specific
  failure as noise merely because the other engines pass.
- CI is authoritative: it runs the gate with coverage thresholds and a Node
  version matrix even when a local run was skipped. It is not a superset of
  `test:all`, which additionally runs `audit:production`; conversely `test:all`
  does not run the `performance` project's ratio guards, which CI covers
  through `npm test`.

[TESTING.md](TESTING.md) documents the test tiers, the conventions each tier
follows, and how to add tests for a new plugin.

## The export contract: three tiers

Every `export` in this package falls into one of three tiers. Before adding or
keeping an `export`, decide which tier it belongs to.

1. **Package exports = package contract.** `package.json`'s `exports` maps five
   entry points: `.` (the root barrel), the per-notation sub-paths `./gfm`,
   `./hatena`, `./scrapbox` (each `src/<notation>.ts`), and `./testing`
   (plugin-author test helpers, which live there rather than in the root
   barrel). If a symbol is meant for hosts embedding mbox, export it from a
   module *and* re-export it from the relevant entry. This surface is stable;
   treat changes to it as API changes.

2. **`src` export = shared inside `src`.** A module-level `export` is justified
   when another `src/` module imports it (namespace sharing), even if it is not
   part of the root contract. This includes the **constituent types** of an
   exported or shared type/function signature: a parameter- or member-type of a
   shared function stays exported because removing it would make the shared
   signature unusable (e.g. the `ImageKit*` option/class-name types feeding
   image-kit's factories).

3. **Module-private = everything else.** If a symbol is only used within its own
   file — or only a test would want to reach it — it does not get the `export`
   keyword. Tests exercise the **public plugin contract** (`plugin.decorations`,
   the keymap commands, the parser), not private internals: build a context with
   `createTestContext` or drive a real `createEditorView`, and pin class-name
   strings as literals at the assertion site rather than importing an internal
   constant.

A test importing a symbol is **not** by itself a reason to export it. If the
only consumers of an `export` are test files, drop the keyword and rewrite the
test against the tier-1/tier-2 surface instead.
