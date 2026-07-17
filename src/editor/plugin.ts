import { Facet, Prec, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, type KeyBinding, type WidgetType } from "@codemirror/view";
import { getActiveLineNumbersFromView, type MboxActiveLineNumbers } from "./focused-line.js";

export type MboxThemeSpec = Parameters<typeof EditorView.theme>[0];

/**
 * Style the text in the range with a class (and optional attributes).
 * `inclusiveStart`/`inclusiveEnd` claim a widget/replace decoration that
 * starts/ends at the same position as this mark's own start/end, nesting it
 * inside this mark's DOM element instead of splitting it out as a sibling
 * (CodeMirror's default when a mark and a lower-precedence decoration share
 * a boundary offset).
 */
export interface MboxMarkDecorationSpec {
  type?: "mark";
  from: number;
  to: number;
  className: string;
  attributes?: Record<string, string>;
  inclusiveStart?: boolean;
  inclusiveEnd?: boolean;
}

/**
 * Style the whole line containing `from` with a class (and optional
 * attributes). `from` may be ANY offset on the line — the renderer resolves
 * the line start.
 */
export interface MboxLineDecorationSpec {
  type: "line";
  from: number;
  className: string;
  attributes?: Record<string, string>;
}

/**
 * Hide the text in the range, optionally rendering a widget in its place.
 * The widget's own DOM carries any classes — CodeMirror does not apply a
 * class to a replace decoration.
 */
export interface MboxReplaceDecorationSpec {
  type: "replace";
  from: number;
  to: number;
  widget?: WidgetType;
}

/**
 * Render a widget at `from` without hiding any text. As with replace
 * decorations, classes live on the widget's own DOM.
 */
export interface MboxWidgetDecorationSpec {
  type: "widget";
  from: number;
  widget: WidgetType;
  side?: number;
}

/**
 * Style the whole GROUP of lines containing `from`..`to` as one container.
 * Every line in the range gets `className` (and `attributes`); the renderer
 * additionally marks the boundary lines with `${className}-first` and
 * `${className}-last`, so CSS can draw real container edges (top border /
 * radius on -first, bottom on -last, left border on all).
 *
 * Ranges may nest or overlap — each lowers independently, so a line inside two
 * ranges carries both classes. For depth-dependent styling (nested quote
 * indent), pass a CSS custom property per range via `attributes`.
 *
 * The lines themselves always remain in the layout: mbox has no primitive for
 * removing a whole line (see the Decoration.replace boundary notes in todo.md),
 * so a hidden marker line inside a range renders as an empty styled row.
 */
export interface MboxLineRangeDecorationSpec {
  type: "lineRange";
  from: number;
  to: number;
  className: string;
  attributes?: Record<string, string>;
}

export type MboxDecorationSpec =
  | MboxMarkDecorationSpec
  | MboxLineDecorationSpec
  | MboxLineRangeDecorationSpec
  | MboxReplaceDecorationSpec
  | MboxWidgetDecorationSpec;

/**
 * The per-update context shared by every decoration provider: the editor
 * state, and the 1-based line numbers whose raw syntax is revealed (the
 * selected lines while the editor has focus).
 *
 * The context is deliberately notation-agnostic. A notation plugin reads its
 * parsed document with the matching public `getXxxDocumentFromState` accessor.
 */
export interface MboxDecorationContext {
  state: EditorState;
  activeLineNumbers: MboxActiveLineNumbers;
}
export type MboxDecorationProvider = (context: MboxDecorationContext) => MboxDecorationSpec[];

export interface MboxDecorationProviderEntry {
  provider: MboxDecorationProvider;
  pluginName?: string;
  pluginIndex?: number;
}

