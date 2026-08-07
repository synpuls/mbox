import { describe, expect, it, vi } from "vitest";
import { createTestContext } from "../editor/test-context.js";

const anchorFactory = vi.hoisted(() =>
  vi.fn(() => {
    const anchor = document.createElement("a");
    anchor.dataset.anchorFactory = "shared";
    return anchor;
  }),
);

vi.mock("./inline-notation-kit.js", () => ({ createAnchorElement: anchorFactory }));

import { GfmLinkWidget } from "./gfm/link.js";
import { HatenaLinkWidget } from "./hatena/link.js";
import { pageLinkPlugin } from "./mbox/page-link.js";
import { urlLinkPlugin } from "./mbox/url-link.js";
import { ScrapboxLinkWidget } from "./scrapbox/link.js";

function firstWidget(plugin: ReturnType<typeof pageLinkPlugin> | ReturnType<typeof urlLinkPlugin>, doc: string): { toDOM(): HTMLElement } {
  const [spec] = plugin.decorations!(createTestContext(doc));
  return (spec as unknown as { widget: { toDOM(): HTMLElement } }).widget;
}

describe("createAnchorElement callers", () => {
  it("GFM link returns an anchor created by the shared factory", () => {
    const anchor = new GfmLinkWidget("label", "https://example.com", false, true).toDOM();

    expect(anchor.dataset.anchorFactory).toBe("shared");
  });

  it("Hatena link returns an anchor created by the shared factory", () => {
    const anchor = new HatenaLinkWidget("https://example.com", "label", "bracket").toDOM();

    expect(anchor.dataset.anchorFactory).toBe("shared");
  });

  it("mbox URL link returns an anchor created by the shared factory", () => {
    const anchor = firstWidget(urlLinkPlugin(), "[label](https://example.com)").toDOM();

    expect(anchor.dataset.anchorFactory).toBe("shared");
  });

  it("mbox page link returns an anchor created by the shared factory", () => {
    const anchor = firstWidget(pageLinkPlugin(), "[Page]").toDOM();

    expect(anchor.dataset.anchorFactory).toBe("shared");
  });

  it("Scrapbox link returns an anchor created by the shared factory", () => {
    const anchor = new ScrapboxLinkWidget("./Page", "Page", "mbox-scrapbox-link", false).toDOM();

    expect(anchor.dataset.anchorFactory).toBe("shared");
  });
});
