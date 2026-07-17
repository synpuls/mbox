# Prepublish Review TODO

This checklist tracks the fixes found by the prepublish review. Work stays on
`main`; each section gets one focused implementation commit followed by its
own two-round Codex review. Review fixes and bookkeeping may use a focused
follow-up commit.

## Section 0: Restore the layout baseline

- [x] Test list recorded
- [x] Red confirmed: targeted fixture had 4 passed and 8 failed
- [x] Minimal implementation: synchronized 11 stale text expectations
- [x] Targeted tests: 12 passed
- [x] Full layout tests: 167 passed
- [x] Typecheck passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- Keep exactly one rendered `page link` outside code blocks and none inside.
- Keep the copied code assertion, updated to the English demo source.
- Keep quote, table, inline-code, inline-style, and task-list plugin assertions.
- Keep the accessibility assertion that code-block brackets are not links.
- Do not weaken selectors, counts, layout checks, or accessibility checks.

## Section 1: Reject unsafe GFM link destinations

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed: javascript destination rendered as `A`, not unsafe `SPAN`
- [x] TDD implementation
- [x] Targeted tests and typecheck passed
- [x] Full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- Reject `javascript`, `vbscript`, `data`, `file`, and `blob`, including case,
  entity, leading-control, and embedded-tab/newline variants.
- Validate the URL resolver's final result before DOM creation.
- Reject unknown custom schemes by default; allow validated additional schemes
  without allowing the permanently blocked schemes to be re-enabled.
- Preserve relative, protocol-relative, HTTP(S), mail, and telephone links.
- Render unsafe destinations as non-anchor spans that retain their visible
  label and expose the public `gfmUnsafeLinkClassName` styling hook.
- Keep unsafe links raw on active lines and visible for empty labels.
- Determine external-link attributes from the final resolved URL.
- Preserve autolinks and export the unsafe class from root and GFM entries.

### Implementation evidence

- First Red: targeted link test had 1 failed and 4 passed because the unsafe
  destination rendered as `A`.
- Targeted tests: 55 passed across GFM link, inline composition, and public
  root/GFM entry coverage.
- Full unit/DOM tests: 155 files and 1,219 tests passed.
- Typecheck passed.
- Package build, pack, install, and smoke test passed.

## Section 2A: Enforce the read-only checkbox contract

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted and full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- Read-only checked and unchecked shared task inputs are disabled and cannot
  change the document, including synthetic click dispatch.
- A task input created while editable cannot change the document after the
  state is reconfigured read-only.
- Editable mbox and GFM task widgets still toggle in both directions.
- Read-only mbox and GFM widget integrations expose disabled semantics and
  preserve the document.
- The real read-only viewer exposes a disabled task checkbox and preserves the
  document when event dispatch bypasses native activation.
- Dynamic disabled-attribute synchronization is deferred to Section 2B together
  with widget DOM identity and `updateDOM`.

### Implementation evidence

- First Red: a synthetic click changed a read-only `- [ ] task` to `- [x] task`.
- Shared task-input DOM tests cover initial checked/unchecked disabled state and
  an editable input reconfigured read-only through a `Compartment`.
- mbox and GFM DOM integrations cover disabled read-only widgets and unchanged
  documents after synthetic click events.
- Targeted DOM tests: 25 passed. Targeted read-only browser tests: 4 passed.
- Typecheck passed. Full unit/DOM tests: 155 files and 1,227 tests passed.
- Full layout tests: 168 passed.

## Section 2B: Preserve checkbox focus and DOM identity

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted and full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- mbox and GFM keep the same focused input DOM after a stable marker toggle.
- Checked state, accessible label, class, and disabled state update in place.
- Two consecutive toggles restore the original document and keep focus.
- Reconfiguring read-only on and off synchronizes disabled state without
  replacing the widget, and only enables edits after read-only is removed.
- A marker shifted by an unrelated preceding edit still toggles its current
  range; identity is not required across positional changes.
- Real-browser mbox and GFM checks retain the original focused input across two
  toggles.

### Implementation evidence

- First Red: the shared input update test failed because
  `updateTaskCheckboxInput` did not exist.
- The shared kit now keeps a per-input controller in a `WeakMap`; in-place
  updates replace its current view/range/options before synchronizing checked,
  disabled, accessible label, and class state. It prevents the native click
  default and reapplies the current widget state after its event turn.
- GFM and mbox widgets use strict equality with a trailing read-only key and
  `updateDOM` reuse only their registered, structurally valid checkbox input.
- Targeted DOM tests: 33 passed. Targeted browser tests: 13 passed.
- Typecheck passed. Full unit/DOM tests: 155 files and 1,236 tests passed.
- Full layout tests: 170 passed.

## Section 3: Remove quadratic mbox parser paths

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted tests and typecheck passed
- [x] Full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- Large runs of unmatched closing parentheses parse without repeated rescans.
- Large runs of unclosed image openers remain text without repeated rescans.
- Large runs of unclosed bracket and footnote prefixes remain text without
  repeated rescans and preserve a later valid autolink.
- Balanced and overclosed autolink parentheses retain their established split.
- Existing odd/even backslash runs before image closers preserve escape parity.
- A malformed image prefix remains text and does not hide later valid Markdown
  links or images.

