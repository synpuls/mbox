import { describe, expect, it } from "vitest";
import { scrapboxPlugins } from "./index.js";

describe("scrapboxPlugins", () => {
  it("bundles every scrapbox notation plugin in order", () => {
    expect(scrapboxPlugins()).toHaveLength(13);
  });

  it("uses context decoration providers for bundled Scrapbox rendering plugins", () => {
    const renderingPlugins = scrapboxPlugins().filter((plugin) => plugin.decorations);

    expect(renderingPlugins).toHaveLength(9);
    expect(renderingPlugins.every((plugin) => typeof plugin.decorations === "function")).toBe(true);
  });

  it("does not include the opt-in inline-code highlighter by default", () => {
    expect(scrapboxPlugins().some((plugin) => plugin.name === "scrapbox/inline-code-highlight")).toBe(false);
  });
});
