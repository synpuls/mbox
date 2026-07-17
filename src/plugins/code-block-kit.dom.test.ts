import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeBlockKitCopyButtonWidget } from "./code-block-kit.js";

describe("CodeBlockKitCopyButtonWidget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a button that writes only the given code to the clipboard", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { written.push(text); } },
    });
    const button = new CodeBlockKitCopyButtonWidget("const x = 1\n", "test-copy-button").toDOM();

    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toBe("test-copy-button");
    expect(button.textContent).toBe("Copy");

    button.click();
    await Promise.resolve();

    expect(written).toEqual(["const x = 1\n"]);
    expect(button.dataset.copied).toBe("true");
  });

  it("shows Copied for one second after a successful clipboard write", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    });
    const button = new CodeBlockKitCopyButtonWidget("const x = 1\n", "test-copy-button").toDOM();

    button.click();
    await Promise.resolve();

    expect(button.textContent).toBe("Copied");
    vi.advanceTimersByTime(999);
    expect(button.textContent).toBe("Copied");
    vi.advanceTimersByTime(1);
    expect(button.textContent).toBe("Copy");
    expect(button.dataset.copied).toBeUndefined();
  });

  it("clears a previous copy-failure flag after a later successful copy", async () => {
    let shouldFail = true;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          if (shouldFail) {
            throw new Error("denied");
          }
        },
      },
    });
    const button = new CodeBlockKitCopyButtonWidget("const x = 1;\n", "test-copy-button").toDOM();

    button.click();
    await Promise.resolve();
    expect(button.dataset.copyFailed).toBe("true");

    shouldFail = false;
    button.click();
    await Promise.resolve();

    expect(button.dataset.copyFailed).toBeUndefined();
    expect(button.dataset.copied).toBe("true");
  });
});