export interface CreateMboxExtensionOptions {
  plugins?: MboxPlugin[];
  /**
   * Called for each recoverable decoration failure (a plugin's `decorations()`
   * threw, or returned a spec with malformed coordinates) instead of
   * crashing the whole `EditorView`. If a provider throws, that provider's
   * entire output for the update is dropped. If lowering one returned spec
   * fails, only that spec is dropped and the provider's other specs remain.
   * Everything else keeps rendering. Route this to your own error tracking --
   * by default these failures are silent. Exceptions thrown by this handler
   * are swallowed so a failing error reporter cannot interrupt rendering or
   * prevent the other handlers from receiving the failure.
   */
  onDecorationError?: (error: MboxDecorationError) => void;
}

/**
 * One editor feature as plain data: CodeMirror extensions, key bindings, a
 * theme fragment, and a decoration provider. Every field is a direct value —
 * build laziness, if needed, into the plugin factory function that returns
 * this object.
 */
export interface MboxPlugin {
  name?: string;
  extensions?: Extension[];
  keymap?: KeyBinding[];
  theme?: MboxThemeSpec;
  decorations?: MboxDecorationProvider;
}

export const mboxDecorationProviders = Facet.define<MboxDecorationProviderEntry, MboxDecorationProviderEntry[]>({
  combine: (providers) => [...providers],
});

/**
 * Lower a plugin-produced spec array to the same sorted `DecorationSet` a real
 * `EditorView` renders -- the ONE place spec-to-CodeMirror-decoration
 * conversion happens, shared between the live facet below and
 * `validateDecorationSpecs` (test-context.ts). Internal only: a spec that
 * violates a decoration invariant (for example reversed or out-of-bounds
 * coordinates) throws here, exactly as it would in production, so a unit test
 * that runs specs through this function catches what raw spec assertions alone
 * cannot.
 */
export function createMboxDecorationSetStrict(state: EditorState, specs: MboxDecorationSpec[]) {
  return Decoration.set(
    specs.flatMap((spec) => createDecorationRanges(spec, state)),
    true,
  );
}

/**
 * A recoverable failure while turning plugin output into live decorations.
 * "provider" means a plugin's own `decorations()` function threw; "lowering"
 * means a spec it returned violates a lowering invariant (e.g. reversed or
 * out-of-bounds coordinates). Passed to `createMboxExtension`'s
 * `onDecorationError`.
 */
export interface MboxDecorationError {
  phase: "provider" | "lowering";
  error: unknown;
  spec?: MboxDecorationSpec;
  pluginName?: string;
  pluginIndex?: number;
}

/**
 * Like {@link createMboxDecorationSetStrict}, but a spec with malformed
 * coordinates (for example reversed or out-of-bounds coordinates) is dropped
 * instead of throwing --
 * one broken spec from one plugin should not take the whole live EditorView
 * down for every subsequent update. Used by the live `mboxDecorations` facet;
 * `validateDecorationSpecs` (test-context.ts) uses the throwing variant on
 * purpose, so a broken spec still fails a unit test.
 */
export function createMboxDecorationSetSafe(
  state: EditorState,
  specs: MboxDecorationSpec[],
  onDecorationError?: (error: MboxDecorationError) => void,
) {
  const ranges: ReturnType<typeof createDecorationRanges> = [];
  appendMboxDecorationRangesSafe(state, specs, ranges, undefined, onDecorationError);
  return createMboxDecorationSetFromRangesSafe(ranges, onDecorationError);
}

/**
 * Build a mark that represents the FULL styled
 * content of a span (a list item's body, emphasis/strong content, etc.) --
 * one that may fully or partially coincide with an embedded widget/replace
 * decoration (a link, image, checkbox...). Always sets inclusiveStart and
 * inclusiveEnd, so CodeMirror nests the coincident widget inside this mark's
 * DOM element instead of splitting it out as a sibling -- which would
 * silently drop the mark's own styling from that widget's content. Narrow
 * marks that only ever style a fixed syntax fragment (a footnote marker, a
 * heading's hidden `#`, ...) do not need these inclusive boundaries.
 */
export function createContentMarkSpec(from: number, to: number, className: string): MboxMarkDecorationSpec {
  return { type: "mark", from, to, className, inclusiveStart: true, inclusiveEnd: true };
}

