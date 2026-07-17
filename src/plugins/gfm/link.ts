import { WidgetType } from "@codemirror/view";
import type { Text } from "@codemirror/state";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { createAnchorElement, createInactiveInlineNotationSpecs } from "../inline-notation-kit.js";
import { isLineSpanActive } from "./active-lines.js";

// Markdown links `[text](url)` and GFM autolinks (`www.` / bare URL). Both render
// as an anchor widget on idle lines and reveal their raw text on active ones,
// generalized to two link shapes.
//
// HOST-OPTIONS SEAM: URL semantics belong to the consumer, so the plugin factory
// takes a `linkUrl` resolver (mirroring scrapbox's `pageUrl`). The parser hands
// over the raw href (already normalized to
// http(s) for autolinks); the resolver maps it to whatever the host serves —
// proxying, relative-root resolution, tracking params, etc. The default is
// identity, keeping the link self-contained.
//
// This plugin ships no `theme`: color/underline/cursor are visual preference,
// not structural (nothing about reveal/hide breaks without them). A host that
// wants them opts in through its own presentation theme on the public
// `.mbox-gfm-link` class, the same way heading font-size/weight works.
export const gfmLinkClassName = "mbox-gfm-link";
export const gfmUnsafeLinkClassName = "mbox-gfm-link-unsafe";

/** Options for rendered Markdown links and GFM autolinks. */
export interface GfmLinkOptions {
  /**
   * Adds host-specific URL schemes to the default `http`, `https`, `mailto`,
   * and `tel` allowlist. Values must be ASCII scheme names without a colon.
   * Invalid values are ignored, and `javascript`, `vbscript`, `data`, `file`,
   * and `blob` can never be enabled.
   */
  additionalAllowedProtocols?: readonly string[];
  /**
   * Resolves a parsed destination before it is validated and rendered. The
   * returned string is preserved as the anchor's `href`.
   */
  linkUrl?: (url: string) => string;
}

const defaultLinkUrl = (url: string): string => url;
const defaultAllowedProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
const permanentlyBlockedProtocols = new Set(["javascript:", "vbscript:", "data:", "file:", "blob:"]);
const protocolNamePattern = /^[A-Za-z][A-Za-z0-9+.-]*$/;

export class GfmLinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly href: string,
    readonly autolink: boolean,
    readonly external: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    const target = other as GfmLinkWidget;
    return (
      this.constructor === other.constructor &&
      this.text === target.text &&
      this.href === target.href &&
      this.autolink === target.autolink &&
      this.external === target.external
    );
  }

  toDOM(): HTMLElement {
    const className = this.autolink ? `${gfmLinkClassName} ${gfmLinkClassName}-autolink` : gfmLinkClassName;
    return createAnchorElement({
      href: this.href,
      text: this.text,
      className,
      attributes: this.external ? { target: "_blank", rel: "noreferrer" } : undefined,
    });
  }
}

class GfmUnsafeLinkWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof GfmUnsafeLinkWidget && this.text === other.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = gfmUnsafeLinkClassName;
    span.textContent = this.text;
    return span;
  }
}

function normalizeAdditionalProtocols(protocols: readonly string[] | undefined): Set<string> {
  const allowed = new Set(defaultAllowedProtocols);
  for (const protocol of protocols ?? []) {
    if (!protocolNamePattern.test(protocol)) continue;
    const normalized = `${protocol.toLowerCase()}:`;
    if (!permanentlyBlockedProtocols.has(normalized)) allowed.add(normalized);
  }
  return allowed;
}

function parseAllowedLinkHref(href: string, allowedProtocols: ReadonlySet<string>): URL | undefined {
  try {
    const url = new URL(href, "https://mbox.invalid/");
    return allowedProtocols.has(url.protocol) && !permanentlyBlockedProtocols.has(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function hasAbsoluteHttpScheme(href: string, parsedUrl: URL): boolean {
  // Preserve the existing same-tab behavior for relative and protocol-relative
  // destinations. Only an explicit absolute HTTP(S) final href gets target/rel.
  const browserNormalizedHref = href.replace(/[\t\n\r]/g, "").replace(/^[\u0000-\u0020]+/, "");
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(browserNormalizedHref)?.[1]?.toLowerCase();
  return (scheme === "http" || scheme === "https") && (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:");
}

function createGfmLinkSpecs(
  document: GfmDocument,
  activeLines: Set<number>,
  doc: Text,
  linkUrl: (url: string) => string,
  allowedProtocols: ReadonlySet<string>,
): MboxDecorationSpec[] {
  // Reveal the raw link on any active line it touches (links rarely span lines,
  // but the same any-line rule keeps it consistent with inline spans).
  return document.links.flatMap((link) =>
    createInactiveInlineNotationSpecs(link, isLineSpanActive(link, activeLines), () => {
      const text = doc.sliceString(link.textFrom, link.textTo);
      const href = linkUrl(link.url);
      const parsedUrl = parseAllowedLinkHref(href, allowedProtocols);
      return parsedUrl
        ? new GfmLinkWidget(text, href, link.autolink, hasAbsoluteHttpScheme(href, parsedUrl))
        : new GfmUnsafeLinkWidget(text);
    }),
  );
}

export function gfmLinkPlugin(options: GfmLinkOptions = {}): MboxPlugin {
  const linkUrl = options.linkUrl ?? defaultLinkUrl;
  const allowedProtocols = normalizeAdditionalProtocols(options.additionalAllowedProtocols);
  return {
    name: "gfm/link",
    decorations: (context) =>
      createGfmLinkSpecs(
        getGfmDocumentFromState(context.state),
        context.activeLineNumbers,
        context.state.doc,
        linkUrl,
        allowedProtocols,
      ),
  };
}
