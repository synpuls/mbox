import { describe, expect, it } from "vitest";
import { gfmPlugins } from "./gfm/index.js";
import { hatenaPlugins } from "./hatena/index.js";
import { mboxPlugins } from "./mbox/default.js";
import { scrapboxPlugins } from "./scrapbox/index.js";
import type { MboxPlugin } from "../editor/plugin.js";

function expectNamedDecorationPlugins(plugins: MboxPlugin[]) {
  const names = plugins.flatMap((plugin) => (plugin.decorations ? [plugin.name] : []));
  const unnamed = names.filter((name) => typeof name !== "string" || name.length === 0);
  const duplicateNames = [...new Set(names.filter((name): name is string => typeof name === "string" && name.length > 0))]
    .filter((name) => names.filter((candidate) => candidate === name).length > 1);

  expect(unnamed).toEqual([]);
  expect(duplicateNames).toEqual([]);
}

describe("built-in decoration plugin names", () => {
  it("gives every default and opt-in notation decoration provider a unique stable name", () => {
    expectNamedDecorationPlugins(mboxPlugins({ complete: { recommend: () => [] } }));
    expectNamedDecorationPlugins(gfmPlugins({ codeHighlight: true }));
    expectNamedDecorationPlugins(hatenaPlugins({ codeHighlight: true }));
    expectNamedDecorationPlugins(scrapboxPlugins({
      codeHighlight: true,
      complete: { recommend: () => [] },
      formula: {},
      inlineCodeHighlight: true,
      titleLine: true,
    }));
  });
});