const mboxDecorationErrorHandlers = Facet.define<(error: MboxDecorationError) => void, Array<(error: MboxDecorationError) => void>>({
  combine: (handlers) => [...handlers],
});

const mboxDecorations = EditorView.decorations.of((view) => {
  const providers = view.state.facet(mboxDecorationProviders);
  if (providers.length === 0) {
    return createMboxDecorationSetFromRangesSafe([]);
  }

  const handlers = view.state.facet(mboxDecorationErrorHandlers);
  const onDecorationError = (error: MboxDecorationError) => {
    for (const handler of handlers) {
      try {
        handler(error);
      } catch {
        // A failing error reporter must not break rendering.
      }
    }
  };

  const context = createMboxDecorationContext(view);
  const ranges: ReturnType<typeof createDecorationRanges> = [];
  for (const entry of providers) {
    let specs: MboxDecorationSpec[];
    try {
      specs = entry.provider(context);
    } catch (error) {
      onDecorationError({ phase: "provider", error, pluginName: entry.pluginName, pluginIndex: entry.pluginIndex });
      continue;
    }
    appendMboxDecorationRangesSafe(view.state, specs, ranges, entry, onDecorationError);
  }
  return createMboxDecorationSetFromRangesSafe(ranges, onDecorationError);
});

export function createMboxExtension(options: CreateMboxExtensionOptions = {}): Extension[] {
  const { plugins = [], onDecorationError } = options;
  const themeSpecs = plugins.flatMap((plugin) => (plugin.theme ? [plugin.theme] : []));
  const decorationProviders = plugins.flatMap((plugin, pluginIndex) =>
    plugin.decorations ? [{ provider: plugin.decorations, pluginName: plugin.name, pluginIndex }] : [],
  );
  const pluginKeymaps = plugins.flatMap((plugin) => plugin.keymap ?? []);

  return [
    themeSpecs.map((theme) => EditorView.theme(theme)),
    decorationProviders.map((entry) => mboxDecorationProviders.of(entry)),
    onDecorationError ? mboxDecorationErrorHandlers.of(onDecorationError) : [],
    mboxDecorations,
    pluginKeymaps.length > 0 ? Prec.high(keymap.of(pluginKeymaps)) : [],
    plugins.flatMap((plugin) => plugin.extensions ?? []),
  ];
}

function appendMboxDecorationRangesSafe(
  state: EditorState,
  specs: MboxDecorationSpec[],
  ranges: ReturnType<typeof createDecorationRanges>,
  provenance: Pick<MboxDecorationProviderEntry, "pluginName" | "pluginIndex"> | undefined,
  onDecorationError?: (error: MboxDecorationError) => void,
) {
  for (const spec of specs) {
    try {
      ranges.push(...createDecorationRanges(spec, state));
    } catch (error) {
      onDecorationError?.({
        phase: "lowering",
        error,
        spec,
        pluginName: provenance?.pluginName,
        pluginIndex: provenance?.pluginIndex,
      });
    }
  }
}

/**
 * The final RangeSet construction is deliberately protected only for live/safe
 * lowering. Once ranges have been aggregated we cannot identify one responsible
 * spec, so report the failure without spec or plugin provenance and keep the
 * editor renderable with an empty decoration set.
 */
function createMboxDecorationSetFromRangesSafe(
  ranges: ReturnType<typeof createDecorationRanges>,
  onDecorationError?: (error: MboxDecorationError) => void,
) {
  try {
    return Decoration.set(ranges, true);
  } catch (error) {
    onDecorationError?.({ phase: "lowering", error });
    return Decoration.none;
  }
}

type MboxDecorationContextSource = Pick<EditorView, "state"> & { hasFocus?: boolean };

function createMboxDecorationContext(view: MboxDecorationContextSource): MboxDecorationContext {
  return {
    state: view.state,
    activeLineNumbers: getActiveLineNumbersFromView(view),
  };
}

