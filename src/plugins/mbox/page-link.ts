import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import { WidgetType } from "@codemirror/view";
import type { MboxDocument } from "./types.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import { createAnchorElement } from "../inline-notation-kit.js";

export const pageLinkClassName = "mbox-page-link";
export const iconClassName = "mbox-icon";
export const iconImageClassName = "mbox-icon-image";

export interface PageLinkPluginOptions {
  pageUrl?: (pageName: string) => string;
  iconUrl?: (iconName: string) => string;
  icons?: boolean;
}

const defaultPageUrl = (pageName: string): string => `./${pageName}`;

class PageLinkWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly value: string,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof PageLinkWidget &&
      this.href === other.href &&
      this.value === other.value &&
      this.className === other.className
    );
  }

  toDOM(): HTMLElement {
    return createAnchorElement({ href: this.href, text: this.value, className: this.className });
  }
}

export class MboxIconWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly name: string,
    private readonly iconUrl: string | undefined,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MboxIconWidget &&
      this.href === other.href &&
      this.name === other.name &&
      this.iconUrl === other.iconUrl
    );
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.className = iconClassName;
    anchor.setAttribute("href", this.href);
    anchor.setAttribute("title", this.name);
    if (this.iconUrl) {
      const image = document.createElement("img");
      image.className = iconImageClassName;
      image.src = this.iconUrl;
      image.alt = this.name;
      anchor.appendChild(image);
    } else {
      anchor.textContent = this.name;
    }
    return anchor;
  }
}

function createPageLinkSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
  pageUrl: (pageName: string) => string,
  iconUrl: ((iconName: string) => string) | undefined,
  icons: boolean,
): MboxDecorationSpec[] {
  const specs: MboxDecorationSpec[] = [];

  for (const block of document.blocks) {
    if (!("inline" in block)) {
      continue;
    }
    for (const node of block.inline) {
      if (node.type === "wikiLink" && activeLines.has(block.line)) {
        specs.push({
          type: "mark",
          from: node.from,
          to: node.to,
          className,
        });
      }
    }
  }

  specs.push(...createInactiveInlineNodeSpecs(document, activeLines, (node) => {
    if (node.type === "wikiLink") {
      return [
        {
          type: "replace",
          from: node.from,
          to: node.to,
          widget: new PageLinkWidget(pageUrl(node.value), node.value, className),
        },
      ];
    }
    if (icons && node.type === "icon") {
      return [
        {
          type: "replace",
          from: node.from,
          to: node.to,
          widget: new MboxIconWidget(pageUrl(node.value), node.value, iconUrl?.(node.value)),
        },
      ];
    }
    return [];
  }));

  return specs;
}

// The consumer owns URL semantics for a page name (mirroring gfm's linkUrl,
// scrapbox's pageUrl, hatena's idUrl) -- this reference namespace's own plugin
// should demonstrate that seam rather than hardcode its own routing.
export function pageLinkPlugin(options: PageLinkPluginOptions = {}): MboxPlugin {
  const pageUrl = options.pageUrl ?? defaultPageUrl;
  const icons = options.icons ?? true;
  return {
    theme: {
      [`.${iconClassName}`]: {
        textDecoration: "none",
      },
      [`.${iconImageClassName}`]: {
        height: "1em",
        width: "auto",
        verticalAlign: "text-bottom",
      },
    },
    name: "mbox/page-link",
    decorations: (context) =>
      createPageLinkSpecs(
        getMboxDocumentFromState(context.state),
        context.activeLineNumbers,
        pageLinkClassName,
        pageUrl,
        options.iconUrl,
        icons,
      ),
  };
}