### Implementation evidence

- Red: the 20,000-closing-paren autolink took 1,156 ms and 20,000 unclosed
  image openers took 638 ms, both exceeding the 500 ms regression threshold.
- `trimAutoLinkEnd` now counts parentheses once before trimming only excess
  trailing closers.
- A lazy private `InlineScanIndex` builds each requested lookup table once:
  raw bracket/paren lookups for links, wiki links, icons, and footnotes, and
  image-only unescaped bracket/paren lookups that preserve backslash parity.
- Added inline regression tests: 47 passed. Targeted mbox tests: 45 files and
  385 tests passed. Typecheck passed.

## Section 4: Make the Scrapbox inline parser stack-safe

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted and full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- At least 5,000 hashtags parse without throwing and keep exact offsets.
- The same sibling depth is safe in strong or decoration children.
- Text and token ordering remains unchanged.
- Matcher priority and nested-content behavior remain unchanged.
- Existing conformance cases stay green.

### Implementation evidence

- Red: 5,000 top-level and strong-nested hashtags both raised
  `RangeError: Maximum call stack size exceeded` in the recursive splitter.
- `parseScrapboxInline` now processes segment and output frames with an
  explicit LIFO work stack, preserving prefix, matched node, suffix order and
  retaining nested node creation behavior.
- Inline tests: 38 passed. Targeted Scrapbox tests: 35 files and 271 tests
  passed. Typecheck passed.

## Section 5: Make the GFM AST adapter stack-safe

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted tests and typecheck passed
- [x] Full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- At least 2,000 nested blockquotes adapt without throwing.
- Deep lists adapt without overflowing the stack.
- Traversal order, offsets, depth, ordered-list state, and sibling context
  remain unchanged.
- Direct `adaptGfmDocument` and existing parser tests stay green.

### Implementation evidence

- Red: both the 2,000 nested blockquote input and a 2,000-level synthetic
  mdast list raised `RangeError: Maximum call stack size exceeded` in the
  recursive adapter.
- `walk` now uses explicit `{ node, context }` frames and reverse-pushes child
  nodes, preserving preorder output while deriving list and blockquote context
  only for their descendants.
- Added coverage for mixed list traversal/order state, nested blockquote marker
  offsets, and direct adaptation of a synthetic deep list.
- Targeted parser tests: 32 passed. Typecheck and `git diff --check` passed.

## Section 6: Restore normal fallback Tab navigation

- [x] Two-round design consultation
- [x] Test list recorded
- [x] Red confirmed
- [x] TDD implementation
- [x] Targeted and full tests passed
- [x] Codex review round 1
- [x] Codex review round 2
- [x] Root code review
- [x] Implementation committed

### Test list

- Unhandled Tab and Shift-Tab move focus out of the editor normally.
- List indentation and completion still consume their contextual bindings.
- Forward and backward browser focus navigation both work.
- Inactive default mbox list and completion bindings leave native focus
  navigation intact.

### Implementation evidence

- Red: the base-state unit expectation found the unconditional `Tab` binding,
  and the browser focus test remained inside the editor rather than reaching
  the fixed after-editor link.
- Removed only the unconditional base `Tab` / `Shift-Tab` keymap. Plugin
  keymaps remain unchanged.
- Targeted verification passed: `create-editor.test.ts`, all mbox and
  Scrapbox plugin tests (671 tests), and the mbox list browser suite (15
  tests). `npm run typecheck` and `git diff --check` also passed.
- The default mbox regression uses a fenced code block, where list and
  completion bindings are inactive. It preserves the native focus order
  through the code block's Copy button before and after the editor.

## Section 7A: Give editor textboxes accessible names

- [x] Two-round design consultation
- [x] Test list recorded
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

### Test list

- The generic editor exposes a labelled multiline textbox by default, and uses
  a supplied non-empty `ariaLabel` while empty or whitespace values fall back.
- Host `contentAttributes` can override `aria-label` and combine it with
  `aria-labelledby`; separate views keep their own names.
- mbox, GFM, Hatena, and Scrapbox state and view shortcuts forward `ariaLabel`.
- All four shipped demos declare stable names; existing browser smoke tests
  locate the mbox, GFM, and Hatena editors by textbox role and name.
- A public fixture verifies that an `aria-labelledby` extension overrides the
  default label in the browser accessibility tree.

### Implementation evidence

- DOM coverage verifies the default and custom names, empty-value fallback,
  host attribute composition, multiple views, and all notation shortcuts.
- Demo unit coverage verifies the mbox and Scrapbox state factories; browser
  smoke coverage verifies named textbox locators for mbox, GFM, and Hatena.
- Targeted DOM tests: 23 passed. Demo tests: 9 passed. Browser smoke tests:
  39 passed. Typecheck and `git diff --check` passed.

## Section 7B: Add rendered table semantics

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

### Implementation evidence

- Table-kit merges table, row, cell, column-index, and empty-cell widget
  attributes without replacing its existing layout styles.
- mbox, GFM, Hatena, and Scrapbox create a table tree only while every table
  row is inactive. GFM/mbox delimiters are hidden from assistive technology;
  Scrapbox uses its first body row, not its opener, as the header.
