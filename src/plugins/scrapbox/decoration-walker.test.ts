import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "../../editor/test-context.js";

describe("scrapbox decoration traversal", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("collects decoration specs through the shared inline walker", async () => {
    let walkCount = 0;
    vi.doMock("./inline-walker.js", async () => {
      const actual = await vi.importActual<typeof import("./inline-walker.js")>("./inline-walker.js");
      return {
        ...actual,
        collectScrapboxInlineNodeResults: (...args: Parameters<typeof actual.collectScrapboxInlineNodeResults>) => {
          walkCount += 1;
          return actual.collectScrapboxInlineNodeResults(...args);
        },
      };
    });
    const { scrapboxDecorationPlugin, scrapboxStrongClassName } = await import("./decoration.js");
    const input = "[[* bold]]";

    expect(scrapboxDecorationPlugin().decorations!(createTestContext(input))).toEqual(
      expect.arrayContaining([expect.objectContaining({ className: expect.stringContaining(scrapboxStrongClassName) })]),
    );
    expect(walkCount).toBeGreaterThan(0);
  });
});
