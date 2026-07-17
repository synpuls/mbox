# Testing

How this package is tested, which command proves what, and the conventions a
new test is expected to follow.

## 1. Test philosophy

The codebase is developed test-first. Tests pin the **public plugin contract**
— `plugin.decorations(context)`, keymap commands, the parsers, the exported
factories — never private internals (see the export contract in
[CONTRIBUTING.md](CONTRIBUTING.md)). Offsets are the product: a decoration or
parser test states its expected ranges explicitly so a reviewer can check them
against the input string, which is why parser expectations are written inline
rather than as snapshots.

## 2. Test tiers

| Tier | Location | Runner | Proves |
| --- | --- | --- | --- |
| Package unit/integration | `src/**/*.test.ts` | vitest (projects `unit` + `dom`) | Parser, decoration-spec, and editor behavior against source |
| Conformance | `tests/conformance/*.test.ts` | vitest (project `unit`) | Invariants every plugin shares, over a document corpus |
| Demo | `demos/*.test.ts` | vitest (project `demo`) | The demo entry points keep working; not part of the library gate |
| Layout | `tests/layout/**/*.spec.ts` | Playwright (Chromium, Firefox, WebKit) | User-visible rendering: geometry, focus stability, completion UX |
| Package smoke | `scripts/package-smoke.mjs` | node | The **packed tarball** installs and runs for a consumer |

Vitest tests co-locate with the module they exercise. Layout specs live apart
because they test user-visible behavior through a browser, not modules.

**Where does a new test go?** Three questions:

1. Does it observe browser behavior — painted geometry, CSS, focus movement,
   the completion popup, a real `EditorView` in a page? → a layout spec in
   `tests/layout/<notation>/`, or `tests/layout/editor/` if it holds for any
   plugin set (see §12).
2. Is it a cross-plugin or cross-notation invariant with no offset or
   class-name expectations? → the conformance corpus (§9).
3. Otherwise it exercises one shipped module's contract → co-locate as
   `src/**/<module>.test.ts`, using the `.dom.test.ts` name only when the
   tests genuinely need a DOM (§6). Demo wiring goes in `demos/*.test.ts`;
   packed-tarball behavior belongs to the package smoke (§14).

## 3. Fast local commands

- `npm test` — the development loop: the vitest `package` project only.
- `npm run test:demo` — the two demo suites.
- `npm run typecheck` — covers `src/`, `demos/`, `tests/`, `scripts/`, and the
  root config files; run it with `npm test` before pushing.

## 4. Release confidence commands

- `npm run test:all` — typecheck, coverage-gated package tests, demo tests,
  the packed-tarball smoke (builds first), and the Playwright layout suite.
  Run it before a release and for any change touching layout, presentation
  themes, or focus behavior.
- CI is authoritative; it runs everything `test:all` runs plus the Node
  version matrix and package-shape checks.

## 5. Vitest package tests

