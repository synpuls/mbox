import { javascriptLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import type { Language, LRLanguage } from "@codemirror/language";
import { WidgetType } from "@codemirror/view";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import type { MboxDecorationSpec } from "../editor/plugin.js";

export interface CodeBlockKitRange {
  from: number;
  to: number;
}

/** A working Copy button: writes `code` to the clipboard, shows "Copied" for a
 * second, and flags a failed write via `data-copy-failed` (cleared on the next
 * successful copy). `className` is the caller's own button class. */
export class CodeBlockKitCopyButtonWidget extends WidgetType {
  constructor(
    private readonly code: string,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof CodeBlockKitCopyButtonWidget && this.code === other.code && this.className === other.className;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    let resetCopiedTimer: number | undefined;
    button.type = "button";
    button.className = this.className;
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code block");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        await navigator.clipboard.writeText(this.code);
        if (resetCopiedTimer !== undefined) {
          window.clearTimeout(resetCopiedTimer);
        }
        button.textContent = "Copied";
        button.dataset.copied = "true";
        delete button.dataset.copyFailed;
        resetCopiedTimer = window.setTimeout(() => {
          button.textContent = "Copy";
          delete button.dataset.copied;
          resetCopiedTimer = undefined;
        }, 1000);
      } catch {
        button.dataset.copyFailed = "true";
      }
    });
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const supportedCodeBlockKitLanguageIds = ["js", "javascript", "jsx", "ts", "typescript", "tsx"];

function isSupportedCodeBlockKitLanguageId(languageId: string): boolean {
  return supportedCodeBlockKitLanguageIds.includes(languageId);
}

// A bare language id, or a filename (e.g. "sample.ts") -- fall back to the
// extension when the id itself isn't one of the supported ones.
function getCodeBlockKitLanguageByIdOrExtension(value: string): string | null {
  const languageId = value.trim().toLowerCase();
  if (!languageId) {
    return null;
  }
  if (isSupportedCodeBlockKitLanguageId(languageId)) {
    return languageId;
  }
  const extension = /\.([a-z0-9]+)$/i.exec(languageId)?.[1]?.toLowerCase();
  return extension && isSupportedCodeBlockKitLanguageId(extension) ? extension : languageId;
}

function resolveCodeBlockKitLanguage(languageId: string | null): LRLanguage | null {
  if (!languageId) {
    return null;
  }
  if (["js", "javascript", "jsx"].includes(languageId)) {
    return javascriptLanguage;
  }
  if (["ts", "typescript", "tsx"].includes(languageId)) {
    return typescriptLanguage;
  }
  return null;
}

/** Resolves a fenced code block's info string (e.g. `ts`, or `sample.ts` when
 * the id itself is a filename) to the LRLanguage its content should be
 * highlighted with, or null when unsupported (or absent). Only the first
 * whitespace-separated token is considered -- info strings may carry
 * trailing metadata after the language id (e.g. `ts title="demo"`). */
export function getCodeBlockKitLanguage(infoValue: string): LRLanguage | null {
  const [firstToken] = infoValue.trim().split(/\s+/, 1);
  return resolveCodeBlockKitLanguage(firstToken ? getCodeBlockKitLanguageByIdOrExtension(firstToken) : null);
}

/** Resolves a whole filename (e.g. `my file.js`, spaces and all) to the
 * LRLanguage its content should be highlighted with, or null when unsupported
 * (or absent). Unlike {@link getCodeBlockKitLanguage}, the entire trimmed
 * string is one filename -- there is no trailing-metadata token to split off,
 * so a space in the name (e.g. scrapbox's `code:my file.js`) doesn't hide the
 * extension. */
export function getCodeBlockKitLanguageForFileName(fileName: string): LRLanguage | null {
  return resolveCodeBlockKitLanguage(getCodeBlockKitLanguageByIdOrExtension(fileName));
}

/** One piece of a code block's content: `text` is the already-extracted
 * source (e.g. a fenced block's whole interior, or one scrapbox body line
 * with its required indent marker already stripped), `from`/`to` is the
 * document range that same text occupies. */
export interface CodeBlockKitSegment extends CodeBlockKitRange {
  text: string;
}

/** Parses one or more content segments -- joined with `"\n"` into a single
 * virtual string -- as one `language`, and emits mark specs mapped back to
 * each segment's own document range. A token that spans the virtual `"\n"`
 * joining two segments (e.g. a multi-line comment split across scrapbox body
 * lines with their markers stripped) is split into one mark per segment it
 * touches, rather than one mark stretching across the stripped-out markers
 * that sit between segments in the real document. */
export function createCodeBlockKitSegmentedHighlightSpecs(
  segments: readonly CodeBlockKitSegment[],
  language: Language,
  tokenClassName: string,
): MboxDecorationSpec[] {
  const value = segments.map((segment) => segment.text).join("\n");
  const tree = language.parser.parse(value);
  const specs: MboxDecorationSpec[] = [];

  let virtualFrom = 0;
  const positioned = segments.map((segment) => {
    const entry = { ...segment, virtualFrom, virtualTo: virtualFrom + segment.text.length };
    virtualFrom = entry.virtualTo + 1; // +1 for the "\n" joining this segment to the next
    return entry;
  });

  highlightTree(tree, classHighlighter, (from, to, classes) => {
    for (const segment of positioned) {
      const markFrom = Math.max(from, segment.virtualFrom);
      const markTo = Math.min(to, segment.virtualTo);
      if (markFrom >= markTo) {
        continue;
      }
      specs.push({
        from: segment.from + (markFrom - segment.virtualFrom),
        to: segment.from + (markTo - segment.virtualFrom),
        className: `${tokenClassName} ${classes}`,
      });
    }
  });

  return specs;
}

/** Parses `value` (the block's content text) with `language` and emits one
 * mark spec per highlighted token, offset by `contentFrom` into the document
 * and classed `${tokenClassName} ${lezerClasses}`. `language` accepts any
 * `Language` (not just the Lezer-native `LRLanguage`) so `StreamLanguage`-backed
 * grammars -- e.g. Ruby, wrapped from `@codemirror/legacy-modes` -- work too.
 * A thin single-segment wrapper around {@link createCodeBlockKitSegmentedHighlightSpecs}. */
export function createCodeBlockKitHighlightSpecs(
  value: string,
  contentFrom: number,
  language: Language,
  tokenClassName: string,
): MboxDecorationSpec[] {
  return createCodeBlockKitSegmentedHighlightSpecs(
    [{ from: contentFrom, to: contentFrom + value.length, text: value }],
    language,
    tokenClassName,
  );
}

/** The first whitespace-separated token of an info string (e.g. `ts` in
 * `ts title="demo"`) is the code block's language label; returns null when
 * the info string has no non-whitespace token. */
export function getCodeBlockKitLanguageLabelRange(infoValue: string, infoFrom: number): CodeBlockKitRange | null {
  const match = /\S+/.exec(infoValue);
  if (!match) {
    return null;
  }
  const from = infoFrom + match.index;
  return { from, to: from + match[0].length };
}

/** The start offset of each line within `value` (the block's content text,
 * fences excluded), for tagging every content line with its own decoration. */
export function getCodeBlockKitContentLineStarts(content: CodeBlockKitRange, value: string): number[] {
  const starts: number[] = [];
  let cursor = content.from;

  while (cursor < content.to) {
    starts.push(cursor);
    const nextNewline = value.indexOf("\n", cursor - content.from);
    if (nextNewline < 0) {
      break;
    }
    cursor = content.from + nextNewline + 1;
  }

  return [...new Set(starts)];
}