- Targeted unit tests: 69 passed. Targeted DOM tests: 4 passed. Targeted GFM
  browser test: 1 passed. Typecheck and `git diff --check` passed.

## Section 7C: Add accessible footnote semantics

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

## Section 8: Include or externally link the packaged guide

- [x] Two-round design consultation
- [x] TDD implementation and package verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

## Section 9: Define and verify browser support

- [x] Two-round policy consultation
- [x] Browser matrix or explicit support policy implemented
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

## Section 10: Linearize the autolink reject path

The final prepublish check found a quadratic that Section 3 missed:
`parseAutoLinkAt` scans to end of line for every candidate that clears the
cheap guards and then fails the `.includes(".")` check, so a single line of
`(http://x` repeated costs O(n^2), and the document cache reparses in full on
every edit. At 144 KB, the old parser took 13.1 s in a standalone process. In
a same-process old/new comparison it took 23,772 ms, versus 7.1 ms for the new
parser; do not compare those measurements directly because their environments
and warm-up conditions differ. The existing autolink performance tests all used
payloads containing a dot (a *succeeding* autolink) or unclosed openers, so the
reject path was never exercised.

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

Verified against the pre-change parser taken straight from git: 300,000
differential fuzz inputs, 0 mismatches. 144 KB of `(http://x` went from
23,772 ms to 7.1 ms, scaling 1.8 / 3.5 / 7.1 ms across 36 / 72 / 144 KB —
linear. Full suite 1349 passed.

### Design decisions

- Extend `InlineScanIndex` with `nextWhitespace` / `nextDot` arrays, reusing the
  existing `buildNextIndex(predicate)` reverse-scan machinery.
- Per whitespace-delimited run, compute the punctuation-trimmed end once;
  return `null` in O(1) when `nextDot[index] >= trimmedEnd`.
- Only candidates that still hold a dot run the current `trimAutoLinkEnd`, so
  the bracket semantics are preserved exactly.
- Thread `getScanIndex` into `parseAutoLinkAt` (it is the only inline matcher
  that does not receive it yet).
- Keep the legacy matcher as a **test-only** oracle. Do not add a production
  export whose only reason is testing.

### Test list

- Existing semantics: HTTP and HTTPS; every boundary (line start, whitespace,
  `(`, `[`, `{`, `"`, `'`); boundary not satisfied; termination at space, tab
  and newline; trailing `[.,:;!?]`; balanced `()` and overclosed `)`.
- Reject-path regression corpus: `"(http://x".repeat(k)` and the `{`/`[`/`"`/`'`
  variants — assert zero autolinks and that the original text is preserved.
- Differential fuzz against the legacy oracle, added **before** the
  optimization so it is green on the current implementation and acts as the
  safety net. Compare the full `parseMboxDocument` AST.
- Edge cases: `\r`, `\r\n`, U+2028, U+2029; bare `http://`; `http://.`;
  trailing punctuation that trims away the only dot; a dot in the URL body with
  an overclosed `)`; emoji before and after the URL (UTF-16 offset integrity).
- Performance: separate cases for "fails the scheme guard" and "clears
  scheme and boundary but fails the dot check", with generous wall-clock
  ceilings rather than a tight single-point measurement.

### Completion commands

`npm run typecheck && npm test`

## Section 11: Give decoration errors plugin provenance

`MboxDecorationError.pluginName` and `.specs` are declared but never set, and
the provider phase passes neither `spec` nor any identifier, so a host cannot
tell which plugin failed — defeating the documented purpose of
`onDecorationError`.

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

Review caught a real defect: a host `onDecorationError` handler that throws
was caught by the provider's try/catch and re-reported as `phase: "provider"`,
carrying the handler's own exception and losing that provider's remaining valid
specs. Reproduced, then fixed and pinned. Verified after the fix: one correctly
classified `lowering` error, later handlers still notified, the provider's
valid spec still rendered, the following provider still processed.

Full suite 1361 passed, demo 9, package smoke OK, knip clean, layout 517.

### Design decisions

- Give the facet an entry type instead of a bare provider, and register it
  with the index of the plugin **in the array as passed**, so provenance never
  depends on the combined facet order (facet precedence can reorder it):

  ```ts
  export interface MboxDecorationProviderEntry {
    provider: MboxDecorationProvider;
    pluginName?: string;
    pluginIndex?: number;
  }
  ```

- `createMboxExtension` builds entries with `plugins.map((plugin, i) => ...)`
  and then drops the ones without `decorations`, so entry count and plugins
  length deliberately differ and `pluginIndex` can have gaps. That is the
  point: it reconstructs the caller's actual array position.
- Direct registration (`mboxDecorationProviders.of({ provider })`) leaves both
  `pluginName` and `pluginIndex` undefined. Not `-1` — a number there invites
  being used as an index.
- Rejected: a second facet carrying provenance alongside the bare one. Two
  facets means two combine orders and two precedence rules, so behaviour would
  depend on which one a provider was registered through.
- Add `name?: string` to `MboxPlugin`. Name every builtin that carries
  `decorations`, using the notation that owns the meaning rather than the file
  location: `mbox/heading`, `gfm/code-block-highlight`,
  `scrapbox/inline-code-highlight`. Not `kit/...` — that leaks an
  implementation detail into a public id. Pin uniqueness with a test over the
  plugin objects each default bundle actually registers, not over files:
  `decorations:` appears 54 times across 46 files because some factories
  return derived plugins.