`vitest.config.ts` defines three projects. `unit` (node) and `dom` (happy-dom)
together are the library quality gate `npm test` runs; `demo` is the separate
demo signal. The `mbox` import alias points at `src/index.ts`, so vitest
always exercises source — never `dist/` (that is the package smoke's job).

## 6. DOM tests and happy-dom

A file that needs a DOM (widget `toDOM`, a real `EditorView`) says so in its
name: `*.dom.test.ts` runs in the `dom` project on happy-dom, every other
`*.test.ts` runs in the `unit` project on plain node. Keep pure
decoration-spec and parser tests out of `.dom.test.ts`: a test that runs in
plain node documents that the logic under test is DOM-free.

Do not add a `// @vitest-environment happy-dom` pragma under `src/` — the
`.dom.test.ts` name is the mechanism (the audit that removed the pragmas from
all of `src/` is done). The two demo suites still use the pragma because the
`demo` project has no name-based split; that tier is not part of the gate.

## 7. Decoration spec tests

Build the context with `createTestContext(doc, { activeLines | selection })`
and assert on the spec array a plugin returns. End a `specsFor()` helper with
`validateDecorationSpecs(context, specs)` so a spec that would crash a real
`EditorView` (an empty mark range, an out-of-bounds offset) fails the test
instead of surviving until production. Asserting on the raw array alone cannot
catch those.

## 8. The `@synpuls/mbox/testing` contract

`createTestContext` and `validateDecorationSpecs` are **shipped public API**
for third-party plugin authors, not internal scaffolding: they are included in
coverage, exercised by the package smoke from the installed tarball, and
changes to them are API changes.

## 9. Shared conformance suites

`tests/conformance/` runs every notation bundle over a document corpus
through `tests/unit-kit/decoration-conformance.ts`, asserting only the
invariants every plugin shares: `decorations()` does not throw, each plugin's
specs lower (`validateDecorationSpecs`), the combined specs of the whole
bundle lower together, ranges stay inside the document, and two runs over the
same context produce identical specs — each checked against a blurred, a
fully focused, and a cursor-focused context. Notation-specific grammar, class
names, and offsets never belong here; they live in that notation's own
co-located tests.

The corpus is also the contributor entry point for parser/decoration bug
reports: add the smallest document that reproduces the bug to
`tests/conformance/corpus/<notation>.ts` (or `corpus/common.ts` when it is
not notation-specific) in the same PR as the fix. No offsets or expected
values are needed — the invariants do the asserting.

## 10. Parser test policy

Parser tests state expected node types **and offsets** inline. No snapshot
assertions for parser ASTs: `--update` invites rubber-stamping a change whose
entire risk is in the offsets. If a parser file grows unwieldy, split it by
behavioral surface (block / inline / footnote), not by forcing it to mirror
source modules.

`parser.property.test.ts` adds fast-check property tests for the invariants
only — never throws, ranges in bounds, inline inside its block, reparse
deterministic — over generated documents. The seed is fixed so the PR gate
stays deterministic; explore fresh inputs with `FC_SEED=<n>` (and
`FC_NUM_RUNS=<n>`), and promote any shrunken counterexample to an
example-based test or the conformance corpus in the fixing PR. Generated
inputs never assert grammar or offsets — that stays example-based.

## 11. Fixture policy

Checked-in fixture documents are for breadth ("this whole document parses and
round-trips without crashing"), not for offset-critical assertions, which stay
inline. Layout fixtures live in `tests/layout/kit/fixtures/` and
`demos/layout-fixture.html` (driven through the `window.__mboxLayoutFixture`
handle; add new plugin modes to `pluginsByMode` there **and** to the
`OpenLayoutFixtureOptions` union in `tests/layout/kit/helpers.ts`).

## 12. Playwright layout tests

`npm run test:layout` boots the vite dev server on a dedicated port (see
`playwright.config.ts`; it never reuses an existing server — a stale worktree
server once served stale code) and drives `demos/layout-fixture.html` or the
notation playgrounds. Specs are grouped by directory: `mbox/`, `gfm/`,
`hatena/`, and `scrapbox/` hold that notation's specs (the directory is the
namespace — no `scrapbox-` file prefixes), and `kit/` holds the helpers and
fixtures, which Playwright never picks up as specs. `tests/layout/editor/` is
for notation-independent editor behavior only: read-only mode, focus
plumbing, selection, and fixture-harness behavior that should hold with any
plugin set. If a spec depends on a notation's syntax, CSS classes, widgets,
or parser output, it goes under that notation's directory even when the
behavior sounds "editor-like". The layout suite runs in Playwright Chromium,
Firefox, and WebKit with the same desktop viewport settings. This is
engine-level coverage; it does not certify native Edge or Safari/macOS. Prefer
the helpers in `tests/layout/kit/helpers.ts` over ad-hoc `page.evaluate`. For completion
interactions, wait with `completionReady()` before accept/move keys and assert
the selected option's text between movement keys — the tooltip being visible
does not mean the popup will accept keys (see the helper's comment for the two
race windows).

## 13. Pixel assertion policy

`pixelAt` reads a composited pixel from a 1×1 screenshot. It exists because
`getComputedStyle` reports declared values, not the painted result of layered
translucent backgrounds. Constraints:

- Use it only for solid, intentionally-painted colors where one CSS rule owns
  the outcome, or for relative comparisons within one screenshot.
- Never assert on anti-aliased text edges, shadows, or glyph pixels.
- Prefer geometry (`getBoundingClientRect`, computed style) whenever it can
  observe the behavior; a pixel assertion should carry a comment saying why
  geometry cannot.

## 14. Package smoke tests

`npm run test:package` builds, packs the tarball, installs it into a temp
project with the declared **peer ranges** (what a fresh consumer would get),
imports every `exports`-map subpath, and mounts one editor in happy-dom. The
`--import-only` flag skips the DOM parts so the check can run on Node 18,
below the dev toolchain's floor — that is how CI keeps the `engines >=18`
claim honest.

### Guard-test verification

For a new or changed test whose purpose is a guard, verify once that it guards
the intended path: make the smallest possible mutation to the protected target
and confirm that the specific test or command fails. This applies only to
guards for public surface, negative conditions, conditional branches,
performance thresholds, and packaging — it is not a requirement for every
test. The narrow scope keeps the extra work small while preventing a green
test from silently exercising a different path.

Record these three facts with the change or its review notes:

- The invariant being protected.
- The minimal mutation made.
- The test or command that turned red.

## 15. Coverage policy

`npm run test:coverage` gates the `unit` + `dom` projects at lines/statements/
functions 90 and branches 80 — a few points under actuals, so a sizable
untested module fails CI without making refactors fight the meter. Themes are
excluded (CSS-in-JS value objects), and so are the entry-point files: their
import-time line coverage is noise, while their thin editor wrappers and
export surface are covered by the entry tests and the package smoke.
`test-context.ts` is deliberately included as shipped API. Raising thresholds is welcome;
lowering them is an API-review-level decision.

## 16. CI matrix

| Job | Node | Runs |
| --- | --- | --- |
| `test` | 22 | typecheck, coverage, demo, build, publint, arethetypeswrong, package smoke |
| `node-matrix` | 20, 24 | `npm test`, `test:package` (vite 7's floor is 20.19) |
| `node18-consumer` | build on 22, run on 18 | `package-smoke.mjs --import-only` |
| `layout` | 22 | Playwright Chromium, Firefox, and WebKit suites |

## 17. Adding a new plugin test

1. Co-locate `<plugin>.test.ts` beside the module.
2. Drive `plugin.decorations` through `createTestContext`; keep the file on
   the node environment unless it genuinely builds DOM.
3. End the spec helper with `validateDecorationSpecs`.
4. Pin class names as string literals at the assertion site; do not import
   internal constants or add exports for the test's benefit.
5. If the plugin has user-visible layout behavior, add a layout spec (and a
   fixture plugin mode) rather than stretching the unit tier.

## 18. Anti-patterns to avoid

- Snapshotting parser output or spec arrays.
- `@vitest-environment happy-dom` on a file that never touches the DOM.
- Asserting only on raw spec arrays without lowering them (§7).
- Pixel assertions where geometry would do (§13).
- Waiting for a completion tooltip's existence instead of `completionReady`.
- Adding an `export` so a test can reach something private
  ([CONTRIBUTING.md](CONTRIBUTING.md)).
- Testing `dist/` through vitest (the alias means you never are) — packed
  behavior belongs to the package smoke.
