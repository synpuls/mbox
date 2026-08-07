import { describe, expect, it } from "vitest";
import {
  ImageKitMeasureWidget,
  ImageKitPreviewWidget,
  ImageKitTokenWidget,
  createImageKitSpecs,
} from "./image-kit.js";
import type { MboxReplaceDecorationSpec } from "../editor/plugin.js";

const classNames = {
  image: "test-image",
  token: "test-token",
  preview: "test-preview",
  element: "test-element",
};

const measureClassNames = {
  measure: "test-measure",
};

describe("createImageKitSpecs", () => {
  it("creates a token replace widget for an inactive image in token mode", () => {
    const [spec] = createImageKitSpecs(
      [{ from: 1, to: 8, src: "image.png", alt: "Alt", text: "Alt" }],
      false,
      "  image.png",
      classNames,
      measureClassNames,
      "token",
    );

    expect(spec).toMatchObject({ type: "replace", from: 1, to: 8 });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ImageKitTokenWidget);
    expect(((spec as MboxReplaceDecorationSpec).widget as ImageKitTokenWidget).toDOM().textContent).toBe("Alt");
  });

  it("creates a preview replace widget for an inactive image in preview mode", () => {
    const [spec] = createImageKitSpecs(
      [
        {
          from: 1,
          to: 8,
          src: "image.png",
          alt: "Alt",
          text: "Alt",
          link: "https://example.com",
          className: "test-extra",
        },
      ],
      false,
      "  image.png",
      classNames,
      measureClassNames,
      "preview",
    );

    const dom = ((spec as MboxReplaceDecorationSpec).widget as ImageKitPreviewWidget).toDOM();
    const anchor = dom.querySelector<HTMLAnchorElement>("a");
    const image = dom.querySelector<HTMLImageElement>("img");

    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ImageKitPreviewWidget);
    expect(dom.className).toContain(classNames.preview);
    expect(dom.className).toContain("test-extra");
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(image?.className).toBe(classNames.element);
    expect(image?.alt).toBe("Alt");
  });

  it("carries the image's extra class into the measure widget too, so the reserved size matches the preview", () => {
    const [spec] = createImageKitSpecs(
      [{ from: 1, to: 8, src: "image.png", alt: "Alt", text: "Alt", className: "test-extra" }],
      true,
      "  image.png",
      classNames,
      measureClassNames,
      "preview",
    );

    const dom = ((spec as MboxReplaceDecorationSpec).widget as ImageKitMeasureWidget).toDOM();
    expect(dom.className).toContain("test-extra");
  });
});