- `MboxDecorationError` becomes `{ phase, error, pluginName?, pluginIndex?,
  spec? }`; drop `specs`.
- Do **not** put the `MboxPlugin` reference on the error: it carries
  `extensions`, a `theme` and closures, so it would blow up or cycle when an
  error tracker serializes it, and would keep the plugin alive through the
  error object.
- Build the `RangeSet` once at the end, as today. "Lower per provider" means
  keeping each provider's specs unmixed so its provenance stays attached — not
  building a `DecorationSet` per provider. Add an internal
  `appendMboxDecorationRangesSafe(state, specs, ranges, provenance, onError)`;
  `createMboxDecorationSetSafe` keeps its signature and calls it without
  provenance. Leave strict lowering untouched, so `validateDecorationSpecs`
  (public, via `@synpuls/mbox/testing`) is unaffected.
- Fix the JSDoc at `plugin.ts:112`, which contradicts the code: it claims the
  affected plugin's whole output is dropped, but lowering drops only the
  offending spec and keeps that plugin's valid ones. Keep the behaviour —
  isolating one broken spec is better recovery than discarding good ones — and
  state both granularities: a provider throw loses that provider's output for
  the update, a lowering failure loses only that spec.
- `scripts/bench-parser.ts` imports the facet from the root barrel and calls
  bare providers; migrate it to the entry shape.
- Drop `mboxDecorationProviders` and `MboxDecorationProviderEntry` from
  `src/index.ts`. This was going to wait for Section 12, but shipping a public
  API that changes shape one section later is worse than never publishing it:
  the facet appears in no doc, and the ~30 tests that read it import from
  `editor/plugin.js` directly, so nothing outside the barrel is affected.
- Isolate each `onDecorationError` handler in its own try/catch and swallow
  what it throws, and say so in the JSDoc. Otherwise a handler that throws
  during lowering is caught by the provider's catch and re-reported as
  `phase: "provider"` — a phantom error carrying the handler's own exception,
  which also loses that provider's remaining valid specs. Scope the provider
  try/catch to the `provider(context)` call alone. Rejected: rethrowing via
  `queueMicrotask`, which protects rendering but turns a contained failure
  into an uncaught global error.

### Test list

1. Provider throw on a named plugin: `{ phase: "provider", error, pluginName,
   pluginIndex }`.
2. Lowering failure on a named plugin: carries `spec` plus the same provenance.
3. One provider returning valid, broken, valid: exactly one error, both valid
   specs still render.
4. Unnamed plugin: `pluginName` undefined, `pluginIndex` still correct, for
   both phases.
5. One failing plugin among several: the healthy ones still render.
6. Plugins without `decorations` in the array: `pluginIndex` is the original
   array position, e.g. `1` for `[keymapOnly, brokenDecoration]`.
7. Direct facet registration: renders, and on failure both provenance fields
   are undefined.
8. The facet holds `{ provider, pluginName, pluginIndex }` with the array
   position preserved.
9. Precedence independence: reordering via `Prec.high`/`Prec.low` does not
   change the reported `pluginIndex`.
10. Two `createMboxExtension` calls in one state: each numbers from 0, and that
    is the specified behaviour rather than a bug.
11. Every builtin with `decorations` has a `name`, and names are unique within
    each notation bundle.
12. Public surface: the root export test and package smoke still pass.

### Completion commands

`npm run typecheck && npm test && npm run test:demo && npm run test:layout && npm run test:package`

## Section 12: Trim the public surface

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

Review caught two guards that guarded nothing. The subpath entry in
`public-surface.test.ts` imported from `mbox/scrapbox`, which `tsconfig` paths
never map, so its `@ts-expect-error` was absorbing TS2307 "cannot find module"
rather than "not exported" — re-exporting the type would not have failed it.
And the package-smoke additions asserted `!(name in root)` for nine names of
which eight are type-only, so they can never be present at runtime and the
assertions always passed. Both are fixed: the fixture imports `./scrapbox.js`,
and the smoke test now typechecks a `public-surface.ts` inside the installed
consumer, which exercises the real exports map and `.d.ts` for both the root
and the subpath.

Guard verification (per the practice this section adds to TESTING.md):

- Invariant: `ScrapboxInlineOptions` is not reachable from `mbox/scrapbox`.
  Mutation: restored the interface in `inline.ts` and re-exported it from
  `scrapbox.ts`. Red: `npm run typecheck`, TS2578 at `public-surface.test.ts:23`.
- Invariant: `createDocumentCache` is not importable from the package root.
  Mutation: re-exported it from `src/index.ts`. Red: `npm run test:package`.

Full suite 1358 passed, demo 9, package smoke OK (including the installed
consumer typecheck), knip clean, layout 517.

### Design decisions

- `blockParsers` goes away entirely rather than staying public: `parseMboxDocument`
  loses its second parameter and `ParseMboxDocumentOptions` is deleted. Keeping it
  public would freeze a half-finished contract — a block-parser seam that works
  only when you call the parser yourself and never through an editor. Nothing but
  `parser.extension.test.ts` passes it today, so that test goes too. When the
  editor really needs pluggable parsing, design it as a facet or `StateField`
  that swaps the per-state parser and cache together; adding a second parameter
  back at that point is backward compatible.
