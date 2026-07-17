import {
  autocompletion,
  closeCompletion,
  completionKeymap,
  completionStatus,
  insertCompletionText,
  moveCompletionSelection,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxCompletionOptionClassName = "scrapbox-completion-option";
export const scrapboxCompletionOptionWithPreviewClassName = "scrapbox-completion-option-with-preview";
export const scrapboxCompletionPreviewClassName = "scrapbox-completion-preview";
export const scrapboxCompletionPreviewImageClassName = "scrapbox-completion-preview-image";

export const scrapboxCompletionClassNames = {
  option: scrapboxCompletionOptionClassName,
  optionWithPreview: scrapboxCompletionOptionWithPreviewClassName,
  preview: scrapboxCompletionPreviewClassName,
  previewImage: scrapboxCompletionPreviewImageClassName,
} as const;

/** The notation whose token the caret is currently inside. */
export type ScrapboxCompletionNotation = "bracket" | "hash";

/** A suggestion candidate. `iconUrl` (when set) is shown in the popup (iteration 2). */
export interface ScrapboxCompletionCandidate {
  title: string;
  iconUrl?: string;
}

/**
 * Consumer-supplied recommender: given the text typed so far and the notation,
 * return already-ranked/filtered candidates. Called synchronously on each
 * keystroke, so the consumer owns an in-memory index (fetched however it likes).
 */
export type ScrapboxRecommend = (
  query: string,
  notation: ScrapboxCompletionNotation,
) => ScrapboxCompletionCandidate[];

export interface ScrapboxCompletePluginOptions {
  recommend?: ScrapboxRecommend;
}

export interface ScrapboxActiveToken {
  kind: ScrapboxCompletionNotation;
  /** The text between the opener and the caret — the recommend query. */
  query: string;
  /** Token bounds relative to the line: the whole `[ … ]` / `#tag` to replace. */
  from: number;
  to: number;
}

interface ScrapboxCompletionOption extends Completion {
  iconUrl?: string;
}

const completionTheme: MboxThemeSpec = {
  [`.cm-tooltip-autocomplete ul li.${scrapboxCompletionOptionWithPreviewClassName}`]: {
    alignItems: "center",
    display: "flex",
    gap: "8px",
  },
  [`.${scrapboxCompletionPreviewClassName}`]: {
    display: "inline-flex",
    flex: "0 0 auto",
    marginLeft: "auto",
  },
  [`.${scrapboxCompletionPreviewImageClassName}`]: {
    borderRadius: "2px",
    width: "24px",
    height: "24px",
    objectFit: "contain",
  },
};

// Inside `[`, up to the caret, with no bracket in between — a page-link token.
const bracketBeforeRegExp = /\[[^[\]]*$/;
// A `#tag` at the caret: the `#` must start the line or follow whitespace.
const hashBeforeRegExp = /(?:^|\s)(#[^\s#[\]]*)$/;

/**
 * Detect the suggestion token the caret sits in, or null. The token spans the
 * whole notation so accepting a candidate replaces it entirely (including the
 * auto-closed `]`): `[ru|]` → `{ kind: "bracket", query: "ru", from: 0, to: 4 }`,
 * `#ru|` → `{ kind: "hash", query: "ru", from: 0, to: 3 }`. A bracket wins over a
 * hash when the caret is inside `[ … ]`.
 */
export function findScrapboxActiveToken(lineText: string, cursorCh: number): ScrapboxActiveToken | null {
  const before = lineText.slice(0, cursorCh);

  const bracket = bracketBeforeRegExp.exec(before);
  if (bracket) {
    const from = bracket.index; // the "["
    const query = before.slice(from + 1);
    // Swallow the closing "]" when it sits right at the caret (auto-close case).
    const to = lineText[cursorCh] === "]" ? cursorCh + 1 : cursorCh;
    return { kind: "bracket", query, from, to };
  }

  const hash = hashBeforeRegExp.exec(before);
  if (hash) {
    const tag = hash[1]; // "#query"
    return { kind: "hash", query: tag.slice(1), from: before.length - tag.length, to: cursorCh };
  }

  return null;
}

function wrapCandidate(title: string, kind: ScrapboxCompletionNotation): string {
  return kind === "bracket" ? `[${title}]` : `#${title}`;
}

function iconApply(title: string): string {
  return `[${title}.icon]`;
}

/**
 * Build a CodeMirror completion source from a consumer recommender. It reads the
 * active token, asks `recommend` for candidates and returns them verbatim with
 * `filter: false` — the consumer already ranked/filtered, so CodeMirror must not
 * filter again. Accepting a candidate replaces the whole token with `[title]` /
 * `#title`, leaving the caret past it.
 */
export function createScrapboxCompletionSource(
  recommend: ScrapboxRecommend,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const document = getScrapboxDocumentFromState(context.state);
    if (scrapboxBlockLineNumbers(document).has(line.number)) return null;

    const token = findScrapboxActiveToken(line.text, context.pos - line.from);
    if (!token) return null;

    const candidates = recommend(token.query, token.kind);
    if (candidates.length === 0) return null;

    return {
      from: line.from + token.from,
      to: line.from + token.to,
      filter: false,
      options: candidates.map(
        (candidate): ScrapboxCompletionOption => ({
          label: candidate.title,
          apply: wrapCandidate(candidate.title, token.kind),
          type: "text",
          iconUrl: candidate.iconUrl,
        }),
      ),
    };
  };
}

function renderCompletionPreview(
  completion: Completion,
  _state: EditorState,
  view?: EditorView,
): HTMLElement | null {
  const { iconUrl } = completion as ScrapboxCompletionOption;
  if (!iconUrl) return null;

  const preview = document.createElement("span");
  preview.className = scrapboxCompletionPreviewClassName;

  const image = document.createElement("img");
  image.className = scrapboxCompletionPreviewImageClassName;
  image.src = iconUrl;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const currentView = view ?? EditorView.findFromDOM(preview);
    if (!currentView) return;

    const head = currentView.state.selection.main.head;
    const line = currentView.state.doc.lineAt(head);
    const token = findScrapboxActiveToken(line.text, head - line.from);
    if (token?.kind !== "bracket") return;

    currentView.dispatch({
      ...insertCompletionText(
        currentView.state,
        iconApply(completion.label),
        line.from + token.from,
        line.from + token.to,
      ),
      annotations: pickedCompletion.of(completion),
    });
    closeCompletion(currentView);
  });
  preview.appendChild(image);

  return preview;
}

