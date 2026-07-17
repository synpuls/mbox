import { describe, expect, it } from "vitest";
import {
  ImageKitMeasureWidget,
  ImageKitTokenWidget,
  createImageKitSpecs,
  imageKitTheme,
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
  it("passes widget factories image data without document positions", () => {
    const seenImages: unknown[] = [];

    createImageKitSpecs(
      [{ from: 1, to: 8, src: "image.png", alt: "Alt", text: "Alt" }],
      false,
      classNames,
      measureClassNames,
      "token",
      {
        token: (image) => {
          seenImages.push(image);
          return new ImageKitTokenWidget(image, classNames);
        },
      },
    );

    expect(seenImages).toEqual([{ src: "image.png", alt: "Alt", text: "Alt" }]);
  });

  it("creates only a measure widget for an active image in preview mode", () => {
    const [spec] = createImageKitSpecs(
      [{ from: 1, to: 8, src: "image.png", alt: "Alt", text: "Alt" }],
      true,
      classNames,
      measureClassNames,
      "preview",
    );

    expect(spec).toMatchObject({ type: "widget", from: 1, side: -1 });
    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ImageKitMeasureWidget);
  });

  it("creates no specs for an active image in token mode", () => {
    expect(
      createImageKitSpecs(
        [{ from: 1, to: 8, src: "image.png", alt: "Alt", text: "Alt" }],
        true,
        classNames,
        measureClassNames,
        "token",
      ),
    ).toEqual([]);
  });
});

describe("ImageKit widgets", () => {
  it("does not treat different token widget subclasses as equal", () => {
    class CustomTokenWidget extends ImageKitTokenWidget {}

    const base = new ImageKitTokenWidget({ src: "image.png" }, classNames);
    const custom = new CustomTokenWidget({ src: "image.png" }, classNames);

    expect(base.eq(custom)).toBe(false);
  });
});

describe("imageKitTheme", () => {
  it("returns shared preview, measure, and image element styles", () => {
    expect(imageKitTheme(classNames, measureClassNames)).toMatchObject({
      ".test-preview": {
        display: "inline-block",
        margin: "0",
        verticalAlign: "top",
      },
      ".test-measure": {
        display: "inline-block",
        margin: "0",
        verticalAlign: "top",
        visibility: "hidden",
        pointerEvents: "none",
      },
      ".test-element": {
        display: "block",
        height: "auto",
      },
    });
  });
});
