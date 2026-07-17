import type { MboxDecorationSpec, MboxPlugin, MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import {
  ImageKitMeasureWidget,
  ImageKitPreviewWidget,
  ImageKitTokenWidget,
  createImageKitSpecs,
  imageKitTheme,
  type ImageKitImage,
  type ImageKitInfo,
  type ImageKitWidgetFactories,
} from "../image-kit.js";
import { gyazoHostAndId, type ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import { scrapboxCodeBlockLineNumbers, type ScrapboxDocument } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";

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
 * what gets fetched. Use this when a domain serves a different address for
 * its live pixels than for the address that appears in notation -- e.g. the
 * default resolver (see {@link defaultScrapboxImageSrcResolver}) appends
 * `/raw` to a bare `gyazo.com/<id>` link, because that bare form serves
 * Gyazo's HTML viewer page rather than image bytes (blocked by the browser's
 * ORB check when used directly as an `<img>` src); `/raw` redirects to the
 * real image CDN. When set, this option replaces the default resolver
 * entirely -- call {@link defaultScrapboxImageSrcResolver} yourself if you
 * want to extend rather than replace its Gyazo handling.
 */
export type ScrapboxImageSrcResolver = (src: string) => string;

export interface ScrapboxImagePluginOptions {
  renderMode?: ScrapboxImageRenderMode;
  resolveSrc?: ScrapboxImageSrcResolver;
}

const defaultOptions: Required<Pick<ScrapboxImagePluginOptions, "renderMode">> = {
  renderMode: "token",
};

const bareGyazoImageUrlRegExp = new RegExp(`^${gyazoHostAndId}$`, "i");

/**
 * Default {@link ScrapboxImageSrcResolver}: append `/raw` to a bare Gyazo URL
 * (`gyazo.com/<id>`, or a subdomain like `i.gyazo.com/<id>`, with no `/raw`
 * suffix -- confirmed against a real Gyazo URL to serve an HTML viewer page,
 * ORB-blocked as an `<img>` src) so it resolves to Gyazo's actual image CDN
 * instead. Any other src is returned unchanged by this default resolver.
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

export class ScrapboxImageMeasureWidget extends ImageKitMeasureWidget {
  constructor(image: ImageKitImage) {
    super(image, scrapboxImageClassNames, scrapboxImageInternalClassNames);
  }

  /**
   * On a focused image line the raw notation text is shown in place of the
   * preview, and this hidden measure widget reserves the space the preview would
   * have taken so the line (and everything below it) does not jump. It should
   * reserve only the *height*: reserving the preview's full *width* too would
   * shove any same-line text after the image far to the right — pure editing
   * noise.
   *
   * The figure is kept in normal flow (a direct child of the line), so the app's
   * sizing resolves against the real content width and its height matches the
   * visible preview exactly — crucially this survives a percentage sizing such
   * as `max-width: min(100%, 320px)`, where the `100%` must resolve against the
   * content width, not some narrow width-clipping wrapper (a wrapper that can
   * clip is always the child's containing block, so it would collapse the width
   * *and the height with it*). Instead of clipping, the figure's own rendered
   * width is pulled back with a negative inline-end margin, so its inline
   * advance is ~0 while its height stays. A {@link ResizeObserver} keeps the
   * margin in sync as the content width — and thus the responsive figure width —
   * changes.
   */
  toDOM(): HTMLElement {
    const figure = this.renderFigure();
    figure.style.marginInlineEnd = "0px";

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        // Cancel exactly the figure's laid-out inline size. Use the observer's
        // `borderBoxSize` — the *layout* (pre-transform) size, in the same
        // coordinate space as `margin` — rather than `getBoundingClientRect()`,
        // whose width is the post-transform *visual* size: under an ancestor
        // `transform: scale(...)` (e.g. a zoomed/presentation view) the visual
        // width is smaller than the layout width, so cancelling by it would
        // leave a stale advance. With the figure's max-width-based sizing the
        // margin does not change its observed border-box size, so this does not
        // feed back into a resize loop; the equality guard also skips redundant
        // style writes (and any pathological host CSS that oscillated would be
        // damped, not amplified).
        const inlineSize = entry?.borderBoxSize?.[0]?.inlineSize ?? (figure as HTMLElement).offsetWidth;
        const marginInlineEnd = `-${inlineSize}px`;
        if (figure.style.marginInlineEnd !== marginInlineEnd) {
          figure.style.marginInlineEnd = marginInlineEnd;
        }
      });
      observer.observe(figure);
      (figure as MeasureFigure)[measureObserverKey] = observer;
    }
    return figure;
  }

  destroy(dom: HTMLElement): void {
    (dom as MeasureFigure)[measureObserverKey]?.disconnect();
  }
}

const measureObserverKey = Symbol("mboxMeasureObserver");

type MeasureFigure = HTMLElement & { [measureObserverKey]?: ResizeObserver };

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
  activeLines: MboxActiveLineNumbers,
  options: ScrapboxImagePluginOptions = {},
): MboxDecorationSpec[] {
  const codeBlockLineNumbers = scrapboxCodeBlockLineNumbers(document);
  const renderMode = options.renderMode ?? defaultOptions.renderMode;
  const resolveSrc = options.resolveSrc ?? defaultScrapboxImageSrcResolver;

  return document.lines.flatMap((line) => {
    if (codeBlockLineNumbers.has(line.line)) {
      return [];
    }

    const isActive = activeLines.has(line.line);
    const images = collectScrapboxInlineNodeResults(line.inline, (node) => collectImages(resolveSrc, node));
    return createImageKitSpecs(
      images,
      isActive,
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
      return createScrapboxImageSpecs(document, context.activeLineNumbers, options);
    },
  };
}
