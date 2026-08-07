import { javascriptLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { describe, expect, it } from "vitest";
import {
  CodeBlockKitCopyButtonWidget,
  createCodeBlockKitHighlightSpecs,
  createCodeBlockKitSegmentedHighlightSpecs,
  getCodeBlockKitContentLineStarts,
  getCodeBlockKitLanguage,
  getCodeBlockKitLanguageForFileName,
  getCodeBlockKitLanguageLabelRange,
  parseCodeBlockKitFileName,
  parseCodeBlockKitInfoString,
} from "./code-block-kit.js";

describe("parseCodeBlockKitInfoString", () => {
  it.each([
    ["ts", { value: "ts", from: 0, to: 2 }],
    [" ts ", { value: "ts", from: 1, to: 3 }],
    [' \t  ts\t title="x"', { value: "ts", from: 4, to: 6 }],
    [" \t😀ts \tmetadata", { value: "😀ts", from: 2, to: 6 }],
    ['ts title="x"', { value: "ts", from: 0, to: 2 }],
    ["unknownlang", { value: "unknownlang", from: 0, to: 11 }],
    ["", null],
    [" \t", null],
    ["ts\r", null],
    ["ts\n", null],
    ["ts\rfoo", null],
    ["\r", null],
  ])("accepts or rejects %j at the info-string boundary", (infoValue, expected) => {
    expect(parseCodeBlockKitInfoString(infoValue)).toEqual(expected);
  });
});

describe("parseCodeBlockKitFileName", () => {
  it.each([
    ["a.ts", "a.ts"],
    ["my file.ts", "my file.ts"],
    [" a.ts\t", "a.ts"],
    ["a.ts\r", null],
    ["a.ts\n", null],
    ["my\rfile.ts", null],
  ])("accepts or rejects %j without splitting a filename", (fileName, expected) => {
    expect(parseCodeBlockKitFileName(fileName)).toEqual(expected);
  });
});

describe("getCodeBlockKitLanguage", () => {
  it("resolves a bare language id to its LRLanguage", () => {
    expect(getCodeBlockKitLanguage("ts")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguage("typescript")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguage("tsx")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguage("js")).toBe(javascriptLanguage);
    expect(getCodeBlockKitLanguage("javascript")).toBe(javascriptLanguage);
    expect(getCodeBlockKitLanguage("jsx")).toBe(javascriptLanguage);
  });

  it.each(["ts", " ts", "ts ", " ts ", "\tts"])('resolves %j with permitted leading or trailing horizontal whitespace', (infoValue) => {
    expect(getCodeBlockKitLanguage(infoValue)).toBe(typescriptLanguage);
  });

  it.each(["ts extra", " ts extra"])('only considers the first token of %j', (infoValue) => {
    expect(getCodeBlockKitLanguage(infoValue)).toBe(typescriptLanguage);
  });

  it.each(["ts\r", "ts\n", " ts\r"])('rejects a parser-facing info string containing a line terminator: %j', (infoValue) => {
    expect(getCodeBlockKitLanguage(infoValue)).toBeNull();
  });

  it("falls back to the file extension when the id itself is unsupported", () => {
    expect(getCodeBlockKitLanguage("sample.ts")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguage("sample.js")).toBe(javascriptLanguage);
  });

  it("returns null for an unsupported language id, extension, or empty info string", () => {
    expect(getCodeBlockKitLanguage("python")).toBeNull();
    expect(getCodeBlockKitLanguage("sample.py")).toBeNull();
    expect(getCodeBlockKitLanguage("")).toBeNull();
    expect(getCodeBlockKitLanguage("   ")).toBeNull();
  });

  it("does not see past the first token, so a space-containing filename's extension is missed", () => {
    // getCodeBlockKitLanguageForFileName exists precisely for callers whose
    // whole string is one filename (e.g. scrapbox's fileName) rather than an
    // info string with a leading language id.
    expect(getCodeBlockKitLanguage("my file.js")).toBeNull();
  });
});

describe("getCodeBlockKitLanguageForFileName", () => {
  it("resolves a bare language id", () => {
    expect(getCodeBlockKitLanguageForFileName("ts")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguageForFileName("js")).toBe(javascriptLanguage);
  });

  it("falls back to the file extension when the id itself is unsupported", () => {
    expect(getCodeBlockKitLanguageForFileName("sample.ts")).toBe(typescriptLanguage);
    expect(getCodeBlockKitLanguageForFileName("sample.js")).toBe(javascriptLanguage);
  });

  it("resolves a filename containing spaces by its extension", () => {
    expect(getCodeBlockKitLanguageForFileName("my file.js")).toBe(javascriptLanguage);
    expect(getCodeBlockKitLanguageForFileName("my component.test.tsx")).toBe(typescriptLanguage);
  });

  it("returns null for an unsupported language id, extension, or empty filename", () => {
    expect(getCodeBlockKitLanguageForFileName("python")).toBeNull();
    expect(getCodeBlockKitLanguageForFileName("sample.py")).toBeNull();
    expect(getCodeBlockKitLanguageForFileName("")).toBeNull();
    expect(getCodeBlockKitLanguageForFileName("   ")).toBeNull();
  });
});

describe("createCodeBlockKitHighlightSpecs", () => {
  it("emits token marks offset into the code interior", () => {
    const specs = createCodeBlockKitHighlightSpecs("const x = 1;", 100, javascriptLanguage, "test-token");
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((spec) => spec.type === undefined)).toBe(true);
    expect(specs.every((spec) => "className" in spec && spec.className.startsWith("test-token "))).toBe(true);
    expect(specs.every((spec) => "from" in spec && spec.from >= 100)).toBe(true);
  });

  it("emits nothing for empty source", () => {
    expect(createCodeBlockKitHighlightSpecs("", 0, javascriptLanguage, "test-token")).toEqual([]);
  });
});