- `MboxBlockParser`, `MboxBlockParserContext` and `MboxBlockParseResult` stay in
  `types.ts` and only lose their root export — they still annotate the builtin
  `parseCodeBlockAt` and `parseTableAt`. Inlining them would not shrink the public
  surface any further, just make the builtin contract harder to read.
- `activeLine` installs `highlightActiveLine()` **and**
  `highlightActiveLineGutter()`, dropping the hidden dependency on
  `debugLineNumbers`. The gutter helper is a `gutterLineClass` extension that only
  adds `cm-activeLineGutter` to the active line; it creates no gutter of its own,
  so it is inert when the host has not added one.
- Hosts that want line numbers pass `lineNumbers()` as an ordinary extension. The
  two demos and the layout fixture do exactly that; the fixture keeps its existing
  query parameters, with the full setup still showing numbers and `setup=minimal`
  still not.
- `parseScrapboxInline(text, base?)` loses its options parameter and delegates to a
  private `parseScrapboxInlineNested(text, base, nested)`. `InlineMatcher.create`
  narrows to `(raw, from)` and the two recursive call sites invoke the private
  helper directly, so the recursion guard never appears in a public type.
- The cache-entry accessors stay private. Builtins can reach `{ input, document }`
  and third-party plugins cannot; that asymmetry is acceptable because
  `state.doc.sliceString(from, to)` covers the realistic cases. If a real need
  appears, add `getXxxDocumentSnapshotFromState(state): { input, document }` with
  an anonymous structural return type — that serves the use case without making
  `DocumentCacheEntry` or `createDocumentCache` public.
- Pin the removals with `@ts-expect-error` in a new `src/public-surface.test.ts`.
  It rides the co-location convention, is collected by the vitest `unit` project,
  and is unreachable from `tsconfig.build.json` so it never reaches the `.d.ts`.
  The guard runs both ways: if a removed name is exported again, the directive
  goes unused and typecheck fails with TS2578. Cover `MboxPluginsOptions`,
  `ParseMboxDocumentOptions`, the three block-parser types, `createDocumentCache`,
  `DocumentCache`, `DocumentCacheEntry`, and `debugLineNumbers`. The last one is a
  property rather than an export, so assert it through an excess-property check
  inside an `if (false)` block — the type error is what matters, not running it.
- Fix the comments that tell plugin authors to build their own
  `createDocumentCache(parse)` — `src/editor/plugin.ts`, `src/testing.ts`,
  `src/index.ts` and `vite.config.ts`. They become false the moment the symbol
  stops being public, so they belong in this commit, not in Section 15. Point
  them at the matching `getXxxDocumentFromState` instead. The comments inside
  `src/editor/document-cache.ts` and each namespace's `parser-cache.ts` describe
  internal implementation and stay as they are.
- Extend `scripts/package-smoke.mjs` to assert the removed names are not
  importable from the built package. The type fixture guards the source alias;
  the smoke test guards the actual artifact.
- Also drop `createDocumentCache`, `DocumentCache` and `DocumentCacheEntry` from
  the root barrel: cache construction is internal. Safe for the type closure —
  the accessors that return `DocumentCacheEntry<T>`
  (`getHatenaDocumentCacheEntryFromState`, `getScrapboxDocumentCacheEntryFromState`)
  are not exported from any entry point.
- **Keep** `getMboxDocumentFromState` and each subpath's
  `getXxxDocumentFromState`: ~100 call sites make them the standard way a
  plugin reaches the parsed document, and removing them would force
  third-party plugins to reparse.
- Remove the `MboxPluginsOptions` alias; `MboxPluginOptions` is the one name
  (I6). There is no published version to stay compatible with.
- Make `ScrapboxInlineOptions.nested` internal — `parseScrapboxInline` keeps a
  public signature and delegates to a private recursive helper (I8).
- Remove `debugLineNumbers` from the public option types (I9). `activeLine`
  installs both `highlightActiveLine()` and `highlightActiveLineGutter()` so it
  no longer depends on it; demos and the layout fixture inject `lineNumbers()`
  as an ordinary extension.
- No compatibility aliases and no deprecated re-exports: this is a rename
  before the first publish, so migrate completely.
- Already done in Section 11: `mboxDecorationProviders` and
  `MboxDecorationProviderEntry` are out of the root barrel.

### Completion commands

`npm run typecheck && npm test && npm run test:demo && npm run test:layout && npm run test:package && npm run knip`

Also run `npm run build` and confirm the removed names are gone from
`dist/index.d.ts`.

## Section 13: Unify the notation option contract

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

Guard verification (per TESTING.md):

- Invariant: the bundle forwards `link`/`image` to their plugins. Mutation:
  dropped the argument (`pageLinkPlugin()`, `markdownImagePlugin()`). Red: the
  mbox bundle link and image DOM tests.
- Invariant: `codeHighlight` is opt-in and its object form reaches the loader.
  Mutations: removed the conditional; ignored the options object. Red: the
  true/17-count tests, and the Ruby dynamic-loader test respectively.
