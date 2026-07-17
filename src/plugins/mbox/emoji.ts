import { WidgetType } from "@codemirror/view";
import type { MboxPlugin } from "../../editor/plugin.js";
import { createInactiveInlineNodeSpecs } from "./inline-visitor.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const emojiClassName = "mbox-emoji";

class EmojiWidget extends WidgetType {
  constructor(
    private readonly value: string,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof EmojiWidget && this.value === other.value && this.className === other.className;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = this.className;
    element.textContent = this.value;
    return element;
  }
}

export function emojiPlugin(): MboxPlugin {
  return {
    name: "mbox/emoji",
    decorations: (context) =>
      createInactiveInlineNodeSpecs(getMboxDocumentFromState(context.state), context.activeLineNumbers, (node) =>
        node.type === "emoji"
          ? [
              {
                type: "replace",
                from: node.from,
                to: node.to,
                widget: new EmojiWidget(node.value, emojiClassName),
              },
            ]
          : [],
      ),
  };
}
