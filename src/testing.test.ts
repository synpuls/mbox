import { describe, expect, it } from "vitest";
import { createTestContext, validateDecorationSpecs } from "./testing.js";

describe("./testing sub-path", () => {
  it("exports validateDecorationSpecs and createTestContext for third-party plugin authors", () => {
    const context = createTestContext("ab");

    expect(() => validateDecorationSpecs(context, [{ type: "replace", from: 0, to: 2 }])).not.toThrow();
  });
});