- Invariant: all three Scrapbox resolvers reach the link plugin. Mutation:
  dropped each one individually. Red: the Scrapbox link forwarding test, each
  time.
- Invariant: the old keys are gone from the public types. Mutation: restored
  `pageLink` alone. Red: `npm run typecheck`, TS2578 at exactly one line —
  confirming the per-key guards are independent, which is why they are written
  as five separate directives rather than one object.

Full suite 1361 passed, demo OK, package smoke OK, knip clean, layout 517.

### Design decisions

- Field names change; **type names stay as they are**. Renaming the types
  would only add churn across the barrel and every reference.

  ```ts
  mboxPlugins({
    link: PageLinkPluginOptions,        // was `pageLink`
    image: MarkdownImagePluginOptions,  // was `markdownImage`
    codeHighlight: true | CodeBlockHighlightPluginOptions,  // new (I4)
    complete: MboxCompletePluginOptions,
  })

  scrapboxPlugins({
    link: ScrapboxLinkPluginOptions,    // was flat pageUrl/iconUrl/pageExists
    // image / codeHighlight / inlineCodeHighlight / complete / formula /
    // titleLine unchanged
  })
  ```

- `iconUrl` belongs under `link`, not `image`: both the Scrapbox `.icon` and
  the mbox icon render *a page link* as an icon, and the link plugin owns the
  anchor target.
- GFM and Hatena already have the target shape and stay as they are.
- Out of scope: the low-level `scrapboxLinkPlugin({ pageUrl, iconUrl,
  pageExists })` signature and the completion candidate's `iconUrl` — both stay
  flat.
- Change the types first and use the typechecker as the migration list. No
  `as any`, no assertions, no silencing by string search.

- The mbox highlighter goes immediately after `codeBlockPlugin()`; the overall
  plugin order does not change. Nothing in the history or the comments explains
  why mbox puts its code block near the end while GFM puts it first, and moving
  it would change how decorations and themes compose — out of scope here. No new
  plugin is needed either: `codeBlockHighlightPlugin()` is already public, so
  this is only wiring plus the same `getXxxCodeHighlightOptions` helper the other
  three notations have.
- The demos already append `codeBlockHighlightPlugin()` by hand
  (`demos/demo.ts:94`, `demos/layout-fixture.html:63`), which is the evidence
  that this option was missing. Both collapse into `codeHighlight: true`.
- `demos/layout-fixture.html` is outside typecheck, so migrate it explicitly.
  Only the **values** in `pluginsByMode` change — the mode keys are the query
  contract that `tests/layout/mbox/image-preview.spec.ts`,
  `tests/layout/mbox/focus-stability.spec.ts` and `tests/layout/kit/helpers.ts`
  select by name, so they stay put and no layout spec needs touching.
- Drop the "Shared by the link and (later) completion plugins" note from the
  Scrapbox `iconUrl` JSDoc: completion never received it. Let
  `ScrapboxLinkPluginOptions` hold the real documentation, keep the full
  `pageExists` contract on its type alias, and leave `ScrapboxPluginsOptions.link`
  a one-liner rather than restating the three fields.
- Pin the old keys as gone in `src/public-surface.test.ts`, one
  `@ts-expect-error` **per key** — never one object holding all of them. With a
  single object, wrongly restoring one key still leaves the others erroring and
  the guard passes. Excess-property checking does fire on an all-optional type
  for a fresh object literal, and `satisfies` is preferable to an annotation
  because it does not widen the value.
- Leaving the Hatena and Scrapbox `codeHighlight` count tests asymmetric is
  fine for 0.1.0. Covering the paths this section actually changes is what
  matters; broadening untouched notations is a 0.1.x follow-up.

### Test list

- mbox forwards `link` and `image` to the right plugins.
- mbox `codeHighlight`: omitted or false keeps 16 plugins, true or an object
  gives 17 (`src/package-entry.test.ts` pins this count).
- GFM / Hatena / Scrapbox `codeHighlight` contracts do not regress.
- Scrapbox resolvers can all be passed through `link` at once.
- Representative root and namespace imports still typecheck.

### Completion commands

`npm run typecheck && npm test && npm run test:demo && npm run test:layout && npm run test:package`

## Section 14: Colour code tokens by default

`codeHighlight` emits `tok-*` classes through `classHighlighter`, but no theme
under `src/themes/` styles them, so enabling it renders no colour at all — and
the option itself is documented nowhere.

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

The adversarial second review round found two more hollow tests. `toMatchObject`
tolerates extra properties, so the colour-group assertion would have passed even
if `textDecoration: "underline"` were added to the link group — leaving the one
thing that distinguishes `tok-string2` from `tok-url` unverified. And the
two-class test only checked `keyword` and `url`/`link`, so dropping the inline
class from any other group went unnoticed. Both are now pinned, and both
mutations were confirmed red.

Guard verification (per TESTING.md):

- Invariant: the link colour group carries no underline. Mutation: added
  `textDecoration: "underline"` to it. Red: two shared-spec unit tests.
- Invariant: with two token classes, every group emits both selectors. Mutation:
  dropped the inline class from the comment group alone. Red: the shared-spec
  unit test.
- Invariant: each notation composes the shared spec. Mutation: removed the GFM
  composition. Red: `gfm-presentation.test.ts`.
