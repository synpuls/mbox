import { WidgetType } from "@codemirror/view";
import type { MboxDecorationSpec, MboxThemeSpec } from "../editor/plugin.js";

export type ImageKitRenderMode = "token" | "preview";

export interface ImageKitClassNames {
  image: string;
  token: string;
  preview: string;
  element: string;
}

export interface ImageKitMeasureClassNames {
  measure: string;
}

export interface ImageKitImage {
  src: string;
  alt?: string;
  text?: string;
  link?: string;
  /** Additive: appended after the widget's own base class(es), never replaces them. */
  className?: string;
}

export interface ImageKitInfo extends ImageKitImage {
  from: number;
  to: number;
}

export interface ImageKitWidgetFactories {
  token?: (image: ImageKitImage, classNames: ImageKitClassNames) => WidgetType;
  preview?: (image: ImageKitImage, classNames: ImageKitClassNames) => WidgetType;
  measure?: (
    image: ImageKitImage,
    classNames: ImageKitClassNames,
    measureClassNames: ImageKitMeasureClassNames,
  ) => WidgetType;
}

function imageClassNameSuffix(image: ImageKitImage): string {
  return image.className ? ` ${image.className}` : "";
}

function createImageElement(src: string, alt: string, className: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = className;
  image.src = src;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  return image;
}

export class ImageKitTokenWidget extends WidgetType {
  constructor(
    private readonly image: ImageKitImage,
    private readonly classNames: ImageKitClassNames,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageKitTokenWidget &&
      this.constructor === other.constructor &&
      this.image.src === other.image.src &&
      this.image.alt === other.image.alt &&
      this.image.text === other.image.text &&
      this.image.link === other.image.link &&
      this.image.className === other.image.className &&
      this.classNames === other.classNames
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = `${this.classNames.image} ${this.classNames.token}${imageClassNameSuffix(this.image)}`;
    element.dataset.src = this.image.src;
    if (this.image.alt !== undefined) {
      element.dataset.alt = this.image.alt;
    }
    if (this.image.link) {
      element.dataset.link = this.image.link;
    }
    element.textContent = this.image.text ?? this.image.alt ?? this.image.src;
    return element;
  }
}

export class ImageKitPreviewWidget extends WidgetType {
  constructor(
    private readonly image: ImageKitImage,
    private readonly classNames: ImageKitClassNames,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageKitPreviewWidget &&
      this.constructor === other.constructor &&
      this.image.src === other.image.src &&
      this.image.alt === other.image.alt &&
      this.image.link === other.image.link &&
      this.image.className === other.image.className &&
      this.classNames === other.classNames
    );
  }

  toDOM(): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = `${this.classNames.image} ${this.classNames.preview}${imageClassNameSuffix(this.image)}`;
    figure.dataset.src = this.image.src;
    if (this.image.alt !== undefined) {
      figure.dataset.alt = this.image.alt;
    }
    figure.setAttribute("role", "figure");

    const image = createImageElement(this.image.src, this.image.alt ?? "", this.classNames.element);
    if (this.image.link) {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", this.image.link);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer");
      anchor.appendChild(image);
      figure.appendChild(anchor);
    } else {
      figure.appendChild(image);
    }
    return figure;
  }
}

export class ImageKitMeasureWidget extends WidgetType {
  constructor(
    private readonly image: ImageKitImage,
    private readonly classNames: ImageKitClassNames,
    private readonly measureClassNames: ImageKitMeasureClassNames,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageKitMeasureWidget &&
      this.constructor === other.constructor &&
      this.image.src === other.image.src &&
      this.image.alt === other.image.alt &&
      this.image.className === other.image.className &&
      this.classNames === other.classNames &&
      this.measureClassNames === other.measureClassNames
    );
  }

  toDOM(): HTMLElement {
    return this.renderFigure();
  }

  /**
   * The hidden, correctly-sized preview figure whose intrinsic size reserves the
   * space the visible preview would occupy. Exposed so a subclass can reuse or
   * customize it (e.g. to reserve only its height, not its width) without
   * re-deriving the class list and image attributes.
   */
  protected renderFigure(): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = `${this.classNames.image} ${this.classNames.preview} ${this.measureClassNames.measure}${imageClassNameSuffix(this.image)}`;
    figure.dataset.src = this.image.src;
    if (this.image.alt !== undefined) {
      figure.dataset.alt = this.image.alt;
    }
    figure.setAttribute("aria-hidden", "true");
    figure.appendChild(createImageElement(this.image.src, "", this.classNames.element));
    return figure;
  }
}

function imageDataForWidget(image: ImageKitInfo): ImageKitImage {
  const { from: _from, to: _to, ...imageData } = image;
  return imageData;
}

export function createImageKitSpecs(
  images: ImageKitInfo[],
  active: boolean,
  classNames: ImageKitClassNames,
  measureClassNames: ImageKitMeasureClassNames,
  renderMode: ImageKitRenderMode,
  widgetFactories: ImageKitWidgetFactories = {},
): MboxDecorationSpec[] {
  const tokenWidget = widgetFactories.token ?? ((image, classNames) => new ImageKitTokenWidget(image, classNames));
  const previewWidget = widgetFactories.preview ?? ((image, classNames) => new ImageKitPreviewWidget(image, classNames));
  const measureWidget =
    widgetFactories.measure ??
    ((image, classNames, measureClassNames) => new ImageKitMeasureWidget(image, classNames, measureClassNames));

  return images.flatMap((image): MboxDecorationSpec[] => {
    const widgetImage = imageDataForWidget(image);

    if (active) {
      return renderMode === "preview"
        ? [
            {
              type: "widget",
              from: image.from,
              to: image.from,
              widget: measureWidget(widgetImage, classNames, measureClassNames),
              side: -1,
            },
          ]
        : [];
    }

    return [
      {
        type: "replace",
        from: image.from,
        to: image.to,
        widget:
          renderMode === "preview"
            ? previewWidget(widgetImage, classNames)
            : tokenWidget(widgetImage, classNames),
      },
    ];
  });
}

export function imageKitTheme(classNames: ImageKitClassNames, measureClassNames: ImageKitMeasureClassNames): MboxThemeSpec {
  return {
    [`.${classNames.preview}`]: {
      display: "inline-block",
      margin: "0",
      verticalAlign: "top",
    },
    [`.${measureClassNames.measure}`]: {
      display: "inline-block",
      margin: "0",
      verticalAlign: "top",
      visibility: "hidden",
      pointerEvents: "none",
    },
    [`.${classNames.element}`]: {
      display: "block",
      height: "auto",
    },
  };
}
