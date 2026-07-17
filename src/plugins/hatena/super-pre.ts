import type { Language } from "@codemirror/language";
import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import {
  createCodeBlockKitSegmentedHighlightSpecs,
  getCodeBlockKitLanguage,
  type CodeBlockKitSegment,
} from "../code-block-kit.js";
import { createCodeBlockKitLanguageLoader } from "../code-block-language-loader.js";
import type { HatenaDocument } from "./parser.js";
import { getHatenaDocumentCacheEntryFromState, getHatenaDocumentFromState } from "./parser-cache.js";
import { emitLiteralBlockSpecs, hatenaDecorationProvider, literalBlockTheme } from "./shared.js";

// Super-pre (`>|| ... ||<`) is a multi-line LITERAL block: its inner lines must
// never be re-parsed as Hatena syntax. The parser already groups these lines
// (each carries a `superPre` role) and leaves heading/list/definition/links/
// quote/footnotes null or empty on them, so no per-line plugin decorates the
// interior. This plugin OWNS the block: one `lineRange` spec wraps the whole run
// — the renderer styles every member line and tags the boundary lines `-first` /
// `-last` (for a host that wants corner radii on those) — and the `>||` / `||<`
// marker lines are hidden while inactive.
export const hatenaSuperPreClassName = "mbox-hatena-superpre";
export const hatenaSuperPreLangClassName = "mbox-hatena-superpre-lang";

export class HatenaSuperPreLangWidget extends WidgetType {
  constructor(readonly language: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return this.constructor === other.constructor && this.language === (other as HatenaSuperPreLangWidget).language;
  }

  toDOM(): HTMLElement {
    const label = document.createElement("span");
    label.className = hatenaSuperPreLangClassName;
    label.textContent = this.language;
    return label;
  }
}

function createHatenaSuperPreSpecs(document: HatenaDocument, activeLines: Set<number>): MboxDecorationSpec[] {
  return emitLiteralBlockSpecs(document, activeLines, {
    roleOf: (line) => line.superPre,
    className: hatenaSuperPreClassName,
    // A `>|lang|` opener becomes a small language label instead of vanishing.
    widgetFor: (line) =>
      line.superPre === "opener" && line.superPreLang ? new HatenaSuperPreLangWidget(line.superPreLang) : undefined,
  });
}

// The lang label's color/font/size/weight are visual preference, not
// structural, so they aren't in this theme -- a host opts in through its own
// presentation theme on the public `.mbox-hatena-superpre-lang` class.
export function hatenaSuperPrePlugin(): MboxPlugin {
  return {
    theme: literalBlockTheme(hatenaSuperPreClassName),
    name: "hatena/super-pre",
    decorations: hatenaDecorationProvider(createHatenaSuperPreSpecs),
  };
}

export const hatenaSuperPreTokenClassName = "mbox-hatena-superpre-token";

interface HatenaSuperPreCodeBlock {
  /** The `>|lang|` opener's language id; null for a bare `>||` opener. */
  language: string | null;
  /** Each body line as its own segment (full line -- unlike scrapbox there is
   * no indent marker to strip), so token positions map back per line. */
  segments: CodeBlockKitSegment[];
}

function getSuperPreCodeBlocks(document: HatenaDocument, input: string): HatenaSuperPreCodeBlock[] {
  const blocks: HatenaSuperPreCodeBlock[] = [];
  let current: HatenaSuperPreCodeBlock | null = null;
  for (const line of document.lines) {
    if (line.superPre === "opener") {
      current = { language: line.superPreLang, segments: [] };
      blocks.push(current);
    } else if (line.superPre === "body" && current) {
      current.segments.push({ from: line.from, to: line.to, text: input.slice(line.from, line.to) });
    } else if (line.superPre === "closer") {
      current = null;
    }
  }
  return blocks;
}

function createHatenaSuperPreHighlightSpecs(
  document: HatenaDocument,
  input: string,
  getLanguage: (infoValue: string) => Language | null,
): MboxDecorationSpec[] {
  return getSuperPreCodeBlocks(document, input).flatMap((block) => {
    // A bare `>||` has no language, and `>|??|` (auto-detect on real Hatena)
    // matches nothing in either resolver -- both fall through to no specs.
    const language = block.language ? getLanguage(block.language) : null;
    if (!language) {
      return [];
    }
    return createCodeBlockKitSegmentedHighlightSpecs(block.segments, language, hatenaSuperPreTokenClassName);
  });
}

// The opt-in token highlighter for `>|lang|` super-pre blocks: a second plugin
// so the base literal block stays cheap, mirroring gfm/scrapbox. With no
// options this stays fully synchronous, resolving only JS/TS via
// code-block-kit's small hardcoded list. Passing `languages` switches to
// dynamically loading from CodeMirror's full @codemirror/language-data
// registry instead (see code-block-language-loader.ts).
export interface HatenaSuperPreHighlightPluginOptions {
  /** Restrict dynamic loading to these language names/aliases/extensions, or
   * pass `"all"` to allow any language in the full @codemirror/language-data
   * registry (still only loaded, one dynamic import at a time, for a
   * language actually used in the document). Omit entirely to skip the
   * dynamic loader altogether and stay on the zero-dependency JS/TS sync
   * default. */
  languages?: readonly string[] | "all";
  onLoadError?: (languageId: string, error: unknown) => void;
}

export function hatenaSuperPreHighlightPlugin(options: HatenaSuperPreHighlightPluginOptions = {}): MboxPlugin {
  if (!options.languages) {
    return {
      name: "hatena/super-pre-highlight",
      decorations: (context) => {
        const { input, document } = getHatenaDocumentCacheEntryFromState(context.state);
        return createHatenaSuperPreHighlightSpecs(document, input, getCodeBlockKitLanguage);
      },
    };
  }

  const loader = createCodeBlockKitLanguageLoader(
    (state) =>
      getHatenaDocumentFromState(state)
        .lines.map((line) => line.superPreLang)
        .filter((language): language is string => language !== null),
    {
      ...(options.languages === "all" ? {} : { languages: options.languages }),
      onLoadError: options.onLoadError,
    },
  );

  return {
    extensions: [loader.extension],
    name: "hatena/super-pre-highlight",
    decorations: (context) => {
      const { input, document } = getHatenaDocumentCacheEntryFromState(context.state);
      return createHatenaSuperPreHighlightSpecs(document, input, loader.getLanguage);
    },
  };
}
