import { EditorState, type EditorStateConfig, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentOnInput } from "@codemirror/language";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import type { MboxThemeSpec } from "./plugin.js";
import { createMboxExtension, type MboxDecorationError, type MboxPlugin } from "./plugin.js";
import { mboxPlugins, type MboxPluginOptions } from "../plugins/mbox/default.js";
import { mboxDefaultPresentationTheme } from "../themes/default-presentation.js";

export interface CreateEditorStateOptions {
  /** Highlights the focused line's background and, when a host adds a gutter,
   * its gutter entry. Off by default. */
  activeLine?: boolean;
  /** Accessible name for the editable textbox. Defaults to `Text editor`. */
  ariaLabel?: string;
  doc?: string;
  extensions?: Extension[];
  /** Read-only viewer mode: rejects edits (`EditorState.readOnly`) AND drops
   * `contenteditable` (`EditorView.editable` off), so the editor never takes
   * focus and every line always shows its rendered form -- raw syntax never
   * appears. Text stays selectable and copyable. `EditorState.readOnly`
   * alone is NOT this: the editor would still take focus on click and reveal
   * the focused line's raw syntax. Off by default. */
  readOnly?: boolean;
  selection?: EditorStateConfig["selection"];
}

export interface CreateEditorViewOptions {
  parent: HTMLElement;
  state: EditorState;
}

export interface MboxEditorPresentationOptions {
  container?: false | EditorPresentationThemeOptions;
  /** Notation themes take no parameters, so this is an off switch only. */
  notation?: false;
}

export type MboxEditorPresentation = false | MboxEditorPresentationOptions;

export interface SharedMboxEditorOptions {
  /** Highlights the focused line's background and, when a host adds a gutter,
   * its gutter entry. Off by default. */
  activeLine?: boolean;
  /** Accessible name for the editable textbox. Defaults to `Text editor`. */
  ariaLabel?: string;
  doc?: string;
  selection?: EditorStateConfig["selection"];
  extraPlugins?: MboxPlugin[];
  extensions?: Extension[];
  onDecorationError?: (error: MboxDecorationError) => void;
  presentation?: MboxEditorPresentation;
  /** Read-only viewer mode: rejects edits (`EditorState.readOnly`) AND drops
   * `contenteditable` (`EditorView.editable` off), so the editor never takes
   * focus and every line always shows its rendered form -- raw syntax never
   * appears. Text stays selectable and copyable. `EditorState.readOnly`
   * alone is NOT this: the editor would still take focus on click and reveal
   * the focused line's raw syntax. Off by default. */
  readOnly?: boolean;
}

export type CreateMboxEditorStateOptions = SharedMboxEditorOptions & MboxPluginOptions;

export type CreateMboxEditorOptions = CreateMboxEditorStateOptions & {
  parent: HTMLElement;
};

export function createEditorState(options: CreateEditorStateOptions = {}): EditorState {
  const { activeLine = false, ariaLabel, doc = "", extensions = [], readOnly = false, selection } = options;
  const resolvedAriaLabel = ariaLabel?.trim() ? ariaLabel : "Text editor";

  return EditorState.create({
    doc,
    selection,
    extensions: [
      activeLine ? highlightActiveLineGutter() : [],
      mboxEditorSetup,
      activeLine ? highlightActiveLine() : [],
      readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
      EditorView.lineWrapping,
      structuralEditorTheme,
      ...extensions,
      EditorView.contentAttributes.of({ "aria-label": resolvedAriaLabel }),
    ],
  });
}

export function createEditorView(options: CreateEditorViewOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: options.state,
  });
}

/**
 * Shared assembly behind every namespace's own `createXxxEditorState`
 * (see {@link createMboxEditorState}, and `createGfmEditorState` /
 * `createHatenaEditorState` / `createScrapboxEditorState` in their own
 * namespace entry files): only the plugin bundle and the notation's own
 * optional presentation theme differ between namespaces, so those are the
 * only two things each caller supplies.
 */
export function createNotationEditorState(
  options: SharedMboxEditorOptions,
  plugins: MboxPlugin[],
  notationPresentationTheme: () => Extension,
): EditorState {
  const { activeLine, ariaLabel, doc, selection, extraPlugins = [], extensions = [], onDecorationError, presentation, readOnly } = options;
  const allPlugins = [...plugins, ...extraPlugins];
  const presentationExtensions = presentationExtensionsFor(presentation, notationPresentationTheme);

  return createEditorState({
    activeLine,
    ariaLabel,
    doc,
    readOnly,
    selection,
    extensions: [
      createMboxExtension({
        plugins: allPlugins,
        onDecorationError,
      }),
      ...presentationExtensions,
      ...extensions,
    ],
  });
}

