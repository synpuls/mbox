import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import { removeGfmEscapeBackslashes } from "./parser.js";
import { gfmImageClassNames, gfmImagePreviewEnabled } from "./image.js";
import type { GfmDocument, GfmLinkLabelNode } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";
import { gfmInlineCodeClassName } from "./inline-code.js";
import { gfmInlineClassNames } from "./inline.js";
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
    readonly label?: readonly GfmLinkLabelNode[],
    readonly source?: string,
    readonly renderImages = false,
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
      this.external === target.external &&
      this.renderImages === target.renderImages &&
      this.labelSignature() === target.labelSignature()
    );
  }

  toDOM(): HTMLElement {
    const className = this.autolink ? `${gfmLinkClassName} ${gfmLinkClassName}-autolink` : gfmLinkClassName;
    const anchor = createAnchorElement({
      href: this.href,
      text: this.text,
      className,
      attributes: this.external ? { target: "_blank", rel: "noreferrer" } : undefined,
    });
    renderLinkLabel(anchor, this.text, this.label, this.source, this.renderImages);
    return anchor;
  }

  private labelSignature(): string {
    return JSON.stringify(this.label ?? null);
  }
}

class GfmUnsafeLinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly label?: readonly GfmLinkLabelNode[],
    readonly source?: string,
    readonly renderImages = false,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof GfmUnsafeLinkWidget
      && this.text === other.text
      && this.renderImages === other.renderImages
      && JSON.stringify(this.label ?? null) === JSON.stringify(other.label ?? null)
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = gfmUnsafeLinkClassName;
    renderLinkLabel(span, this.text, this.label, this.source, this.renderImages);
    return span;
  }
}

/** Builds label DOM only from the parser's restricted source-range projection.
 * This is the renderer half of the trust boundary: unknown nodes, including
 * HTML and nested links, are always text nodes made from their raw source. */
function renderLinkLabel(
  parent: HTMLElement,
  fallbackText: string,
  label: readonly GfmLinkLabelNode[] | undefined,
  source: string | undefined,
  renderImages: boolean,
): void {
  if (label === undefined || label.length === 0 || source === undefined) {
    parent.textContent = fallbackText;
    return;
  }
  parent.replaceChildren(...label.map((node) => renderLinkLabelNode(node, source, renderImages)));
}

function renderLinkLabelNode(node: GfmLinkLabelNode, source: string, renderImages: boolean): Node {
  switch (node.kind) {
    case "emphasis":
    case "strong":
    case "delete": {
      const element = document.createElement(node.kind === "delete" ? "del" : node.kind === "emphasis" ? "em" : "strong");
      element.className = gfmInlineClassNames[node.kind];
      element.replaceChildren(...node.children.map((child) => renderLinkLabelNode(child, source, renderImages)));
      return element;
    }
    case "inlineCode": {
      const code = document.createElement("code");
      code.className = gfmInlineCodeClassName;
      code.append(document.createTextNode(source.slice(node.content.from, node.content.to)));
      return code;
    }
    case "break":
      return document.createElement("br");
    case "text":
      return document.createTextNode(removeGfmEscapeBackslashes(source.slice(node.from, node.to)));
    case "image": {
      // `[![alt](img)](link)` is plain CommonMark, and it means `<a><img></a>`.
      // The anchor is already this widget, so the image only has to become an
      // `<img>` inside it -- which also keeps the destination on the link
      // plugin's allowlist-checked path rather than handing a URL to another
      // plugin.
      //
      // Only when the host renders pictures at all. With `renderMode: "token"`
      // the alt text is the whole point, and a link label is no exception.
      if (!renderImages || node.url === undefined) {
        return document.createTextNode(node.text);
      }
      const image = document.createElement("img");
      image.className = gfmImageClassNames.element;
      image.src = node.url;
      image.alt = node.text;
      image.loading = "lazy";
      image.decoding = "async";
      return image;
    }
    case "footnoteReference":
      return document.createTextNode(node.text);
    case "unknown":
      return document.createTextNode(source.slice(node.from, node.to));
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
  source: string | { sliceString(from: number, to: number): string },
  activeLines: Set<number>,
  linkUrl: (url: string) => string,
  allowedProtocols: ReadonlySet<string>,
  renderImages: boolean,
): MboxDecorationSpec[] {
  // Reveal the raw link on any active line it touches (links rarely span lines,
  // but the same any-line rule keeps it consistent with inline spans).
  return document.links.flatMap((link) =>
    createInactiveInlineNotationSpecs(link, isLineSpanActive(link, activeLines), source, () => {
      // The label's nested inline markup becomes DOM (see renderLinkLabel),
      // but `text` stays the recursive plain-text projection: the table grid
      // measures this exact string, and rendered widths would need a separate
      // measurement model. Anchor glyph widths remain a text-width
      // approximation, like the table footnote chip.
      const text = link.text;
      const href = linkUrl(link.url);
      const parsedUrl = parseAllowedLinkHref(href, allowedProtocols);
      return parsedUrl
        ? new GfmLinkWidget(text, href, link.autolink, hasAbsoluteHttpScheme(href, parsedUrl), link.label, link.labelSource, renderImages)
        : new GfmUnsafeLinkWidget(text, link.label, link.labelSource, renderImages);
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
        context.state.doc,
        context.activeLineNumbers,
        linkUrl,
        allowedProtocols,
        // Whether pictures are drawn at all is the image plugin's setting, and
        // a link label is not an exception to it. Read through the same facet
        // the table plugin uses, so a host assembling plugins by hand gets the
        // same answer as one using the bundle.
        context.state.facet(gfmImagePreviewEnabled),
      ),
  };
}