function createDecorationRanges(spec: MboxDecorationSpec, state: EditorState) {
  const normalizedSpecs = normalizeDecorationSpec(spec, state.doc.length);

  return normalizedSpecs.flatMap((normalizedSpec) => lowerDecorationSpec(normalizedSpec, state));
}

/** Validates coordinates and turns every input spec into zero or more specs
 * that CodeMirror can lower. Empty ranges are valid input: marks and plain
 * replacements disappear, while a replacement widget becomes a point widget. */
function normalizeDecorationSpec(spec: MboxDecorationSpec, documentLength: number): MboxDecorationSpec[] {
  switch (spec.type) {
    case undefined:
    case "mark":
      validateDecorationPosition(spec.from, documentLength);
      validateDecorationPosition(spec.to, documentLength);
      validateDecorationRange(spec.from, spec.to);
      return spec.from === spec.to ? [] : [spec];
    case "replace":
      validateDecorationPosition(spec.from, documentLength);
      validateDecorationPosition(spec.to, documentLength);
      validateDecorationRange(spec.from, spec.to);
      if (spec.from !== spec.to) return [spec];
      return spec.widget ? [{ type: "widget", from: spec.from, widget: spec.widget }] : [];
    case "lineRange":
      validateDecorationPosition(spec.from, documentLength);
      validateDecorationPosition(spec.to, documentLength);
      validateDecorationRange(spec.from, spec.to);
      return [spec];
    case "widget":
      validateDecorationPosition(spec.from, documentLength);
      return [spec];
    case "line":
      validateDecorationPosition(spec.from, documentLength);
      return [spec];
  }
}

function validateDecorationRange(from: number, to: number) {
  if (from > to) {
    throw new RangeError(`Decoration range from ${from} must not be greater than to ${to}`);
  }
}

function validateDecorationPosition(position: number, documentLength: number) {
  if (!Number.isInteger(position) || position < 0 || position > documentLength) {
    throw new RangeError(`Invalid decoration position ${position}: expected an integer from 0 to ${documentLength}`);
  }
}

function lowerDecorationSpec(spec: MboxDecorationSpec, state: EditorState) {
  if (spec.type === "lineRange") {
    return lowerLineRange(spec, state);
  }

  if (spec.type === "line") {
    // Accept any offset on the line: tree-based parsers naturally hand out a
    // node's real offset (a nested bullet sits mid-line), while CodeMirror
    // demands the line START. Resolve the containing line here so both work.
    return [
      Decoration.line({ class: spec.className, attributes: spec.attributes }).range(
        state.doc.lineAt(spec.from).from,
      ),
    ];
  }

  return [createDecorationRange(spec)];
}

/**
 * Lower one line-range spec to a line decoration per member line, tagging the
 * boundary lines with `-first` / `-last` suffix classes.
 */
function lowerLineRange(spec: MboxLineRangeDecorationSpec, state: EditorState) {
  const firstLine = state.doc.lineAt(spec.from).number;
  const lastLine = state.doc.lineAt(spec.to).number;
  const ranges = [];

  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const className = [
      spec.className,
      lineNumber === firstLine ? `${spec.className}-first` : "",
      lineNumber === lastLine ? `${spec.className}-last` : "",
    ]
      .filter(Boolean)
      .join(" ");
    ranges.push(Decoration.line({ class: className, attributes: spec.attributes }).range(line.from));
  }

  return ranges;
}

function createDecorationRange(
  spec: Exclude<MboxDecorationSpec, MboxLineRangeDecorationSpec | MboxLineDecorationSpec>,
) {
  if (spec.type === "replace") {
    return Decoration.replace(spec.widget ? { widget: spec.widget } : {}).range(spec.from, spec.to);
  }

  if (spec.type === "widget") {
    return Decoration.widget({
      widget: spec.widget,
      side: spec.side ?? 1,
    }).range(spec.from);
  }

  return Decoration.mark({
    class: spec.className,
    attributes: spec.attributes,
    inclusiveStart: spec.inclusiveStart,
    inclusiveEnd: spec.inclusiveEnd,
  }).range(spec.from, spec.to);
}