export function createMboxEditorState(options: CreateMboxEditorStateOptions = {}): EditorState {
  return createNotationEditorState(options, mboxPlugins(options), mboxDefaultPresentationTheme);
}

export function createMboxEditor(options: CreateMboxEditorOptions): EditorView {
  const { parent, ...stateOptions } = options;
  return createEditorView({
    parent,
    state: createMboxEditorState(stateOptions),
  });
}

// Layout invariants only: nothing here is a visual preference, each rule
// prevents a real breakage (long raw text pushing the editor into horizontal
// overflow). Font size, padding, and sizing are visual defaults a host opts
// into via `editorPresentationTheme()` below -- monospace is deliberately NOT
// here either. Table's own scoped theme carries it because its ch-unit column
// math genuinely requires a monospace grid; code-block's own scoped theme
// also carries it, but only to keep its existing default look, not because
// its layout depends on it.
const structuralEditorTheme = EditorView.theme({
  ".cm-content": {
    boxSizing: "border-box",
    flex: "1 1 0",
    minWidth: "0",
  },
});

export interface EditorPresentationThemeOptions {
  fontSize?: string;
  padding?: string;
  minHeight?: string;
}

/**
 * Optional default editor-container presentation: comfortable font size and
 * padding, and a height that fills the parent element -- "&"'s `100%` is
 * relative, so unlike a fixed px floor it never fights an embedding context
 * (a comment box, a sidebar, ...). A host adds this to its own extensions if
 * it wants the reference look; nothing in core requires it.
 *
 * Every value here is a CSS variable with this default as its fallback (see
 * {@link editorPresentationThemeSpecFor}), so a host can retune the look from
 * a stylesheet alone, matching every namespace's own presentation theme.
 */
export const defaultEditorPresentationThemeSpec: MboxThemeSpec = {
  "&": {
    fontSize: "var(--mbox-editor-font-size, 15px)",
    minHeight: "var(--mbox-editor-min-height, 100%)",
  },
  ".cm-content": {
    padding: "var(--mbox-editor-padding, 18px)",
  },
};

/**
 * Pure spec builder behind {@link editorPresentationTheme}, exported so a
 * test can pin the function's defaults to {@link defaultEditorPresentationThemeSpec}
 * without inspecting the opaque `Extension` `EditorView.theme()` returns.
 *
 * A value the caller explicitly passes is used as a plain literal, not
 * wrapped in a CSS variable: the caller already made a deliberate choice at
 * the call site, and layering a CSS variable on top would let an unrelated
 * stylesheet silently override it. The CSS-variable escape hatch only
 * applies to the un-parameterized default. "&"'s fill-parent `minHeight` has
 * no JS override of its own, so it is always CSS-variable-wrapped.
 */
export function editorPresentationThemeSpecFor(options: EditorPresentationThemeOptions = {}): MboxThemeSpec {
  const { fontSize, padding, minHeight } = options;
  const spec: MboxThemeSpec = {
    "&": {
      fontSize: fontSize ?? "var(--mbox-editor-font-size, 15px)",
      minHeight: "var(--mbox-editor-min-height, 100%)",
    },
    ".cm-content": { padding: padding ?? "var(--mbox-editor-padding, 18px)" },
  };

  // The fixed, playground-sized floor on .cm-scroller/.cm-gutters stays
  // opt-in -- a host passes it explicitly (see the demo entry points), it is
  // never assumed.
  if (minHeight !== undefined) {
    spec[".cm-scroller"] = { minHeight };
    spec[".cm-gutters"] = { minHeight };
  }

  return spec;
}

export function editorPresentationTheme(options: EditorPresentationThemeOptions = {}): Extension {
  return EditorView.theme(editorPresentationThemeSpecFor(options));
}

function presentationExtensionsFor(presentation: MboxEditorPresentation | undefined, notationPresentationTheme: () => Extension): Extension[] {
  if (presentation === false) {
    return [];
  }

  const resolved = presentation ?? {};
  const extensions: Extension[] = [];

  if (resolved.container !== false) {
    extensions.push(editorPresentationTheme(resolved.container));
  }
  if (resolved.notation !== false) {
    extensions.push(notationPresentationTheme());
  }

  return extensions;
}

const mboxEditorSetup: Extension = [
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  keymap.of([...defaultKeymap, ...historyKeymap]),
];
