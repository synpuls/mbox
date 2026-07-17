import { describe, expect, it } from "vitest";
import { mboxPlugins } from "./default.js";

describe("mboxPlugins", () => {
  it("includes bracket auto-close and completion (inert by default) in the built-in plugin set", () => {
    expect(mboxPlugins()).toHaveLength(16);
  });

  it("uses context decoration providers for bundled mbox rendering plugins", () => {
    const renderingPlugins = mboxPlugins().filter((plugin) => plugin.decorations);

    expect(renderingPlugins).toHaveLength(14);
    expect(renderingPlugins.every((plugin) => typeof plugin.decorations === "function")).toBe(true);
  });

  it("keeps completion inert by default, activated via options.complete", () => {
    const totalExtensionsWithoutComplete = mboxPlugins().reduce((sum, plugin) => sum + (plugin.extensions?.length ?? 0), 0);

    const recommend = () => [{ title: "ruby" }];
    const totalExtensionsWithComplete = mboxPlugins({ complete: { recommend } }).reduce(
      (sum, plugin) => sum + (plugin.extensions?.length ?? 0),
      0,
    );

    // Only the completion plugin's own extensions field changes size based on
    // options.complete -- everything else (including bracket auto-close's own
    // fixed extension) stays constant, so the difference isolates it exactly.
    expect(totalExtensionsWithComplete - totalExtensionsWithoutComplete).toBe(1);
  });
});
