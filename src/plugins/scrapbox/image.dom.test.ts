import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import {
  scrapboxImageElementClassName,
  scrapboxImagePlugin,
  scrapboxImagePreviewClassName,
  scrapboxImageStrongClassName,
  scrapboxImageTokenClassName,
  ScrapboxImageMeasureWidget,
  ScrapboxImagePreviewWidget,
  ScrapboxImageWidget,
} from "./image.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const noActiveLines = new Set<number>();
const IMG = "[https://i.com/a.png]";

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxImagePlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxImageSpecs", () => {
  it("replaces an image with a token widget by default", () => {
    const [spec] = specsFor(IMG);

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 21 });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM();
    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ScrapboxImageWidget);
    expect(dom.className).toContain(scrapboxImageTokenClassName);
    expect(dom.dataset.src).toBe("https://i.com/a.png");
    expect(dom.textContent).toBe("https://i.com/a.png");
  });

  it("replaces an image with a preview figure in preview mode", () => {
    const [spec] = specsFor(IMG, { renderMode: "preview" });

    expect((spec as MboxReplaceDecorationSpec).widget).toBeInstanceOf(ScrapboxImagePreviewWidget);
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImagePreviewWidget).toDOM();
    expect(dom.className).toContain(scrapboxImagePreviewClassName);
    expect(dom.querySelector<HTMLImageElement>(`img.${scrapboxImageElementClassName}`)?.src).toBe(
      "https://i.com/a.png",
    );
  });

  it("wraps the preview image in an anchor when the image has a link", () => {
    const [spec] = specsFor("[https://i.com/a.png https://link.com]", { renderMode: "preview" });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImagePreviewWidget).toDOM();

    const anchor = dom.querySelector<HTMLAnchorElement>("a");
    expect(anchor?.getAttribute("href")).toBe("https://link.com");
    expect(anchor?.querySelector("img")).not.toBeNull();
  });

  it("adds the strong class for a double-bracket image", () => {
    const [spec] = specsFor("[[https://i.com/a.png]]");

    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM().className).toContain(scrapboxImageStrongClassName);
  });

  it("resolves a bare Gyazo url to its /raw form for the <img> src by default, keeping the original as text while dataset.src mirrors the resolved src", () => {
    const gyazo = "https://gyazo.com/0123456789abcdef0123456789abcdef";
    const [tokenSpec] = specsFor(`[${gyazo}]`);
    const tokenDom = ((tokenSpec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM();
    // A bare gyazo.com url serves an HTML page, not image bytes -- fetching
    // it directly as an <img> src gets ORB-blocked by the browser (confirmed
    // against a real Gyazo url), so `src` (and dataset.src, which mirrors it)
    // resolves to the /raw form via the default resolveSrc; `text` keeps the
    // original url for display.
    expect(tokenDom.dataset.src).toBe(`${gyazo}/raw`);
    expect(tokenDom.textContent).toBe(gyazo);

    const [previewSpec] = specsFor(`[${gyazo}]`, { renderMode: "preview" });
    const previewDom = ((previewSpec as MboxReplaceDecorationSpec).widget as ScrapboxImagePreviewWidget).toDOM();
    expect(previewDom.querySelector<HTMLImageElement>(`img.${scrapboxImageElementClassName}`)?.src).toBe(
      `${gyazo}/raw`,
    );
  });

  it("resolves a bare Gyazo url the same way for a double-bracket (strongImage) notation", () => {
    const gyazo = "https://gyazo.com/0123456789abcdef0123456789abcdef";
    const [spec] = specsFor(`[[${gyazo}]]`);
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM();

    expect(dom.dataset.src).toBe(`${gyazo}/raw`);
  });

  it("lets resolveSrc replace the default resolver entirely", () => {
    const [spec] = specsFor(IMG, { resolveSrc: (src: string) => `${src}?proxied` });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM();

    expect(dom.dataset.src).toBe("https://i.com/a.png?proxied");
    expect(dom.textContent).toBe("https://i.com/a.png");
  });

  it("does not apply the default Gyazo resolver once a custom resolveSrc is given", () => {
    const gyazo = "https://gyazo.com/0123456789abcdef0123456789abcdef";
    const [spec] = specsFor(`[${gyazo}]`, { resolveSrc: (src: string) => src });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxImageWidget).toDOM();

    expect(dom.dataset.src).toBe(gyazo);
  });
});

describe("ScrapboxImageMeasureWidget resize lifecycle", () => {
  it("observes the figure, cancels its laid-out inline size, and disconnects on destroy", () => {
    const observed: Element[] = [];
    const captured: { callback: ResizeObserverCallback | null } = { callback: null };
    let disconnects = 0;
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        captured.callback = cb;
      }
      observe(element: Element): void {
        observed.push(element);
      }
      unobserve(): void {}
      disconnect(): void {
        disconnects += 1;
      }
    }
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    try {
      const widget = new ScrapboxImageMeasureWidget({ src: "https://i.com/a.png" });
      const dom = widget.toDOM();

      // The measure figure itself is observed, and it is not pre-cancelled: the
      // margin only settles once the observer reports the laid-out size.
      expect(observed).toEqual([dom]);
      expect(dom.style.marginInlineEnd).toBe("0px");

      captured.callback?.(
        [{ target: dom, borderBoxSize: [{ inlineSize: 320, blockSize: 200 }] } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      // The full laid-out inline size is cancelled, so the widget adds ~0 inline advance.
      expect(dom.style.marginInlineEnd).toBe("-320px");

      widget.destroy(dom);
      expect(disconnects).toBe(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});

describe("scrapboxImagePlugin", () => {
  it("renders a preview image element in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: IMG,
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxImagePlugin({ renderMode: "preview" })] })],
      }),
    });

    expect(parent.querySelector<HTMLImageElement>(`img.${scrapboxImageElementClassName}`)?.getAttribute("src")).toBe(
      "https://i.com/a.png",
    );

    view.destroy();
  });
});