function completionOptionClass(completion: Completion): string {
  const { iconUrl } = completion as ScrapboxCompletionOption;
  return iconUrl
    ? `${scrapboxCompletionOptionClassName} ${scrapboxCompletionOptionWithPreviewClassName}`
    : scrapboxCompletionOptionClassName;
}

function runCompletionTab(view: EditorView, forward: boolean): boolean {
  return moveCompletionSelection(forward)(view) || completionStatus(view.state) !== null;
}

/**
 * Native completion popup for Scrapbox `[ … ]` page links and `#tag`s, driven by
 * a consumer-supplied {@link ScrapboxRecommend}. Without a recommender the plugin
 * is inert.
 */
export function scrapboxCompletePlugin(options: ScrapboxCompletePluginOptions = {}): MboxPlugin {
  const { recommend } = options;
  return {
    extensions: recommend
      ? [
          autocompletion({
            icons: false,
            override: [createScrapboxCompletionSource(recommend)],
            addToOptions: [{ position: 90, render: renderCompletionPreview }],
            optionClass: completionOptionClass,
          }),
        ]
      : [],
    keymap: [
      { key: "Tab", run: (view) => runCompletionTab(view, true) },
      { key: "Shift-Tab", run: (view) => runCompletionTab(view, false) },
      ...completionKeymap,
    ],
    theme: completionTheme,
  };
}
