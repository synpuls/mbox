import { LanguageDescription, type Language } from "@codemirror/language";
import { languages as codeMirrorLanguages } from "@codemirror/language-data";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { parseCodeBlockKitFileName, parseCodeBlockKitInfoString } from "./code-block-kit.js";

// Dynamically loads a code block's highlight language from CodeMirror's full
// @codemirror/language-data registry (~140 languages, each fetched via a
// dynamic import only when actually used), rather than the small hardcoded
// JS/TS list in code-block-kit.ts. Kept in its own file, separate from
// code-block-kit.ts, so a namespace that only wants the synchronous JS/TS
// highlighter never pulls this dependency in at all.
//
// mbox's decoration computation is synchronous, but a language's first use
// requires an async load. The resolution: `getLanguage` is a pure, synchronous
// cache read (safe to call from a decoration provider, which runs on every
// update); the `extension` (a ViewPlugin, wired into a plugin's own
// `extensions`) scans the document for code block info strings, kicks off
// `ensureLanguageLoaded` for each, and once a load resolves, dispatches an
// empty transaction to every live view -- which is enough to make
// `EditorView.decorations.of((view) => ...)`-style providers recompute and
// pick up the now-cached language.

export interface CodeBlockKitLanguageLoaderOptions {
  /** Restrict matching to these language names/aliases/extensions; omit to
   * consider the full @codemirror/language-data registry. */
  languages?: readonly string[];
  onLoadError?: (languageId: string, error: unknown) => void;
  /** How to read the code block string passed to getLanguage/ensureLanguageLoaded:
   * `"infoString"` (default) treats it as a fenced block's info string, where only
   * the first whitespace-separated token is the language id/filename (trailing
   * text is metadata, e.g. `ts title="demo"`). `"fileName"` treats the whole
   * trimmed string as one filename -- for callers like scrapbox whose code block
   * string is always a bare filename that may itself contain spaces. Both
   * modes reject line terminators; filename mode only trims surrounding
   * horizontal whitespace. */
  infoValueKind?: "infoString" | "fileName";
}

export interface CodeBlockKitLanguageLoader {
  /** The language already loaded for this info string, or null when
   * unsupported OR not yet loaded. Never triggers a load itself. */
  getLanguage(infoValue: string): Language | null;
  /** Starts loading the language for this info string unless it's already
   * loading, loaded, or has already failed (failed loads are not retried
   * within this loader's lifetime). Resolves once settled, or immediately if
   * there's nothing to load -- safe to call redundantly, and safe to await
   * in tests. */
  ensureLanguageLoaded(infoValue: string): Promise<void>;
  /** Wire this into a plugin's `extensions`: drives background loading for
   * every code block info string `getCodeBlockInfoValues` finds in the
   * document, and re-dispatches once a language finishes loading. */
  extension: Extension;
}

type LoadState =
  | { status: "loading"; promise: Promise<Language> }
  | { status: "loaded"; language: Language }
  | { status: "failed"; error: unknown };

/**
 * Settings are written by people, so permit surrounding whitespace. A line
 * terminator is rejected rather than trimmed: it is almost certainly a
 * malformed setting, and must not turn into a valid language name.
 */
function normalizeConfiguredLanguageName(value: string): string | null {
  if (/\r|\n/.test(value)) {
    return null;
  }
  return value.trim().toLowerCase();
}

/**
 * Parser output has already passed the info-string/file-name parsing boundary,
 * which rejects line terminators and handles its own whitespace rules. Do not
 * alter that token here.
 */
function normalizeParsedLanguageName(value: string): string {
  return value.toLowerCase();
}

function getCacheKey(description: LanguageDescription): string {
  return description.name.toLowerCase();
}

function createAllowedDescriptions(languageIds: readonly string[] | undefined): LanguageDescription[] {
  if (!languageIds) {
    return [...codeMirrorLanguages];
  }

  const descriptions = new Map<string, LanguageDescription>();
  for (const languageId of languageIds) {
    const token = normalizeConfiguredLanguageName(languageId);
    if (!token) {
      continue;
    }
    const description =
      LanguageDescription.matchLanguageName(codeMirrorLanguages, token, false) ??
      LanguageDescription.matchFilename(codeMirrorLanguages, token);
    if (description) {
      descriptions.set(getCacheKey(description), description);
    }
  }
  return [...descriptions.values()];
}

function findLanguageDescription(
  descriptions: readonly LanguageDescription[],
  infoValue: string,
  infoValueKind: "infoString" | "fileName",
): { languageId: string; description: LanguageDescription } | null {
  const token = infoValueKind === "fileName" ? parseCodeBlockKitFileName(infoValue) : parseCodeBlockKitInfoString(infoValue)?.value;
  if (!token) {
    return null;
  }

  const languageId = normalizeParsedLanguageName(token);
  const description =
    LanguageDescription.matchLanguageName(descriptions, languageId, false) ??
    LanguageDescription.matchFilename(descriptions, token);

  return description ? { languageId, description } : null;
}

export function createCodeBlockKitLanguageLoader(
  getCodeBlockInfoValues: (state: EditorState) => Iterable<string>,
  options: CodeBlockKitLanguageLoaderOptions = {},
): CodeBlockKitLanguageLoader {
  const descriptions = createAllowedDescriptions(options.languages);
  const infoValueKind = options.infoValueKind ?? "infoString";
  const loads = new Map<string, LoadState>();
  const liveViews = new Set<EditorView>();

  function getLanguage(infoValue: string): Language | null {
    const match = findLanguageDescription(descriptions, infoValue, infoValueKind);
    if (!match) {
      return null;
    }
    const state = loads.get(getCacheKey(match.description));
    return state?.status === "loaded" ? state.language : null;
  }

  function ensureLanguageLoaded(infoValue: string): Promise<void> {
    const match = findLanguageDescription(descriptions, infoValue, infoValueKind);
    if (!match) {
      return Promise.resolve();
    }

    const { languageId, description } = match;
    const key = getCacheKey(description);
    const current = loads.get(key);
    if (current) {
      return current.status === "loading" ? current.promise.then(() => {}, () => {}) : Promise.resolve();
    }

    const promise = description.load().then((support) => support.language);
    loads.set(key, { status: "loading", promise });

    return promise.then(
      (language) => {
        loads.set(key, { status: "loaded", language });
        for (const view of liveViews) {
          view.dispatch({});
        }
      },
      (error) => {
        loads.set(key, { status: "failed", error });
        options.onLoadError?.(languageId, error);
      },
    );
  }

  class CodeBlockLanguageLoaderPlugin {
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      liveViews.add(view);
      this.scan(view.state);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.scan(update.state);
      }
    }

    scan(state: EditorState): void {
      for (const infoValue of getCodeBlockInfoValues(state)) {
        void ensureLanguageLoaded(infoValue);
      }
    }

    destroy(): void {
      liveViews.delete(this.view);
    }
  }

  return {
    getLanguage,
    ensureLanguageLoaded,
    extension: ViewPlugin.fromClass(CodeBlockLanguageLoaderPlugin),
  };
}