- Invariant: the palette only applies through an opt-in presentation theme.
  Mutation: emitted the rules even for `presentation: { notation: false }`. Red:
  the isolated DOM test.

Full suite 1370 passed, demo OK, package smoke OK, knip clean.

Layout is 516/1 — `tests/layout/mbox/image-preview.spec.ts:266` fails, but it
fails at HEAD too and is unrelated to this work; it is fixed in its own commit.

### Design decisions

- `codeTokenPresentationThemeSpec(tokenClassNames: readonly string[])` takes an
  array because Scrapbox has two token classes — one for code blocks and one for
  inline code. It follows `heading-presentation.ts`, which is already the
  precedent for a theme fragment several notations compose in.
- Ten variables, notation-agnostic: `--mbox-code-token-keyword-color` through
  `--mbox-code-token-invalid-color`. There is no reason for the same language
  token to be one colour under GFM and another under Scrapbox, and five parallel
  sets would be a needlessly large CSS contract. Groups that happen to share a
  default still get their own variable — and splitting one later is not a
  breaking change anyway, since it can nest:
  `var(--mbox-code-token-inserted-color, var(--mbox-code-token-string-color, #50a14f))`.
- Colour `tok-string2` with the link group but underline only `tok-url` and
  `tok-link`.
- **Change the comment default to `#6a737d`.** The demo's `#a0a1a7` measures
  2.576:1 against white — below even the 3:1 large-text floor, let alone AA's
  4.5:1. `#6a737d` is 4.815:1 and still reads as muted.
- The rest of the Atom One Light values carry over unchanged, and it is worth
  being precise about what that means: `type` (3.197), `string` (3.205),
  `invalid` (3.667), `name-alt` (4.049) and `link` (4.177) all sit under AA's
  4.5:1 for normal text. That is ordinary for a syntax palette — GitHub Light,
  VS Code Light and Atom One Light are all in this range — and forcing every
  token above 4.5:1 would produce a muddy, unconventional theme. Only `#a0a1a7`
  was an outlier worth fixing. **Section 15 must not claim WCAG compliance for
  the palette**; it should say the defaults are tuned for a light background and
  that every value is overridable.
- Delete the shared palette from `demos/styles.css`, including the five
  duplicated GFM rules further down. Its `#editor` selectors outrank anything
  `EditorView.theme()` emits, so leaving them would mask the new theme and make
  it impossible to show it works.
- Add `scrapboxDefaultPresentationTheme()` to the fixture's
  `scrapboxInlineCodeHighlight` mode and make
  `tests/layout/scrapbox/inline-code-highlight.spec.ts` actually check a colour.
  Its middle test is named "keeps token colors" but only asserts text and count
  — the fifth hollow test this review has turned up.
- `tests/layout/gfm/playground.spec.ts:181` hard-codes the comment colour. After
  the palette is deleted it stops pinning demo CSS and starts pinning the
  theme's default, which is the better guard; note in it that a deliberate
  change to the fallback means updating the expectation.
- Existing colour tests keep passing: both read from demo pages, and all three
  demos already add their own presentation theme (`demos/demo.ts:97`,
  `demos/gfm-main.ts:148`, `demos/scrapbox-demo.ts:232`). Only the source of the
  colour changes. Fixture-based token tests assert presence, not colour.

### Completion commands

`npm run typecheck && npm test && npm run test:demo && npm run test:layout && npm run test:package`

## Section 15: Align the documentation with the shipped API

- [x] Two-round design consultation
- [x] TDD implementation and verification
- [x] Two-round completion review
- [x] Root code review
- [x] Implementation committed

Both review rounds found real inaccuracies in the security wording, and the
second round found more than the first — the opaque-resolver list was missing
Scrapbox's `image: { resolveSrc }`, then also the mbox and Scrapbox
completion-candidate `iconUrl`, and it named only GFM and mbox for unchecked
document image URLs when Scrapbox belongs there too. Codex's own list was
imprecise in the other direction: it counted Scrapbox image click links as
unchecked, but the parser constrains those to `https?://`. A security document
that overstates the danger is as wrong as one that understates the defence, so
the bullet now separates host-supplied values, unchecked document image URLs,
and the paths that genuinely are checked.

Guard verification (per TESTING.md):

- Invariant: the public option types reject `notation`. Mutation: added
  `notation?: string` to `MboxPluginOptions`. Red: `npm run typecheck`, TS2578
  at `public-surface.test.ts:42`.

Full suite 1370 passed, demo OK, package smoke OK, knip clean, build OK.

Layout is 517 across three engines, but `focus-stability.spec.ts:121` still
fails occasionally under full-suite load even after the `waitForURL` fix — it
passed 60/60 in isolation and 2 of 3 recent full runs. The remaining failure
looks like the 10s per-test timeout rather than a missing wait. Left for 0.1.x.

### Design decisions (settled)

- Keep it lean. `codeHighlight` and the token variables go in the guide only,
  four to six lines, naming the `--mbox-code-token-*-color` convention with one
  example rather than listing all ten. No duplicate in the README.
- **Do not claim WCAG compliance.** Six of the ten defaults sit under AA for
  normal text (see Section 14). Say the palette suits a light background and
  that every colour is overridable.
