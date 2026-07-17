import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { HatenaDocument, HatenaLinkKind } from "./parser.js";
import { hatenaDecorationProvider } from "./shared.js";
import { createAnchorElement, createInactiveInlineNotationSpecs } from "../inline-notation-kit.js";

// Inline links render as anchors on inactive lines and stay raw text on active
// ones — the same reveal pattern as the other markers, with the hidden text
// replaced by a widget (as in the example's link.ts). Three shapes share one
// widget, but only one needs host resolution:
//   [http://…:title=foo]   bracket link (label = title or the URL; already final)
//   http://…               bare URL (already final)
//   id:name                user link; the parser hands over the raw username,
//                          and `idUrl` (default `/${name}`) resolves it here —
//                          the same consumer-resolver seam as gfm's `linkUrl`
//                          and scrapbox's `pageUrl`.
//
// This plugin ships no `theme`: color/underline/cursor are visual preference,
// not structural. A host opts in through its own presentation theme on the
// public `.mbox-hatena-link` class.
export const hatenaLinkClassName = "mbox-hatena-link";

export interface HatenaLinkOptions {
  idUrl?: (name: string) => string;
}

const defaultIdUrl = (name: string): string => `/${name}`;

export class HatenaLinkWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly label: string,
    private readonly kind: HatenaLinkKind,
  ) {
    super();
  }

  // eq() lets CodeMirror REUSE the produced DOM instead of rebuilding it. Every
  // field that affects the rendered anchor is compared; the constructor guard
  // keeps a subclass from ever comparing equal to this base.
  eq(other: WidgetType): boolean {
    return (
      this.constructor === other.constructor &&
      this.href === (other as HatenaLinkWidget).href &&
      this.label === (other as HatenaLinkWidget).label &&
      this.kind === (other as HatenaLinkWidget).kind
    );
  }

  toDOM(): HTMLElement {
    // The replace spec carries no className — the widget owns its own classes.
    const className = `${hatenaLinkClassName} ${hatenaLinkClassName}-${this.kind}`;
    return createAnchorElement({
      href: this.href,
      text: this.label,
      className,
      attributes: this.kind !== "id" ? { target: "_blank", rel: "noreferrer" } : undefined,
    });
  }
}

function createHatenaLinkSpecs(
  document: HatenaDocument,
  activeLines: Set<number>,
  idUrl: (name: string) => string,
): MboxDecorationSpec[] {
  // Active lines keep the raw link syntax so the user edits it directly.
  // (Super-pre body lines already carry no links from the parser.)
  return document.lines.flatMap((line) =>
    line.links.flatMap((link) =>
      createInactiveInlineNotationSpecs(link, activeLines.has(line.line), () => {
        const href = link.kind === "id" ? idUrl(link.href) : link.href;
        return new HatenaLinkWidget(href, link.label, link.kind);
      }),
    ),
  );
}

export function hatenaLinkPlugin(options: HatenaLinkOptions = {}): MboxPlugin {
  const idUrl = options.idUrl ?? defaultIdUrl;
  return {
    name: "hatena/link",
    decorations: hatenaDecorationProvider((document, activeLines) => createHatenaLinkSpecs(document, activeLines, idUrl)),
  };
}
