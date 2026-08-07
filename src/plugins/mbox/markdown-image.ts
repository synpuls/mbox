import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import type { MboxDocument } from "./types.js";
import { createImageKitSpecs, imageKitTheme } from "../image-kit.js";
import { getMboxDocumentFromState } from "./parser-cache.js";

export const markdownImageClassName = "mbox-image";
const markdownImageTokenClassName = "mbox-image-token";
const markdownImagePreviewClassName = "mbox-image-preview";
const markdownImageElementClassName = "mbox-image-element";
const markdownImageMeasureClassName = "mbox-image-measure";
export const markdownImageClassNames = {
  image: markdownImageClassName,
  token: markdownImageTokenClassName,
  preview: markdownImagePreviewClassName,
  element: markdownImageElementClassName,
};

const markdownImageInternalClassNames = {
  measure: markdownImageMeasureClassName,
};

export type MarkdownImageRenderMode = "token" | "preview";

export interface MarkdownImagePluginOptions {
  renderMode?: MarkdownImageRenderMode;
}

const defaultMarkdownImageOptions = {
  renderMode: "token" as const,
};

function createMarkdownImageSpecs(
  document: MboxDocument,
  source: string | { sliceString(from: number, to: number): string },
  activeLines: MboxActiveLineNumbers,
  classNames: typeof markdownImageClassNames,
  options: MarkdownImagePluginOptions = defaultMarkdownImageOptions,
): MboxDecorationSpec[] {
  const renderMode = options.renderMode ?? defaultMarkdownImageOptions.renderMode;

  return document.blocks.flatMap((block) =>
    !("inline" in block)
      ? []
      : createImageKitSpecs(
          block.inline.flatMap((node) =>
            node.type === "markdownImage"
              ? [{ from: node.from, to: node.to, src: node.urlValue, alt: node.altValue, text: node.altValue || node.urlValue }]
              : [],
          ),
          activeLines.has(block.line),
          source,
          classNames,
          markdownImageInternalClassNames,
          renderMode,
        ),
  );
}

export function markdownImagePlugin(options: MarkdownImagePluginOptions = {}): MboxPlugin {
  return {
    theme: imageKitTheme(markdownImageClassNames, markdownImageInternalClassNames),
    name: "mbox/markdown-image",
    decorations: (context) => createMarkdownImageSpecs(getMboxDocumentFromState(context.state), context.state.doc, context.activeLineNumbers, markdownImageClassNames, options),
  };
}
