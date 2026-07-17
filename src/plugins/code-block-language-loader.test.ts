import { LanguageDescription } from "@codemirror/language";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodeBlockKitLanguageLoader } from "./code-block-language-loader.js";

function noInfoValues() {
  return [];
}

describe("createCodeBlockKitLanguageLoader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for an info string before any load has been requested", () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    expect(loader.getLanguage("python")).toBeNull();
  });

  it("loads a language by its exact name and returns it from getLanguage afterward", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await loader.ensureLanguageLoaded("python");
    expect(loader.getLanguage("python")).not.toBeNull();
  });

  it("loads a language by one of its aliases", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await loader.ensureLanguageLoaded("rb");
    expect(loader.getLanguage("rb")).not.toBeNull();
  });

  it("loads a language matched from a filename-style info string", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await loader.ensureLanguageLoaded("script.py");
    expect(loader.getLanguage("script.py")).not.toBeNull();
  });

  it("shares the cache across aliases that resolve to the same language", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await loader.ensureLanguageLoaded("rb");
    // "ruby" was never explicitly loaded, but it resolves to the same
    // LanguageDescription as "rb", so it's already available.
    expect(loader.getLanguage("ruby")).not.toBeNull();
  });

  it("never loads anything for an unsupported language, and getLanguage stays null", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await loader.ensureLanguageLoaded("totally-not-a-real-language");
    expect(loader.getLanguage("totally-not-a-real-language")).toBeNull();
  });

  it("resolves immediately for an empty info string", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);
    await expect(loader.ensureLanguageLoaded("")).resolves.toBeUndefined();
  });

  it("restricts matching to the given whitelist, ignoring languages outside it", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues, { languages: ["python"] });
    await loader.ensureLanguageLoaded("ruby");
    expect(loader.getLanguage("ruby")).toBeNull();
  });

  it("still resolves a whitelisted language", async () => {
    const loader = createCodeBlockKitLanguageLoader(noInfoValues, { languages: ["python"] });
    await loader.ensureLanguageLoaded("python");
    expect(loader.getLanguage("python")).not.toBeNull();
  });

  describe("with infoValueKind: \"fileName\"", () => {
    it("resolves a filename containing spaces, unlike the default infoString interpretation", async () => {
      const infoStringLoader = createCodeBlockKitLanguageLoader(noInfoValues);
      await infoStringLoader.ensureLanguageLoaded("my script.py");
      expect(infoStringLoader.getLanguage("my script.py")).toBeNull();

      const fileNameLoader = createCodeBlockKitLanguageLoader(noInfoValues, { infoValueKind: "fileName" });
      await fileNameLoader.ensureLanguageLoaded("my script.py");
      expect(fileNameLoader.getLanguage("my script.py")).not.toBeNull();
    });
  });

  it("calls onLoadError and leaves the language unavailable when a load rejects", async () => {
    const loadError = new Error("network down");
    vi.spyOn(LanguageDescription.prototype, "load").mockRejectedValueOnce(loadError);
    const onLoadError = vi.fn();

    const loader = createCodeBlockKitLanguageLoader(noInfoValues, { onLoadError });
    await loader.ensureLanguageLoaded("ruby");

    expect(loader.getLanguage("ruby")).toBeNull();
    expect(onLoadError).toHaveBeenCalledWith("ruby", loadError);
  });

  it("does not retry a failed load on a later call", async () => {
    const loadSpy = vi.spyOn(LanguageDescription.prototype, "load").mockRejectedValueOnce(new Error("network down"));
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);

    await loader.ensureLanguageLoaded("ruby");
    await loader.ensureLanguageLoaded("ruby");

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it("calls load() only once when ensureLanguageLoaded is called concurrently for the same language, including via an alias", async () => {
    const loadSpy = vi.spyOn(LanguageDescription.prototype, "load");
    const loader = createCodeBlockKitLanguageLoader(noInfoValues);

    // "ruby" and "rb" resolve to the same LanguageDescription; none of these
    // three calls has resolved yet when the next one starts.
    await Promise.all([
      loader.ensureLanguageLoaded("ruby"),
      loader.ensureLanguageLoaded("ruby"),
      loader.ensureLanguageLoaded("rb"),
    ]);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loader.getLanguage("ruby")).not.toBeNull();
    expect(loader.getLanguage("rb")).not.toBeNull();
  });
});