- Write the superlinear and memory notes as mbox's own measured behaviour and
  name the dependency path once — no upstream link. The wording that documents
  this upstream lives in micromark's GitHub README but *not* in the readme
  shipped with `micromark@4.0.2`, which says only "This package is safe".
  Citing a document that varies by version would age badly, and we have our own
  numbers.
- `doccheck` tooling — typechecking guide examples against the packed `.d.ts`,
  and a grep-based `check-docs.mjs` — is worth building but not days before the
  first publish. It goes to 0.1.x. What does go in now is one cheap guard in
  the existing `src/public-surface.test.ts` fixing the I1 *type* surface: pin
  that the public option types reject `notation`. The JSDoc prose itself stays
  review-guarded.

### Checklist

- [ ] Remove the `notation` option from the `createXxxEditorState` JSDoc in
      `src/{gfm,hatena,scrapbox}.ts` — it ships in the published `.d.ts`, so the
      example does not compile.
- [ ] Add the I7 note to `presentation.notation?: false`: notation themes take
      no parameters, so it is an off switch only.
- [ ] Correct README and SECURITY.md to the real nesting: `image: { renderMode }`
      and `codeHighlight: { languages }`.
- [ ] SECURITY.md: drop `linkUrl` from the opaque list — it is revalidated
      against the allowlist. Only `pageUrl`, `iconUrl` and `idUrl` are opaque.
- [ ] SECURITY.md: replace the "linear" claims with mbox's own measurements,
      naming the `mdast-util-from-markdown` / micromark path once.
- [ ] SECURITY.md: separate the image case from notation-derived URLs — image
      `src` never passes a scheme check.
- [ ] SECURITY.md: note that inline parsing allocates scan indexes proportional
      to the input block (~13 B/char), released after the parse.
- [ ] Reframe `readOnly` in README and guide as a non-editing, always-rendered
      display mode, explicitly not a security boundary. Keep the existing
      explanation of how it differs from CodeMirror's own `EditorState.readOnly`.
- [ ] guide: supported API is every symbol the five entry points export.
- [ ] README status line: package exports are the supported API.
- [ ] CONTRIBUTING heading: "Package exports = package contract".
- [ ] README: make the SECURITY.md link an absolute GitHub URL — it is not in
      the tarball.
- [ ] guide: one line on `MboxPlugin.name` feeding `onDecorationError`.
- [ ] guide: soften "every default value has one" — some defaults are literals.
- [ ] guide: the short `codeHighlight` and token-variable section.
- [ ] `src/public-surface.test.ts`: guard that `notation` is not an option.

### Superseded

- I1: the `createXxxEditorState` JSDoc in `src/{gfm,hatena,scrapbox}.ts` points
  at a `notation` option that does not exist. It ships in the published
  `.d.ts`, so the example would not compile.
- D2: `renderMode` and `languages` are nested (`image: { renderMode }`,
  `codeHighlight: { languages }`), not top-level as README and SECURITY.md
  imply.
- D3: only `pageUrl`, `iconUrl` and `idUrl` are opaque. GFM's `linkUrl` return
  value **is** revalidated against the allowlist and the permanent denylist.
- D4: define supported API as everything in the root and subpath `exports`,
  matching CONTRIBUTING rather than the guide's much narrower claim.
- Drop "Parsing is designed to be linear": the GFM notation delegates to
  micromark, whose emphasis and link delimiter handling is superlinear on
  unclosed runs. State this in SECURITY.md and link micromark's own Security
  section, which documents it and delegates input caps and worker execution to
  embedders.
- Reframe `readOnly` as a **non-editing, always-rendered display mode**, not an
  untrusted-document viewer, and say plainly that it is not a security
  boundary — no size limit, CPU isolation, URL/network policy or worker.
- Split the image claim: GFM links have an allowlist, but image URLs
  (`gfm/image.ts`, `mbox/markdown-image.ts` → `image-kit.ts`) and host resolver
  return values are the host's CSP/URL policy responsibility.
- Document `codeHighlight` and the token variables from Section 14.
- I7 JSDoc only: explain that `presentation.notation` is an off switch because
  notation themes take no parameters. Widening it to `boolean` is a
  non-breaking change and stays out of 0.1.0.
- Make the README's `./SECURITY.md` link an absolute GitHub URL — it is not in
  the npm tarball.
- Document in SECURITY.md that inline parsing allocates temporary scan indexes
  proportional to input length for specific inline constructs such as autolink
  candidates. They are released when parsing finishes, but peak memory grows
  with a single input block; applications accepting untrusted or very large
  documents should enforce input-size limits. This may be combined with the
  planned superlinear GFM/micromark section.

### Completion commands

`npm run typecheck && npm run test:all && npm run knip`

## Release checklist (after Section 15)

- [ ] `npm run build`, then confirm `dist/index.d.ts` matches the intended surface
- [ ] `npm pack --dry-run` and review the tarball contents
- [ ] `npm publish --dry-run`
- [ ] Make the repository public
- [ ] Enable Pages (Settings → Pages → Source = GitHub Actions) and confirm the deploy
- [ ] Verify over HTTP: the README hero image and all four demo links
- [ ] `npm publish`
- [ ] Tag `v0.1.0`
- [ ] Revoke the old GitHub Packages PAT
