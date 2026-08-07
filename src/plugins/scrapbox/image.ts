import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import {
  ImageKitSelfCancelingMeasureWidget,
  ImageKitPreviewWidget,
  ImageKitTokenWidget,
  createImageKitSpecs,
  imageKitTheme,
  type ImageKitImage,
  type ImageKitInfo,
  type ImageKitWidgetFactories,
} from "../image-kit.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxBlockLineNumbers } from "./visible-lines.js";

export const scrapboxImageClassName = "mbox-scrapbox-image";
export const scrapboxImageTokenClassName = "mbox-scrapbox-image-token";
export const scrapboxImagePreviewClassName = "mbox-scrapbox-image-preview";
export const scrapboxImageElementClassName = "mbox-scrapbox-image-element";
export const scrapboxImageStrongClassName = "mbox-scrapbox-image-strong";
export const scrapboxImageMeasureClassName = "mbox-scrapbox-image-measure";

export const scrapboxImageClassNames = {
  image: scrapboxImageClassName,
  token: scrapboxImageTokenClassName,
  preview: scrapboxImagePreviewClassName,
  element: scrapboxImageElementClassName,
  strong: scrapboxImageStrongClassName,
};

const scrapboxImageInternalClassNames = {
  measure: scrapboxImageMeasureClassName,
};

export type ScrapboxImageRenderMode = "token" | "preview";

/**
 * Transform an image notation's matched URL into the one actually fetched as
 * the `<img>` src. Called with the raw `src` an `image`/`strongImage` node
 * matched, unparsed; returning it unchanged is always safe. `text`/`link`
 * (the widget's display label and click-through href) are left as the
 * matched URL regardless of what this returns, so the resolver only affects
 * what gets fetched. Use this when a host serves a different address for its
 * image bytes than the address that appears in notation -- see
 * {@link defaultScrapboxImageSrcResolver} for the one case mbox handles out of
 * the box. When set, this option replaces the default resolver entirely --
 * call {@link defaultScrapboxImageSrcResolver} yourself if you want to extend
 * rather than replace it.
 */
export type ScrapboxImageSrcResolver = (src: string) => string;

export interface ScrapboxImagePluginOptions {
  renderMode?: ScrapboxImageRenderMode;
  resolveSrc?: ScrapboxImageSrcResolver;
}

const defaultOptions: Required<Pick<ScrapboxImagePluginOptions, "renderMode">> = {
  renderMode: "token",
};

// Intentionally broader than inline classification: the public resolver may
// be called directly with arbitrary strings, and its documented compatibility
// includes a single subdomain such as i.gyazo.com. This is a deliberate split
// between classification policy and public API compatibility, not accidental
// duplication. Whether that compatibility should narrow is owner-pending.
const bareGyazoImageUrlRegExp = /^https?:\/\/(?:[0-9a-z-]+\.)?gyazo\.com\/[0-9a-f]{32}$/i;

/**
 * Default {@link ScrapboxImageSrcResolver}: append `/raw` to a bare
 * `gyazo.com/<id>` URL (or a subdomain like `i.gyazo.com/<id>`) that has no
 * `/raw` suffix, because the bare form did not load as an `<img>` src when
 * this was written. Any other src is returned unchanged.
 *
 * SOURCE NOT RECORDED. That observation has no recorded input, method or date.
 * Treat the rule as mbox's own default, not as a durable fact about the host:
 * a consumer that finds otherwise passes its own `resolveSrc`.
 */
export function defaultScrapboxImageSrcResolver(src: string): string {
  return bareGyazoImageUrlRegExp.test(src) ? `${src}/raw` : src;
}

export class ScrapboxImageWidget extends ImageKitTokenWidget {
  constructor(image: ImageKitImage) {
    super(image, scrapboxImageClassNames);
  }
}

export class ScrapboxImagePreviewWidget extends ImageKitPreviewWidget {
  constructor(image: ImageKitImage) {
    super(image, scrapboxImageClassNames);
  }
}

/**
 * Reserves the preview's HEIGHT only. Reserving its width as well would shove
 * any same-line text after the image far to the right while the line is being
 * edited -- pure noise. The cancelling mechanism lives in the kit; see
 * {@link ImageKitSelfCancelingMeasureWidget} for why it is a negative margin
 * and a ResizeObserver rather than a wrapper.
 */
export class ScrapboxImageMeasureWidget extends ImageKitSelfCancelingMeasureWidget {
  constructor(image: ImageKitImage) {
    super(image, scrapboxImageClassNames, scrapboxImageInternalClassNames);
  }
}

const scrapboxImageWidgetFactories = {
  token: (image) => new ScrapboxImageWidget(image),
  preview: (image) => new ScrapboxImagePreviewWidget(image),
  measure: (image) => new ScrapboxImageMeasureWidget(image),
} satisfies ImageKitWidgetFactories;

function collectImages(resolveSrc: ScrapboxImageSrcResolver, node: ScrapboxInlineNode): ImageKitInfo[] {
  switch (node.type) {
    case "image":
      return [{ from: node.from, to: node.to, src: resolveSrc(node.src), text: node.src, link: node.link }];
    case "strongImage":
      return [
        {
          from: node.from,
          to: node.to,
          src: resolveSrc(node.src),
          text: node.src,
          link: "",
          className: scrapboxImageStrongClassName,
        },
      ];
    default:
      return [];
  }
}

function createScrapboxImageSpecs(
  document: ScrapboxDocument,
  source: string | { sliceString(from: number, to: number): string },
  activeLines: MboxActiveLineNumbers,
  options: ScrapboxImagePluginOptions = {},
): MboxDecorationSpec[] {
  // Scrapbox leaves image notation raw in table cells (in both token and
  // preview configurations), unlike page/external links. Code blocks are raw
  // too, so this provider uses the complete block skip set.
  const blockLineNumbers = scrapboxBlockLineNumbers(document);
  const renderMode = options.renderMode ?? defaultOptions.renderMode;
  const resolveSrc = options.resolveSrc ?? defaultScrapboxImageSrcResolver;

  return document.lines.flatMap((line) => {
    if (blockLineNumbers.has(line.line)) {
      return [];
    }

    const isActive = activeLines.has(line.line);
    const images = collectScrapboxInlineNodeResults(line.inline, (node) => collectImages(resolveSrc, node));
    return createImageKitSpecs(
      images,
      isActive,
      source,
      scrapboxImageClassNames,
      scrapboxImageInternalClassNames,
      renderMode,
      scrapboxImageWidgetFactories,
    );
  });
}

export function scrapboxImagePlugin(options: ScrapboxImagePluginOptions = {}): MboxPlugin {
  return {
    theme: imageKitTheme(scrapboxImageClassNames, scrapboxImageInternalClassNames),
    name: "scrapbox/image",
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      return createScrapboxImageSpecs(document, context.state.doc, context.activeLineNumbers, options);
    },
  };
}
