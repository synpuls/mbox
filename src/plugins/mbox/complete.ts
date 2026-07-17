import {
  autocompletion,
  completionKeymap,
  completionStatus,
  moveCompletionSelection,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const completionOptionClassName = "mbox-completion-option";
export const completionOptionWithPreviewClassName = "mbox-completion-option-with-preview";
export const completionPreviewClassName = "mbox-completion-preview";
export const completionPreviewImageClassName = "mbox-completion-preview-image";

export const completionClassNames = {
  option: completionOptionClassName,
  optionWithPreview: completionOptionWithPreviewClassName,
  preview: completionPreviewClassName,
  previewImage: completionPreviewImageClassName,
} as const;

export interface MboxCompletionCandidate {
  title: string;
  /** 完全な置換文字列(ブラケット込み)を候補側が明示的に指定したい場合に使う。省略時は`type`から自動生成する。 */
  apply?: string;
  /** 省略時は`"page"`扱いで`[title]`、`"icon"`なら`[title.icon]`をデフォルトの`apply`として使う。 */
  type?: "page" | "icon";
  /** 補完候補にアイコンまたはサムネイル画像として表示されるURL。 */
  iconUrl?: string;
}

export type MboxRecommend = (query: string) => MboxCompletionCandidate[];

export interface MboxCompletePluginOptions {
  recommend?: MboxRecommend;
}

export interface MboxActiveToken {
  query: string;
  from: number;
  to: number;
}

interface MboxCompletionOption extends Completion {
  iconUrl?: string;
}

const bracketBeforeRegExp = /\[[^[\]]*$/;

const completionTheme: MboxThemeSpec = {
  [`.cm-tooltip-autocomplete ul li.${completionOptionWithPreviewClassName}`]: {
    alignItems: "center",
    display: "flex",
    gap: "8px",
  },
  [`.${completionPreviewClassName}`]: {
    display: "inline-flex",
    flex: "0 0 auto",
    marginLeft: "auto",
  },
  [`.${completionPreviewImageClassName}`]: {
    borderRadius: "2px",
    width: "24px",
    height: "24px",
    objectFit: "contain",
  },
};

export function findMboxActiveToken(lineText: string, cursorCh: number): MboxActiveToken | null {
  const before = lineText.slice(0, cursorCh);

  const bracket = bracketBeforeRegExp.exec(before);
  if (!bracket) return null;

  const from = bracket.index;
  const query = before.slice(from + 1);
  if (query.startsWith("^")) return null;
  const to = lineText[cursorCh] === "]" ? cursorCh + 1 : cursorCh;
  return { query, from, to };
}

function defaultApply(candidate: MboxCompletionCandidate): string {
  return candidate.type === "icon" ? `[${candidate.title}.icon]` : `[${candidate.title}]`;
}

export function createMboxCompletionSource(
  recommend: MboxRecommend,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    if (isCompletionSuppressedLine(context.state, line.number)) return null;

    const token = findMboxActiveToken(line.text, context.pos - line.from);
    if (!token) return null;
    if (token.query.length === 0) return null;

    const candidates = recommend(token.query);
    if (candidates.length === 0) return null;

    return {
      from: line.from + token.from,
      to: line.from + token.to,
      filter: false,
      options: candidates.map((candidate): MboxCompletionOption => ({
        label: candidate.title,
        apply: candidate.apply ?? defaultApply(candidate),
        type: "text",
        iconUrl: candidate.iconUrl,
      })),
    };
  };
}

function renderCompletionPreview(completion: Completion): HTMLElement | null {
  const { iconUrl } = completion as MboxCompletionOption;
  if (!iconUrl) return null;

  const preview = document.createElement("span");
  preview.className = completionPreviewClassName;

  const image = document.createElement("img");
  image.className = completionPreviewImageClassName;
  image.src = iconUrl;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  preview.appendChild(image);

  return preview;
}

function completionOptionClass(completion: Completion): string {
  const { iconUrl } = completion as MboxCompletionOption;
  return iconUrl ? `${completionOptionClassName} ${completionOptionWithPreviewClassName}` : completionOptionClassName;
}

function isCompletionSuppressedLine(state: EditorState, lineNumber: number): boolean {
  const document = getMboxDocumentFromState(state);
  return document.blocks.some((block) => {
    if (block.type !== "codeBlock" && block.type !== "table") {
      return false;
    }

    const fromLine = state.doc.lineAt(block.from).number;
    const toLine = state.doc.lineAt(block.to).number;
    return fromLine <= lineNumber && lineNumber <= toLine;
  });
}

function runCompletionTab(view: EditorView, forward: boolean): boolean {
  return moveCompletionSelection(forward)(view) || completionStatus(view.state) !== null;
}

export function mboxCompletePlugin(options: MboxCompletePluginOptions = {}): MboxPlugin {
  const { recommend } = options;
  return {
    extensions: recommend
      ? [
          autocompletion({
            icons: false,
            override: [createMboxCompletionSource(recommend)],
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
