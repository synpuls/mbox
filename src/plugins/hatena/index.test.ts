import { describe, expect, it } from "vitest";
import { hatenaPlugins } from "./index.js";

describe("hatenaPlugins", () => {
  it("bundles every hatena notation plugin", () => {
    expect(hatenaPlugins()).toHaveLength(9);
  });

  it("adds the super-pre highlighter only when codeHighlight is set", () => {
    expect(hatenaPlugins({ codeHighlight: true })).toHaveLength(10);
    expect(hatenaPlugins({ codeHighlight: { languages: "all" } })).toHaveLength(10);
    expect(hatenaPlugins({ codeHighlight: false })).toHaveLength(9);
  });
});
