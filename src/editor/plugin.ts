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
 * the line start (`to` is unused).
 */
export interface MboxLineDecorationSpec {
  type: "line";
  from: number;
  to: number;
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
  to: number;
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
   * threw, or returned a spec violating a CodeMirror constraint) instead of
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
 * violates a CodeMirror constraint (e.g. an empty mark range) throws here,
 * exactly as it would in production, so a unit test that runs specs through
 * this function catches what raw spec assertions alone cannot.
 */
export function createMboxDecorationSetStrict(state: EditorState, specs: MboxDecorationSpec[]) {
  return Decoration.set(
    specs.flatMap((spec) => createDecorationRanges(spec, state)),
    true,
  );
}

/** @deprecated Use {@link createMboxDecorationSetStrict} (or {@link createMboxDecorationSetSafe} for live use). */
export const createMboxDecorationSet = createMboxDecorationSetStrict;

/**
 * A recoverable failure while turning plugin output into live decorations.
 * "provider" means a plugin's own `decorations()` function threw; "lowering"
 * means a spec it returned violates a CodeMirror decoration constraint (e.g.
 * an empty mark range). Passed to `createMboxExtension`'s `onDecorationError`.
 */
export interface MboxDecorationError {
  phase: "provider" | "lowering";
  error: unknown;
  spec?: MboxDecorationSpec;
  pluginName?: string;
  pluginIndex?: number;
}

/**
 * Like {@link createMboxDecorationSet}, but a spec that violates a CodeMirror
 * constraint (e.g. an empty mark range) is dropped instead of throwing --
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
  return Decoration.set(ranges, true);
}

/**
 * Build a `replace` spec, handling the empty-range case a plugin author would
 * otherwise have to remember themselves (the class of bug that crashed
 * table-kit's empty table cells and gfm's marker-only list items): a
 * non-empty range replaces normally; an empty range with a widget renders
 * that widget as a point instead (same visual result, no invalid range); an
 * empty range with no widget has nothing to show, so it drops entirely.
 */
export function createReplaceSpec(from: number, to: number, widget?: WidgetType): MboxDecorationSpec[] {
  if (from < to) {
    return [{ type: "replace", from, to, widget }];
  }
  if (widget) {
    return [{ type: "widget", from, to: from, widget }];
  }
  return [];
}

/**
 * Build a `mark` spec, dropping it when the range is empty instead of letting
 * CodeMirror throw "Mark decorations may not be empty" -- unlike
 * {@link createReplaceSpec}, an empty mark has no content to style, so there
 * is no widget fallback: `[]` is the only sensible result.
 */
export function createMarkSpec(
  from: number,
  to: number,
  className: string,
  attributes?: Record<string, string>,
  inclusiveStart?: boolean,
  inclusiveEnd?: boolean,
): MboxDecorationSpec[] {
  if (from >= to) {
    return [];
  }
  return [
    {
      type: "mark",
      from,
      to,
      className,
      ...(attributes ? { attributes } : {}),
      ...(inclusiveStart ? { inclusiveStart } : {}),
      ...(inclusiveEnd ? { inclusiveEnd } : {}),
    },
  ];
}

/**
 * Like {@link createMarkSpec}, but for a mark that represents the FULL styled
 * content of a span (a list item's body, emphasis/strong content, etc.) --
 * one that may fully or partially coincide with an embedded widget/replace
 * decoration (a link, image, checkbox...). Always sets inclusiveStart and
 * inclusiveEnd, so CodeMirror nests the coincident widget inside this mark's
 * DOM element instead of splitting it out as a sibling -- which would
 * silently drop the mark's own styling from that widget's content. Narrow
 * marks that only ever style a fixed syntax fragment (a footnote marker, a
 * heading's hidden `#`, ...) should keep using {@link createMarkSpec} plain,
 * since they never have this coincidence to worry about.
 */
export function createContentMarkSpec(from: number, to: number, className: string): MboxDecorationSpec[] {
  return createMarkSpec(from, to, className, undefined, true, true);
}

/** Build a `widget` spec. Never empty by construction; provided alongside
 * {@link createReplaceSpec}/{@link createMarkSpec} for symmetry. */
export function createWidgetSpec(pos: number, widget: WidgetType, side?: number): MboxDecorationSpec[] {
  return [{ type: "widget", from: pos, to: pos, widget, ...(side !== undefined ? { side } : {}) }];
}

const mboxDecorationErrorHandlers = Facet.define<(error: MboxDecorationError) => void, Array<(error: MboxDecorationError) => void>>({
  combine: (handlers) => [...handlers],
});

const mboxDecorations = EditorView.decorations.of((view) => {
  const providers = view.state.facet(mboxDecorationProviders);
  if (providers.length === 0) {
    return Decoration.set([], true);
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
  return Decoration.set(ranges, true);
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

type MboxDecorationContextSource = Pick<EditorView, "state"> & { hasFocus?: boolean };

function createMboxDecorationContext(view: MboxDecorationContextSource): MboxDecorationContext {
  return {
    state: view.state,
    activeLineNumbers: getActiveLineNumbersFromView(view),
  };
}

function createDecorationRanges(spec: MboxDecorationSpec, state: EditorState) {
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
  const lastLine = state.doc.lineAt(Math.max(spec.from, spec.to)).number;
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
