import { WidgetType } from "@codemirror/view";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { getMboxDocumentFromState } from "./parser-cache.js";
import { createAnchorElement } from "../inline-notation-kit.js";
import { isHttpUrl } from "../link-url.js";

export const urlLinkClassName = "mbox-url-link";

class URLLinkWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly label: string,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof URLLinkWidget && this.href === other.href && this.label === other.label && this.className === other.className;
  }

  toDOM(): HTMLElement {
    return createAnchorElement({
      href: this.href,
      text: this.label,
      className: this.className,
      attributes: { target: "_blank", rel: "noreferrer" },
    });
  }
}

function createURLLinkSpecs(
  document: MboxDocument,
  activeLines: MboxActiveLineNumbers,
  className: string,
): MboxDecorationSpec[] {
  return createInactiveInlineNodeSpecs(document, activeLines, (node) => {
    if (node.type === "markdownLink" && isHttpUrl(node.urlValue)) {
      return [
        {
          type: "replace",
          from: node.from,
          to: node.to,
          widget: new URLLinkWidget(node.urlValue, node.labelValue, className),
        },
      ];
    }

    if (node.type === "autoLink" && isHttpUrl(node.urlValue)) {
      return [
        {
          type: "replace",
          from: node.from,
          to: node.to,
          widget: new URLLinkWidget(node.urlValue, node.urlValue, className),
        },
      ];
    }

    return [];
  });
}

export function urlLinkPlugin(): MboxPlugin {
  return {
    name: "mbox/url-link",
    decorations: (context) => createURLLinkSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers, urlLinkClassName),
  };
}
