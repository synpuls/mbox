import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import { createImageKitSpecs, imageKitTheme } from "../image-kit.js";
import type { GfmDocument } from "./parser.js";
import { getGfmDocumentFromState } from "./parser-cache.js";

// Markdown images `![alt](url)`. Reuses the namespace-neutral image-kit (the same
// shared kit the mbox notation's markdown-image plugin uses), so the token/preview
// widgets, measurement figure and reveal-on-active behaviour are identical. The
// adapter already recovered each image's whole-run offsets and its url/alt from the
// mdast `image` node; here we just feed them to the kit, one image at a time so the
// active gate is evaluated per image line.
export const gfmImageClassName = "mbox-gfm-image";
export const gfmImageClassNames = {
  image: gfmImageClassName,
  token: "mbox-gfm-image-token",
  preview: "mbox-gfm-image-preview",
  element: "mbox-gfm-image-element",
};
const gfmImageInternalClassNames = {
  measure: "mbox-gfm-image-measure",
};

export type GfmImageRenderMode = "token" | "preview";

export interface GfmImagePluginOptions {
  renderMode?: GfmImageRenderMode;
}

const defaultRenderMode: GfmImageRenderMode = "token";

function createGfmImageSpecs(
  document: GfmDocument,
  activeLines: Set<number>,
  options: GfmImagePluginOptions,
): MboxDecorationSpec[] {
  const renderMode = options.renderMode ?? defaultRenderMode;
  return document.images.flatMap((image) =>
    createImageKitSpecs(
      [{ from: image.from, to: image.to, src: image.url, alt: image.alt, text: image.alt || image.url }],
      activeLines.has(image.line),
      gfmImageClassNames,
      gfmImageInternalClassNames,
      renderMode,
    ),
  );
}

export function gfmImagePlugin(options: GfmImagePluginOptions = {}): MboxPlugin {
  return {
    theme: imageKitTheme(gfmImageClassNames, gfmImageInternalClassNames),
    name: "gfm/image",
    decorations: (context) => createGfmImageSpecs(getGfmDocumentFromState(context.state), context.activeLineNumbers, options),
  };
}