describe("createCodeBlockKitSegmentedHighlightSpecs", () => {
  it("maps a token inside a single segment back to that segment's document range", () => {
    const specs = createCodeBlockKitSegmentedHighlightSpecs(
      [{ from: 100, to: 112, text: "const x = 1;" }],
      javascriptLanguage,
      "test-token",
    );

    expect(specs).toContainEqual({ from: 100, to: 105, className: "test-token tok-keyword" });
  });

  it("maps tokens in multiple segments to each segment's own document range", () => {
    const specs = createCodeBlockKitSegmentedHighlightSpecs(
      [
        { from: 100, to: 105, text: "const" },
        { from: 200, to: 202, text: "1;" },
      ],
      javascriptLanguage,
      "test-token",
    );

    expect(specs).toContainEqual({ from: 100, to: 105, className: "test-token tok-keyword" });
    expect(specs).toContainEqual({ from: 200, to: 201, className: "test-token tok-number" });
  });

  it("splits a token spanning the virtual newline between segments into one mark per segment it touches", () => {
    // A single JS block comment, split across two segments the way a
    // multi-line scrapbox comment would be after each body line's required
    // indent marker is stripped -- verified against the actual Lezer output:
    // one tok-comment token spanning the full "/* comment\ncontinues */".
    const specs = createCodeBlockKitSegmentedHighlightSpecs(
      [
        { from: 300, to: 310, text: "/* comment" },
        { from: 400, to: 412, text: "continues */" },
      ],
      javascriptLanguage,
      "test-token",
    );

    expect(specs).toEqual([
      { from: 300, to: 310, className: "test-token tok-comment" },
      { from: 400, to: 412, className: "test-token tok-comment" },
    ]);
  });

  it("keeps an empty-text segment's place in the join without emitting a mark for it", () => {
    const specs = createCodeBlockKitSegmentedHighlightSpecs(
      [
        { from: 100, to: 105, text: "const" },
        { from: 150, to: 150, text: "" },
        { from: 200, to: 202, text: "1;" },
      ],
      javascriptLanguage,
      "test-token",
    );

    expect(specs.some((spec) => "from" in spec && spec.from === 150)).toBe(false);
    expect(specs).toContainEqual({ from: 100, to: 105, className: "test-token tok-keyword" });
    expect(specs).toContainEqual({ from: 200, to: 201, className: "test-token tok-number" });
  });

  it("emits nothing for empty segments", () => {
    expect(createCodeBlockKitSegmentedHighlightSpecs([], javascriptLanguage, "test-token")).toEqual([]);
  });
});

describe("getCodeBlockKitLanguageLabelRange", () => {
  it("spans the first whitespace-separated token of the info string", () => {
    expect(getCodeBlockKitLanguageLabelRange("ts", 3)).toEqual({ from: 3, to: 5 });
  });

  it("excludes any tokens after the first", () => {
    expect(getCodeBlockKitLanguageLabelRange('typescript title="demo"', 3)).toEqual({ from: 3, to: 13 });
  });

  it("returns null for an info string with no non-whitespace token", () => {
    expect(getCodeBlockKitLanguageLabelRange("", 3)).toBeNull();
    expect(getCodeBlockKitLanguageLabelRange("   ", 3)).toBeNull();
  });

  it("projects the syntax contract: unknown tokens keep a label, while rejected terminators have neither label nor language", () => {
    expect(getCodeBlockKitLanguageLabelRange("unknownlang", 10)).toEqual({ from: 10, to: 21 });
    expect(getCodeBlockKitLanguage("unknownlang")).toBeNull();

    for (const infoValue of ["ts\r", "ts\n", "ts\rfoo"]) {
      expect(getCodeBlockKitLanguageLabelRange(infoValue, 10)).toBeNull();
      expect(getCodeBlockKitLanguage(infoValue)).toBeNull();
    }
  });
});

describe("getCodeBlockKitContentLineStarts", () => {
  // `value` is the block's CONTENT text alone (fences excluded) -- the same
  // convention MboxCodeBlock/GfmCodeBlock already use for their own `.value`.
  it("returns one start per content line", () => {
    const value = "first\nsecond\n";
    const content = { from: 4, to: 17 };
    expect(getCodeBlockKitContentLineStarts(content, value)).toEqual([4, 10]);
  });

  it("returns a single start for single-line content", () => {
    const value = "const x = 1\n";
    const content = { from: 6, to: 18 };
    expect(getCodeBlockKitContentLineStarts(content, value)).toEqual([6]);
  });

  it("returns no starts for empty content", () => {
    const content = { from: 4, to: 4 };
    expect(getCodeBlockKitContentLineStarts(content, "")).toEqual([]);
  });
});

describe("CodeBlockKitCopyButtonWidget", () => {
  it("considers two widgets equal only when both the code and class name match", () => {
    const a = new CodeBlockKitCopyButtonWidget("code", "cls");
    expect(a.eq(new CodeBlockKitCopyButtonWidget("code", "cls"))).toBe(true);
    expect(a.eq(new CodeBlockKitCopyButtonWidget("other", "cls"))).toBe(false);
    expect(a.eq(new CodeBlockKitCopyButtonWidget("code", "other-cls"))).toBe(false);
  });
});
