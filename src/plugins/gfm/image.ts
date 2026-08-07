import { Facet } from "@codemirror/state";
import type { MboxDecorationSpec, MboxPlugin } from "../../editor/plugin.js";
import {
  createImageKitSpecs,
  ImageKitSelfCancelingMeasureWidget,
  imageKitTheme,
  type ImageKitImage,
  type ImageKitWidgetFactories,
} from "../image-kit.js";
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
export const gfmImageInternalClassNames = {
  measure: "mbox-gfm-image-measure",
};

export type GfmImageRenderMode = "token" | "preview";

export interface GfmImagePluginOptions {
  renderMode?: GfmImageRenderMode;
}

// GitHub renders an `<img>`, so this namespace does too. The owner chose to
// match the notation rather than keep the safer-looking default.
//
// Two consequences, neither of them hidden: an editor built with no options now
// FETCHES the URLs in its document -- GitHub proxies those requests, mbox does
// not, so this is a privacy and network-policy change -- and a host that relied
// on alt text appearing gets a different-looking editor. A host that does not
// want external images must now say `renderMode: "token"` explicitly.
//
// The other notations still default to `token`: theirs is not GitHub's
// notation, and nothing about them was decided here.
const defaultRenderMode: GfmImageRenderMode = "preview";

/**
 * @internal Whether any image plugin in this editor renders previews.
 *
 * The table plugin needs this to decide whether a cell holding an image should
 * claim a wider column: reserving that width when the image will be drawn as
 * alt text anyway would leave a wide empty column. The two plugins do not know
 * about each other otherwise, and a host is free to assemble them individually
 * rather than through `gfmPlugins`, so passing the option along that path only
 * would break exactly the hand-assembled case -- and break it silently.
 *
 * Combined with `some`: one preview-rendering image plugin is enough.
 */
export const gfmImagePreviewEnabled = Facet.define<boolean, boolean>({
  combine: (values) => values.some(Boolean),
});

/**
 * Reserves the preview's HEIGHT only while its line is being edited.
 *
 * Reserving the width as well pushes the raw Markdown sideways, and inside a
 * table cell it is worse than noise: the row is already constrained, so a
 * figure that claims its full width grows the row instead. The figure cancels
 * its own advance rather than relying on a host rule, because the width is
 * responsive and a host cannot know it.
 */
class GfmImageMeasureWidget extends ImageKitSelfCancelingMeasureWidget {
  constructor(image: ImageKitImage) {
    super(image, gfmImageClassNames, gfmImageInternalClassNames);
  }
}

const gfmImageWidgetFactories = {
  measure: (image) => new GfmImageMeasureWidget(image),
} satisfies ImageKitWidgetFactories;

function createGfmImageSpecs(
  document: GfmDocument,
  source: string | { sliceString(from: number, to: number): string },
  activeLines: Set<number>,
  options: GfmImagePluginOptions,
): MboxDecorationSpec[] {
  const renderMode = options.renderMode ?? defaultRenderMode;
  return document.images.flatMap((image) =>
    createImageKitSpecs(
      [{ from: image.from, to: image.to, src: image.url, alt: image.alt, text: image.alt || image.url }],
      activeLines.has(image.line),
      source,
      gfmImageClassNames,
      gfmImageInternalClassNames,
      // Table cells used to force the token here. They no longer do: the table
      // plugin reserves a column for a cell that holds an image (see
      // gfmImagePreviewEnabled), and the theme keeps the picture inside that
      // cell. `inTableCell` stays on the record because the reservation is the
      // table's business, not this plugin's.
      renderMode,
      gfmImageWidgetFactories,
    ),
  );
}

export function gfmImagePlugin(options: GfmImagePluginOptions = {}): MboxPlugin {
  return {
    theme: imageKitTheme(gfmImageClassNames, gfmImageInternalClassNames),
    extensions: [gfmImagePreviewEnabled.of((options.renderMode ?? defaultRenderMode) === "preview")],
    name: "gfm/image",
    decorations: (context) => createGfmImageSpecs(getGfmDocumentFromState(context.state), context.state.doc, context.activeLineNumbers, options),
  };
}
