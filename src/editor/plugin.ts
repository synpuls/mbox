import { Facet, Prec, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, keymap, ViewPlugin, type KeyBinding, type WidgetType } from "@codemirror/view";
import {
  clearPointerLease,
  getActiveLineNumbersFromView,
  pointerLeaseField,
  setPointerLease,
  type MboxActiveLineNumbers,
} from "./focused-line.js";

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
  /** Optional semantic element used to wrap the marked content. */
  tagName?: string;
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

/** An inactive source range whose non-owner decorations must not render. */
interface MboxDecorationFirewallRange {
  from: number;
  to: number;
}
type MboxDecorationFirewallProvider = (context: MboxDecorationContext) => MboxDecorationFirewallRange[];

export interface MboxDecorationProviderEntry {
  provider: MboxDecorationProvider;
  firewallRanges?: MboxDecorationFirewallProvider;
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
  /**
   * Internal structural ownership boundary. Its ranges suppress mark, replace,
   * and widget output from every other provider before lowering; the declaring
   * provider is exempt by provenance, not by decoration shape.
   */
  decorationFirewallRanges?: MboxDecorationFirewallProvider;
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
export function createContentMarkSpec(
  from: number,
  to: number,
  className: string,
  tagName?: string,
): MboxMarkDecorationSpec {
  return {
    type: "mark",
    from,
    to,
    className,
    ...(tagName === undefined ? {} : { tagName }),
    inclusiveStart: true,
    inclusiveEnd: true,
  };
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
  const firewallRanges = providers.flatMap((entry) => {
    if (!entry.firewallRanges) return [];
    try {
      return entry.firewallRanges(context).map((range) => ({ range, owner: entry }));
    } catch (error) {
      onDecorationError({ phase: "provider", error, pluginName: entry.pluginName, pluginIndex: entry.pluginIndex });
      return [];
    }
  });
  const ranges: ReturnType<typeof createDecorationRanges> = [];
  for (const entry of providers) {
    let specs: MboxDecorationSpec[];
    try {
      specs = entry.provider(context);
    } catch (error) {
      onDecorationError({ phase: "provider", error, pluginName: entry.pluginName, pluginIndex: entry.pluginIndex });
      continue;
    }
    appendMboxDecorationRangesSafe(
      view.state,
      filterSpecsThroughDecorationFirewall(specs, firewallRanges, entry),
      ranges,
      entry,
      onDecorationError,
    );
  }
  return createMboxDecorationSetFromRangesSafe(ranges, onDecorationError);
});

export function createMboxExtension(options: CreateMboxExtensionOptions = {}): Extension[] {
  const { plugins = [], onDecorationError } = options;
  const themeSpecs = plugins.flatMap((plugin) => (plugin.theme ? [plugin.theme] : []));
  const decorationProviders = plugins.flatMap((plugin, pluginIndex) =>
    plugin.decorations
      ? [{ provider: plugin.decorations, firewallRanges: plugin.decorationFirewallRanges, pluginName: plugin.name, pluginIndex }]
      : [],
  );
  const pluginKeymaps = plugins.flatMap((plugin) => plugin.keymap ?? []);

  return [
    themeSpecs.map((theme) => EditorView.theme(theme)),
    decorationProviders.map((entry) => mboxDecorationProviders.of(entry)),
    onDecorationError ? mboxDecorationErrorHandlers.of(onDecorationError) : [],
    pointerLeaseField,
    pointerLeaseController,
    mboxDecorations,
    pluginKeymaps.length > 0 ? Prec.high(keymap.of(pluginKeymaps)) : [],
    plugins.flatMap((plugin) => plugin.extensions ?? []),
  ];
}

function filterSpecsThroughDecorationFirewall(
  specs: MboxDecorationSpec[],
  firewallRanges: readonly { range: MboxDecorationFirewallRange; owner: MboxDecorationProviderEntry }[],
  producer: MboxDecorationProviderEntry,
): MboxDecorationSpec[] {
  if (firewallRanges.length === 0) return specs;
  // A provider that declares firewall ranges owns structure, so no firewall
  // filters it -- not even another one's. Comparing entries alone was not
  // enough: registering the same plugin twice makes two entries, and each
  // one's firewall then swallowed the other's own replace, leaving the
  // discarded source visible (measured: `keepalso| gone |`).
  if (producer.firewallRanges) return specs;
  return specs.filter((spec) => {
    if (spec.type === "line" || spec.type === "lineRange") return true;
    return !firewallRanges.some(({ range, owner }) => owner !== producer && (
      spec.type === "widget"
        ? spec.from >= range.from && spec.from < range.to
        : spec.from < range.to && spec.to > range.from
    ));
  });
}

const pointerLeaseDragThreshold = 5;

interface ActivePointerLease {
  pointerId: number;
  lineNumber: number;
  startX: number;
  startY: number;
  token: number;
}

class PointerLeaseController {
  private readonly window: Window;
  private readonly leases = new Map<number, ActivePointerLease>();
  private readonly releaseTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextToken = 0;

  constructor(private readonly view: EditorView) {
    this.window = view.dom.ownerDocument.defaultView ?? window;
    view.contentDOM.addEventListener("pointerdown", this.onPointerDown, true);
    view.contentDOM.addEventListener("click", this.onClick, true);
    this.window.addEventListener("pointermove", this.onPointerMove, true);
    this.window.addEventListener("pointerup", this.onPointerUp, true);
    this.window.addEventListener("pointercancel", this.onPointerCancel, true);
    this.window.addEventListener("blur", this.onBlur);
  }

  destroy(): void {
    this.view.contentDOM.removeEventListener("pointerdown", this.onPointerDown, true);
    this.view.contentDOM.removeEventListener("click", this.onClick, true);
    this.window.removeEventListener("pointermove", this.onPointerMove, true);
    this.window.removeEventListener("pointerup", this.onPointerUp, true);
    this.window.removeEventListener("pointercancel", this.onPointerCancel, true);
    this.window.removeEventListener("blur", this.onBlur);
    for (const timer of this.releaseTimers.values()) {
      clearTimeout(timer);
    }
    this.releaseTimers.clear();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.view.state.readOnly || event.button !== 0 || !event.isPrimary) {
      return;
    }
    const target = interactionLeaseTarget(event.target, this.view.contentDOM);
    if (target === undefined) {
      return;
    }

    const lineNumber = this.view.state.doc.lineAt(this.view.posAtDOM(target, 0)).number;
    const lease = {
      pointerId: event.pointerId,
      lineNumber,
      startX: event.clientX,
      startY: event.clientY,
      token: this.nextToken += 1,
    };
    const existing = this.leases.get(lease.pointerId);
    if (existing !== undefined) {
      this.release(existing);
    }
    this.leases.set(lease.pointerId, lease);
    this.view.dispatch({ effects: setPointerLease.of({ pointerId: lease.pointerId, lineNumber }) });
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const lease = this.leases.get(event.pointerId);
    if (lease === undefined) {
      return;
    }
    if (Math.hypot(event.clientX - lease.startX, event.clientY - lease.startY) > pointerLeaseDragThreshold) {
      this.release(lease);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const lease = this.leases.get(event.pointerId);
    if (lease !== undefined) {
      this.scheduleRelease(lease);
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    const lease = this.leases.get(event.pointerId);
    if (lease !== undefined) {
      this.release(lease);
    }
  };

  private readonly onBlur = (): void => {
    for (const lease of [...this.leases.values()]) {
      this.release(lease);
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = interactionLeaseTarget(event.target, this.view.contentDOM);
    if (target === undefined) {
      return;
    }
    const lineNumber = this.view.state.doc.lineAt(this.view.posAtDOM(target, 0)).number;
    const leases = [...this.leases.values()].filter((lease) => lease.lineNumber === lineNumber);
    // Click does not expose a pointer id. It can release a lease only when
    // exactly one lease began on this line; otherwise pointerup owns cleanup.
    if (leases.length === 1) {
      this.scheduleRelease(leases[0]);
    }
  };

  private scheduleRelease(lease: ActivePointerLease): void {
    if (this.releaseTimers.has(lease.pointerId)) {
      return;
    }
    // This task runs after click dispatch and native activation.
    const timer = setTimeout(() => {
      this.releaseTimers.delete(lease.pointerId);
      this.release(lease);
    }, 0);
    this.releaseTimers.set(lease.pointerId, timer);
  }

  private release(lease: ActivePointerLease): void {
    if (this.leases.get(lease.pointerId)?.token !== lease.token) {
      return;
    }
    const timer = this.releaseTimers.get(lease.pointerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.releaseTimers.delete(lease.pointerId);
    }
    this.leases.delete(lease.pointerId);
    this.view.dispatch({ effects: clearPointerLease.of(lease.pointerId) });
  }
}

const pointerLeaseController = ViewPlugin.fromClass(PointerLeaseController);

function interactionLeaseTarget(target: EventTarget | null, contentDOM: HTMLElement): Element | undefined {
  // Use a structural check so differing DOM realms do not reject a valid target.
  if (target === null || typeof (target as { closest?: unknown }).closest !== "function") {
    return undefined;
  }
  const interaction = (target as Element).closest("a[href], [data-mbox-interaction-lease]");
  return interaction !== null && contentDOM.contains(interaction) ? interaction : undefined;
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
  const normalizedSpecs = normalizeDecorationSpec(spec, state.doc.length, state.doc);

  return normalizedSpecs.flatMap((normalizedSpec) => lowerDecorationSpec(normalizedSpec, state));
}

/** Validates coordinates and turns every input spec into zero or more specs
 * that CodeMirror can lower. Empty ranges are valid input: marks and plain
 * replacements disappear, while a replacement widget becomes a point widget. */
function normalizeDecorationSpec(spec: MboxDecorationSpec, documentLength: number, doc?: EditorState["doc"]): MboxDecorationSpec[] {
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
      if (doc?.sliceString(spec.from, spec.to).includes("\n")) {
        throw new RangeError(`Replace decorations must not span line breaks (from ${spec.from} to ${spec.to})`);
      }
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
    tagName: spec.tagName,
    attributes: spec.attributes,
    inclusiveStart: spec.inclusiveStart,
    inclusiveEnd: spec.inclusiveEnd,
  }).range(spec.from, spec.to);
}
