import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScrapboxInline } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import { parseScrapboxDocument } from "./parser.js";

type ObservedInlineFormulaFixture = {
  cases: Array<{
    input: string;
    facts: { isFormula?: boolean; formulaText?: string };
  }>;
};

type ObservedInlineIconFixture = {
  cases: Array<{
    input: string;
    facts: { kind?: "icon" | "link"; isStrong?: boolean; repeatCount?: number | null };
  }>;
};

type ObservedInlineHashTagFixture = {
  cases: Array<{
    input: string;
    facts: { isTag?: boolean; tagName?: string | null };
  }>;
};

type ObservedInlineImageFixture = {
  cases: Array<{
    input: string;
    facts: { isImage?: boolean; isStrong?: boolean; linkTarget?: string | null };
  }>;
};

const observedInlineFormulaFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-formula.observed.json",
);
const observedInlineIconFixturePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/scrapbox/inline-icon.observed.json");
const observedInlineHashTagFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-hashtag.observed.json",
);
const observedInlineImageFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-image.observed.json",
);
const observedInlineImageHostFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-image-host.observed.json",
);

function readObservedInlineFormulaFixture(): ObservedInlineFormulaFixture {
  return JSON.parse(readFileSync(observedInlineFormulaFixturePath, "utf8")) as ObservedInlineFormulaFixture;
}

function readObservedInlineIconFixture(): ObservedInlineIconFixture {
  return JSON.parse(readFileSync(observedInlineIconFixturePath, "utf8")) as ObservedInlineIconFixture;
}

function readObservedInlineHashTagFixture(): ObservedInlineHashTagFixture {
  return JSON.parse(readFileSync(observedInlineHashTagFixturePath, "utf8")) as ObservedInlineHashTagFixture;
}

function readObservedInlineImageFixture(): ObservedInlineImageFixture {
  return JSON.parse(readFileSync(observedInlineImageFixturePath, "utf8")) as ObservedInlineImageFixture;
}

function readObservedInlineImageHostFixture(): ObservedInlineImageFixture {
  return JSON.parse(readFileSync(observedInlineImageHostFixturePath, "utf8")) as ObservedInlineImageFixture;
}

function observedIconRepeatCount(input: string): number | undefined {
  const match = input.match(/\.icon(?:[x*](\d+))?\]$/);
  if (match === null) return undefined;
  return match[1] === undefined ? 1 : Number(match[1]);
}

function expectObservedInlineIconFacts(fixture: ObservedInlineIconFixture): void {
  for (const { input, facts } of fixture.cases) {
    if (!("kind" in facts)) continue;
    const repeatCount = observedIconRepeatCount(input);
    // The fixture records that upstream did not cut off a large repeat. The
    // owner chose mbox's display safety limit of 20 on 2026-07-31, so only
    // cases whose repeat count exceeds that limit intentionally differ here.
    if (repeatCount !== undefined && repeatCount > 20) continue;

    const document = parseScrapboxDocument(input);
    const nodes = document.lines.flatMap((line) => collectScrapboxInlineNodeResults(line.inline, (node) => [node]));
    const icon = nodes.find((node) => node.type === "icon");
    const actualKind = icon !== undefined ? "icon" : nodes.find((node) => node.type === "internalLink") !== undefined ? "link" : undefined;
    expect(actualKind, input).toBe(facts.kind);
    if (icon?.type === "icon" && "repeatCount" in facts) expect(icon.repeatCount).toBe(facts.repeatCount);
    if ("isStrong" in facts) expect(nodes.some((node) => node.type === "strong")).toBe(facts.isStrong);
  }
}

function expectObservedInlineFormulaFacts(fixture: ObservedInlineFormulaFixture): void {
  for (const { input, facts } of fixture.cases) {
    // An absent key is an observation gap, whereas a future explicit false
    // must remain a checked expectation.
    if (!("isFormula" in facts)) continue;

    const formula = parseScrapboxInline(input).find((node) => node.type === "formula");
    expect(formula !== undefined).toBe(facts.isFormula);
    if (formula?.type === "formula" && "formulaText" in facts) {
      // Compare the raw mbox expression: trimming would hide a terminator
      // bug that accidentally includes the whitespace before `]`.
      expect(formula.expression).toBe(facts.formulaText);
    }
  }
}

function expectObservedInlineHashTagFacts(fixture: ObservedInlineHashTagFixture): void {
  for (const { input, facts } of fixture.cases) {
    if (!("isTag" in facts)) continue;

    const hashTag = parseScrapboxInline(input).find((node) => node.type === "hashTag");
    expect(hashTag !== undefined, input).toBe(facts.isTag);
    if (hashTag?.type === "hashTag" && "tagName" in facts) {
      // `tagName` is screen text, not the parser href: `##a` displays as
      // `##a` even though its href begins with just the second hash.
      expect(input.slice(hashTag.from, hashTag.to), input).toBe(facts.tagName);
    }
  }
}

function expectObservedInlineImageFacts(fixture: ObservedInlineImageFixture): number {
  const cases = fixture.cases.filter(({ input }) => !input.startsWith("table:"));

  for (const { input, facts } of cases) {
    const nodes = parseScrapboxInline(input);
    const image = nodes.find((node) => node.type === "image" || node.type === "strongImage");
    if ("isImage" in facts) expect(image !== undefined, input).toBe(facts.isImage);
    if (image !== undefined) expect({ from: image.from, to: image.to }, input).toEqual({ from: 0, to: input.length });
    if ("isStrong" in facts) expect(image?.type === "strongImage", input).toBe(facts.isStrong);
    if ("linkTarget" in facts) {
      // The fixture's null means navigation was observed to be absent; mbox
      // represents that same no-link state with an empty `link` string.
      expect(image?.type === "image" ? image.link : "", input).toBe(facts.linkTarget ?? "");
    }
  }

  return cases.length;
}

function isWholeInputImage(input: string): boolean {
  const nodes = parseScrapboxInline(input);
  return (
    nodes.length === 1 &&
    (nodes[0]?.type === "image" || nodes[0]?.type === "strongImage") &&
    nodes[0].from === 0 &&
    nodes[0].to === input.length
  );
}

const gyazoClassificationCases = [
  ["https scheme", "https://gyazo.com/0123456789abcdef0123456789abcdef", true],
  ["http scheme", "http://gyazo.com/0123456789abcdef0123456789abcdef", true],
  ["mixed-case scheme", "HtTpS://gyazo.com/0123456789abcdef0123456789abcdef", true],
  ["no scheme", "gyazo.com/0123456789abcdef0123456789abcdef", false],
  ["i subdomain", "https://i.gyazo.com/0123456789abcdef0123456789abcdef", false],
  ["other single subdomain", "https://cdn.gyazo.com/0123456789abcdef0123456789abcdef", false],
  ["multi-level subdomain", "https://a.b.gyazo.com/0123456789abcdef0123456789abcdef", false],
  ["lookalike host", "https://notgyazo.com/0123456789abcdef0123456789abcdef", false],
  ["host suffix", "https://gyazo.com.example/0123456789abcdef0123456789abcdef", false],
  ["uppercase id", "https://gyazo.com/0123456789ABCDEF0123456789ABCDEF", true],
  ["mixed-case id", "https://gyazo.com/0123456789abcDEF0123456789AbCdEf", true],
  ["31-character id", "https://gyazo.com/0123456789abcdef0123456789abcde", false],
  ["33-character id", "https://gyazo.com/0123456789abcdef0123456789abcdef0", false],
  ["non-hex id", "https://gyazo.com/0123456789abcdef0123456789abcdeg", false],
  ["raw suffix", "https://gyazo.com/0123456789abcdef0123456789abcdef/raw", true],
  ["uppercase raw suffix", "https://gyazo.com/0123456789abcdef0123456789abcdef/RAW", true],
  ["extra suffix", "https://gyazo.com/0123456789abcdef0123456789abcdef/extra", false],
  ["raw with trailing slash", "https://gyazo.com/0123456789abcdef0123456789abcdef/raw/", false],
  ["query", "https://gyazo.com/0123456789abcdef0123456789abcdef?q=1", false],
  ["fragment", "https://gyazo.com/0123456789abcdef0123456789abcdef#x", false],
  ["trailing slash", "https://gyazo.com/0123456789abcdef0123456789abcdef/", false],
] as const;

describe("parseScrapboxInline", () => {
  it("parses every observed non-table Work-list 4-7 image form", () => {
    expect(expectObservedInlineImageFacts(readObservedInlineImageFixture())).toBe(5);
  });

  it("would fail when one observed image fact changes", () => {
    const altered = structuredClone(readObservedInlineImageFixture());
    const fact = altered.cases.find(({ facts }) => typeof facts.linkTarget === "string")?.facts;
    if (!fact || typeof fact.linkTarget !== "string") throw new Error("fixture needs one string linkTarget fact");
    fact.linkTarget = "\u0000";

    expect(() => expectObservedInlineImageFacts(altered)).toThrowError(/expected/);
  });

  it("parses all five observed Work-list 4-9 image-host cases", () => {
    expect(expectObservedInlineImageFacts(readObservedInlineImageHostFixture())).toBe(5);
  });

  it("would fail when one observed image-host fact changes", () => {
    const altered = structuredClone(readObservedInlineImageHostFixture());
    const fact = altered.cases.find(({ facts }) => typeof facts.isImage === "boolean")?.facts;
    if (!fact || typeof fact.isImage !== "boolean") throw new Error("fixture needs one boolean isImage fact");
    fact.isImage = !fact.isImage;

    expect(() => expectObservedInlineImageFacts(altered)).toThrowError(/expected/);
  });

  it("uses every observed inline-hashtag fact", () => {
    expectObservedInlineHashTagFacts(readObservedInlineHashTagFixture());
  });

  it("would fail when one observed hashtag fact changes", () => {
    const altered = structuredClone(readObservedInlineHashTagFixture());
    const fact = altered.cases.find(({ facts }) => typeof facts.tagName === "string")?.facts;
    if (!fact || typeof fact.tagName !== "string") throw new Error("fixture needs one string tagName fact");
    fact.tagName = "\u0000";

    expect(() => expectObservedInlineHashTagFacts(altered)).toThrowError(/expected/);
  });

  it("keeps the observed icon facts except repeats above mbox's owner-selected safety limit", () => {
    expectObservedInlineIconFacts(readObservedInlineIconFixture());
  });

  it("parses icon repeat suffixes, removes them from the resolver path, and rejects invalid counts as internal links", () => {
    expect(parseScrapboxInline("[/team/bob.icon*3]")).toMatchObject([
      { type: "icon", path: "/team/bob", pathType: "root", repeatCount: 3 },
    ]);
    expect(parseScrapboxInline("[bob.iconx2]")).toMatchObject([{ type: "icon", path: "bob", repeatCount: 2 }]);
    expect(parseScrapboxInline("[bob.icon*20]")).toMatchObject([{ type: "icon", repeatCount: 20 }]);
    for (const input of ["[bob.icon*0]", "[bob.icon*02]", "[bob.icon*21]"]) {
      expect(parseScrapboxInline(input)).toMatchObject([{ type: "internalLink", href: input.slice(1, -1) }]);
    }
  });

  // These are grammar regressions, not evidence of upstream behavior; the
  // observed facts are checked separately through the fixture above.
  it("keeps an uppercase .ICON suffix as an internal link", () => {
    expect(parseScrapboxInline("[bob.ICON]")).toMatchObject([{ type: "internalLink", href: "bob.ICON" }]);
  });

  it("keeps a mixed-case .Icon suffix as an internal link", () => {
    expect(parseScrapboxInline("[bob.Icon]")).toMatchObject([{ type: "internalLink", href: "bob.Icon" }]);
  });

  it("preserves an uppercase icon-like repeat suffix in the internal-link href", () => {
    expect(parseScrapboxInline("[bob.ICON*2]")).toMatchObject([{ type: "internalLink", href: "bob.ICON*2" }]);
  });

  it("keeps an uppercase repeat separator as an internal link (unobserved mbox choice)", () => {
    expect(parseScrapboxInline("[bob.iconX2]")).toMatchObject([{ type: "internalLink", href: "bob.iconX2" }]);
  });

  it("keeps uppercase icon-like content as text inside double-bracket strong syntax", () => {
    expect(parseScrapboxInline("[[a.ICON]]")).toMatchObject([
      { type: "strong", children: [{ type: "text", value: "a.ICON" }] },
    ]);
  });

  it("returns a single text node for plain text", () => {
    expect(parseScrapboxInline("hello")).toEqual([{ type: "text", from: 0, to: 5, value: "hello" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseScrapboxInline("")).toEqual([]);
  });

  it("offsets text nodes from the given base", () => {
    expect(parseScrapboxInline("ab", 10)).toEqual([{ type: "text", from: 10, to: 12, value: "ab" }]);
  });

  it("offsets every node and nested range from a non-zero base", () => {
    expect(parseScrapboxInline("`x` [Page] #tag", 100)).toMatchObject([
      { type: "code", from: 100, to: 103, content: { from: 101, to: 102 } },
      { type: "text", from: 103, to: 104 },
      { type: "internalLink", from: 104, to: 110, target: { from: 105, to: 109 } },
      { type: "text", from: 110, to: 111 },
      { type: "hashTag", from: 111, to: 115, target: { from: 112, to: 115 } },
    ]);
  });

  it("parses inline code and its markers", () => {
    const [node] = parseScrapboxInline("`code`");

    expect(node).toMatchObject({
      type: "code",
      from: 0,
      to: 6,
      openingMarker: { from: 0, to: 1 },
      content: { from: 1, to: 5 },
      closingMarker: { from: 5, to: 6 },
      value: "code",
    });
  });

  it("splits surrounding text around inline code with correct offsets", () => {
    expect(parseScrapboxInline("a `x` b")).toMatchObject([
      { type: "text", from: 0, to: 2, value: "a " },
      { type: "code", from: 2, to: 5, value: "x" },
      { type: "text", from: 5, to: 7, value: " b" },
    ]);
  });

  it("keeps node order and offsets for non-overlapping token kinds", () => {
    expect(parseScrapboxInline("a `x` [Page] #tag")).toMatchObject([
      { type: "text", from: 0, to: 2, value: "a " },
      { type: "code", from: 2, to: 5, value: "x" },
      { type: "text", from: 5, to: 6, value: " " },
      { type: "internalLink", from: 6, to: 12, href: "Page" },
      { type: "text", from: 12, to: 13, value: " " },
      { type: "hashTag", from: 13, to: 17, href: "tag" },
    ]);
  });

  it("parses a bold decoration with markers, content range and nested text", () => {
    const [node] = parseScrapboxInline("[* bold]");

    expect(node).toMatchObject({
      type: "decoration",
      from: 0,
      to: 8,
      rawDecos: "*",
      decos: ["*-1"],
      openingMarker: { from: 0, to: 3 },
      content: { from: 3, to: 7 },
      closingMarker: { from: 7, to: 8 },
      children: [{ type: "text", from: 3, to: 7, value: "bold" }],
    });
  });

  it("normalises repeated asterisks into a single level token", () => {
    const [node] = parseScrapboxInline("[*** big]");

    expect(node).toMatchObject({ type: "decoration", decos: ["*-3"] });
  });

  it("keeps every decoration character including combined styles", () => {
    const [node] = parseScrapboxInline("[*/- text]");

    expect(node.type).toBe("decoration");
    if (node.type === "decoration") {
      expect(node.decos).toEqual(expect.arrayContaining(["*-1", "/", "-"]));
    }
  });

  it("falls through to an internal link when the decoration has no content", () => {
    // decorationRegExp requires at least one content character after the
    // marker+space, so "[* ]" never matches as a decoration -- it falls
    // through to the more permissive internal-link pattern instead, becoming
    // a (garbage-titled) link to a page named "* ", not literal unstyled
    // text. This is accepted, current behavior, not a bug to fix.
    const [node] = parseScrapboxInline("[* ]");

    expect(node).toMatchObject({ type: "internalLink", from: 0, to: 4, href: "* " });
  });

  it("parses a strong node built from double brackets", () => {
    const [node] = parseScrapboxInline("[[strong]]");

    expect(node).toMatchObject({
      type: "strong",
      from: 0,
      to: 10,
      openingMarker: { from: 0, to: 2 },
      content: { from: 2, to: 8 },
      closingMarker: { from: 8, to: 10 },
      children: [{ type: "text", from: 2, to: 8, value: "strong" }],
    });
  });

  it("keeps strong scanner boundary semantics", () => {
    expect(parseScrapboxInline("[[x]]")).toMatchObject([{ type: "strong", from: 0, to: 5, content: { from: 2, to: 3 } }]);
    expect(parseScrapboxInline("[[[x]]")).toMatchObject([{ type: "strong", from: 0, to: 6, content: { from: 2, to: 4 } }]);
    expect(parseScrapboxInline("[[x]]]")).toMatchObject([{ type: "strong", from: 0, to: 6, closingMarker: { from: 4, to: 6 } }]);

    // A cross-line strong candidate fails, then bracket parsing retains its
    // current fallback meaning. CR at the initial-unit boundary is retained.
    expect(parseScrapboxInline("[[x\n]]").map((node) => node.type)).toEqual(["text", "internalLink", "text"]);
    expect(parseScrapboxInline("[[x\r\n]]").map((node) => node.type)).toEqual(["text", "internalLink", "text"]);
    expect(parseScrapboxInline("[[x\u2028]]").map((node) => node.type)).toEqual(["text", "internalLink", "text"]);
    expect(parseScrapboxInline("[[x\u2029]]").map((node) => node.type)).toEqual(["text", "internalLink", "text"]);
    expect(parseScrapboxInline("[[\r]]")).toMatchObject([{ type: "strong", from: 0, to: 5, content: { from: 2, to: 3 } }]);
  });

  it("retries exactly three characters before a rejected line terminator", () => {
    // Unlike "[[\r]]", where the initial unit itself consumes the terminator,
    // this first rejects "[[x" and must then retry the "[[[\r" boundary
    // candidate exactly three characters before the CR.
    const nodes = parseScrapboxInline("[[x[[[\r]]");

    expect(nodes.map((node) => node.type)).toEqual(["text", "strong"]);
    expect(nodes).toMatchObject([
      { type: "text", from: 0, to: 3, value: "[[x" },
      { type: "strong", from: 3, to: 9, content: { from: 5, to: 7 } },
    ]);
  });

  it("rejects a strong candidate at the first of several line terminators", () => {
    // When more than one line-terminator kind follows a candidate, the first
    // one rejects it; a later LF must not let the paragraph separator through.
    expect(parseScrapboxInline("[[x\u2029]]\n").map((node) => node.type)).toEqual(["text", "internalLink", "text"]);
  });

  it("skips nested decoration parsing so a nested bracket falls through to a link", () => {
    // "[/ inner]" is a decoration at top level, but decoration is disabled when
    // nested, so inside "[* ... ]" it is parsed as an internal link instead.
    const [node] = parseScrapboxInline("[* [/ inner]]");

    expect(node).toMatchObject({
      type: "decoration",
      children: [{ type: "internalLink", from: 3, to: 12, href: "/ inner" }],
    });
  });

  it("does not re-enter code, decoration, or strong parsing inside strong content", () => {
    const [node] = parseScrapboxInline("[[`code` [* deco] [[strong]]]]");

    expect(node.type).toBe("strong");
    if (node.type !== "strong") return;
    expect(node.children.map((child) => child.type)).not.toContain("code");
    expect(node.children.map((child) => child.type)).not.toContain("decoration");
    expect(node.children.map((child) => child.type)).not.toContain("strong");
  });

  it("prefers code over decoration when code appears first in priority", () => {
    const nodes = parseScrapboxInline("`[* a]`");

    expect(nodes).toMatchObject([{ type: "code", value: "[* a]" }]);
  });

  it("keeps code priority when it starts at the same position as bracket syntax", () => {
    expect(parseScrapboxInline("`[Page]`")).toMatchObject([{ type: "code", from: 0, to: 8, value: "[Page]" }]);
  });

  it("uses the leftmost internal link before a later code span", () => {
    // Lexer semantics: the earliest token starts at 0, even though code has
    // a higher matcher priority and appears later in the input.
    expect(parseScrapboxInline("[Page `code`]")).toMatchObject([
      { type: "internalLink", from: 0, to: 13, href: "Page `code`" },
    ]);
  });

  it("parses an internal link to a relative page", () => {
    const [node] = parseScrapboxInline("[Page Name]");

    expect(node).toMatchObject({
      type: "internalLink",
      from: 0,
      to: 11,
      pathType: "relative",
      href: "Page Name",
      target: { from: 1, to: 10 },
    });
  });

  it("parses an internal link to a root page", () => {
    const [node] = parseScrapboxInline("[/project/Page]");

    expect(node).toMatchObject({ type: "internalLink", pathType: "root", href: "/project/Page" });
  });

  it("parses a bare external URL", () => {
    const [node] = parseScrapboxInline("see https://example.com/x here");

    expect(node).toMatchObject({ type: "text", value: "see " });
    expect(parseScrapboxInline("see https://example.com/x here")[1]).toMatchObject({
      type: "externalLink",
      bracketed: false,
      href: "https://example.com/x",
      content: "",
      contentRange: null,
    });
  });

  it("parses a bracketed url-first external link with label", () => {
    const [node] = parseScrapboxInline("[https://example.com label here]");

    expect(node).toMatchObject({
      type: "externalLink",
      bracketed: true,
      from: 0,
      to: 32,
      href: "https://example.com",
      content: "label here",
      hrefRange: { from: 1, to: 20 },
      contentRange: { from: 21, to: 31 },
    });
  });

  it.each([
    ["[http:// x]", ["internalLink"]],
    ["[https:// x]", ["internalLink"]],
    ["[http://  x]", ["internalLink"]],
    ["[http:// [b] c]", ["text", "internalLink", "text"]],
    ["  [https:// https://]", ["text", "internalLink"]],
  ])("does not parse an empty-host URL as a bracketed url-first link: %s", (input, types) => {
    const nodes = parseScrapboxInline(input);

    // The legacy regexp falls through to the internal-link matcher. Keep that
    // legacy node sequence rather than accepting the scanner's full bracketed
    // candidate as text.
    expect(nodes.map((node) => node.type)).toEqual(types);
    expect(nodes.some((node) => node.type === "externalLink")).toBe(false);
  });

  it.each([
    ["[https://a foo[bar]", "foo[bar"],
    ["[https://a b[c]", "b[c"],
  ])("keeps an opening bracket in the url-first link label: %s", (input, content) => {
    const [node] = parseScrapboxInline(input);

    expect(node).toMatchObject({
      type: "externalLink",
      bracketed: true,
      href: "https://a",
      content,
    });
  });

  it("keeps a closing bracket at the end of a url-first link label, like the legacy regexp", () => {
    const input = "[https://a label]]";

    expect(parseScrapboxInline(input)[0]).toMatchObject({
      type: "externalLink",
      to: input.length,
      href: "https://a",
      content: "label]",
    });
  });

  it("parses a bracketed label-first external link", () => {
    const [node] = parseScrapboxInline("[label https://example.com]");

    expect(node).toMatchObject({
      type: "externalLink",
      bracketed: true,
      href: "https://example.com",
      content: "label",
      contentRange: { from: 1, to: 6 },
      hrefRange: { from: 7, to: 26 },
    });
  });

  it("parses a bracketed bare url as an external link", () => {
    const [node] = parseScrapboxInline("[https://example.com]");

    expect(node).toMatchObject({ type: "externalLink", bracketed: true, href: "https://example.com", content: "" });
  });

  it("does not over-capture a url-first bracket link whose URL contains an opening bracket", () => {
    const nodes = parseScrapboxInline("[https://x[y z]");

    expect(nodes.some((node) => node.type === "image" || (node.type === "externalLink" && node.bracketed))).toBe(false);
  });

  it.each([
    ["link-first image", "[https://link.invalid/[x https://i.invalid/a.png]", "image"],
    ["url-first external link", "[https://x[y label]", "bracketed external link"],
    ["content-first external link", "[label https://x[y]", "bracketed external link"],
    ["bracketed external URL", "[https://x[y]", "bracketed external link"],
  ])("does not over-capture an opening bracket in a %s", (_description, input, rejectedKind) => {
    const nodes = parseScrapboxInline(input);

    const rejected =
      rejectedKind === "image"
        ? nodes.some((node) => node.type === "image")
        : nodes.some((node) => node.type === "externalLink" && node.bracketed);
    expect(rejected).toBe(false);
  });

  it.each([
    ["image URL path", "[https://i.invalid/a[x.png]", "https://i.invalid/a[x.png", ""],
    ["image URL query", "[https://i.invalid/a.png?[x]", "https://i.invalid/a.png?[x", ""],
    [
      "src-first image link",
      "[https://i.invalid/a[x.png https://link.invalid]",
      "https://i.invalid/a[x.png",
      "https://link.invalid",
    ],
  ])("allows an opening bracket only inside the image token of a %s", (_description, input, src, link) => {
    expect(parseScrapboxInline(input)[0]).toMatchObject({ type: "image", src, link });
  });

  it.each([
    ["url-first", "[https://example.invalid label]", "https://example.invalid", "label", { from: 1, to: 24 }, { from: 25, to: 30 }],
    ["content-first", "[label https://example.invalid]", "https://example.invalid", "label", { from: 7, to: 30 }, { from: 1, to: 6 }],
    ["bracketed URL", "[https://example.invalid]", "https://example.invalid", "", { from: 1, to: 24 }, null],
  ])("preserves ranges for a valid %s external link", (_description, input, href, content, hrefRange, contentRange) => {
    expect(parseScrapboxInline(input)[0]).toMatchObject({
      type: "externalLink",
      from: 0,
      to: input.length,
      bracketed: true,
      href,
      content,
      hrefRange,
      contentRange,
    });
  });

  it.each([
    ["image-first", "[https://i.invalid/a.png https://link.invalid]", "https://i.invalid/a.png", "https://link.invalid"],
    ["link-first image", "[https://link.invalid https://i.invalid/a.png]", "https://i.invalid/a.png", "https://link.invalid"],
  ])("preserves ranges for a valid %s", (_description, input, src, link) => {
    expect(parseScrapboxInline(input)[0]).toMatchObject({
      type: "image",
      from: 0,
      to: input.length,
      src,
      link,
    });
  });

  it("preserves bare URLs containing an opening bracket and keeps bracketed IPv6 unsupported", () => {
    expect(parseScrapboxInline("https://x[y")[0]).toMatchObject({
      type: "externalLink",
      bracketed: false,
      href: "https://x[y",
      hrefRange: { from: 0, to: 11 },
    });
    expect(parseScrapboxInline("[http://[::1]/]").some((node) => node.type === "externalLink" && node.bracketed)).toBe(false);
  });

  it("parses a hashtag preceded by a space and keeps the space as text", () => {
    const nodes = parseScrapboxInline("a #tag b");

    expect(nodes).toMatchObject([
      { type: "text", from: 0, to: 2, value: "a " },
      { type: "hashTag", from: 2, to: 6, href: "tag", marker: { from: 2, to: 3 } },
      { type: "text", from: 6, to: 8, value: " b" },
    ]);
  });

  it("does not treat a hashtag glued to a word as a tag", () => {
    expect(parseScrapboxInline("a#tag")).toEqual([{ type: "text", from: 0, to: 5, value: "a#tag" }]);
  });

  it("keeps `a ##` plain as an internal regression lock for the regexp path, not an upstream observation", () => {
    // This input is intentionally absent from the observed fixture. It proves
    // the whitespace-boundary regexp path applies the all-hash exclusion.
    expect(parseScrapboxInline("a ##").some((node) => node.type === "hashTag")).toBe(false);
  });

  it("keeps a line-start all-hash run plain through the cursor scanner", () => {
    expect(parseScrapboxInline("##").some((node) => node.type === "hashTag")).toBe(false);
  });

  it("keeps the observed code-and-all-hash interaction plain", () => {
    expect(parseScrapboxInline("`code`## rest").some((node) => node.type === "hashTag")).toBe(false);
  });

  it.each([
    ["a#tag", false],
    ["a #tag", true],
    ["`code`#tag", true],
  ])("recognises hashtags at the expected character, whitespace, and token boundaries: %s", (input, recognised) => {
    expect(parseScrapboxInline(input).some((node) => node.type === "hashTag")).toBe(recognised);
  });

  it("parses 5,000 top-level hashtags without overflowing and preserves offsets", () => {
    const input = Array.from({ length: 5_000 }, (_, index) => `#tag${index}`).join(" ");
    const nodes = parseScrapboxInline(input);
    const first = nodes[0];
    const middle = nodes[5_000];
    const last = nodes[nodes.length - 1];
    const middleStart = input.indexOf("#tag2500");

    expect(nodes).toHaveLength(9_999);
    expect(nodes.filter((node) => node.type === "hashTag")).toHaveLength(5_000);
    expect(first).toMatchObject({ type: "hashTag", from: 0, to: 5, href: "tag0" });
    expect(middle).toMatchObject({
      type: "hashTag",
      from: middleStart,
      to: middleStart + "#tag2500".length,
      href: "tag2500",
    });
    expect(last).toMatchObject({
      type: "hashTag",
      from: input.length - "#tag4999".length,
      to: input.length,
      href: "tag4999",
    });
  });

  it("parses 5,000 hashtag siblings inside strong content without overflowing", () => {
    const content = Array.from({ length: 5_000 }, (_, index) => `#tag${index}`).join(" ");
    const [node] = parseScrapboxInline(`[[${content}]]`);

    expect(node.type).toBe("strong");
    if (node.type !== "strong") return;

    expect(node.children).toHaveLength(9_999);
    expect(node.children[0]).toMatchObject({ type: "hashTag", from: 2, to: 7, href: "tag0" });
    expect(node.children[node.children.length - 1]).toMatchObject({
      type: "hashTag",
      from: content.length - "#tag4999".length + 2,
      to: content.length + 2,
      href: "tag4999",
    });
  });

  it("keeps prefix hashtags before later code and strong matches in document order", () => {
    const nodes = parseScrapboxInline("#first `code` [[strong]]");

    expect(nodes.map((node) => node.type)).toEqual(["hashTag", "text", "code", "text", "strong"]);
    expect(nodes[0]).toMatchObject({ type: "hashTag", from: 0, to: 6, href: "first" });
    expect(nodes[2]).toMatchObject({ type: "code", from: 7, to: 13, value: "code" });
    expect(nodes[4]).toMatchObject({
      type: "strong",
      from: 14,
      to: 24,
      children: [{ type: "text", from: 16, to: 22, value: "strong" }],
    });
  });

  it("parses a bracketed image url", () => {
    const [node] = parseScrapboxInline("[https://i.com/a.png]");

    expect(node).toMatchObject({
      type: "image",
      from: 0,
      to: 21,
      src: "https://i.com/a.png",
      link: "",
    });
  });

  it("keeps an image query string in the src", () => {
    const [node] = parseScrapboxInline("[https://i.com/a.jpg?w=100]");

    expect(node).toMatchObject({ type: "image", src: "https://i.com/a.jpg?w=100" });
  });

  it.each([
    "[https://]",
    "[https://a.txt]",
    "[https://i.test/a.png?]",
    "[https://.png?]",
  ])("does not classify a scheme-only, non-image, or empty-query token as an image: %s", (input) => {
    expect(parseScrapboxInline(input).some((node) => node.type === "image")).toBe(false);
  });

  it("keeps case-insensitive image scheme and extension matching", () => {
    expect(parseScrapboxInline("[HtTpS://i.test/a.PnG]")[0]).toMatchObject({
      type: "image",
      src: "HtTpS://i.test/a.PnG",
    });
  });

  it("ends a bracket-containing image at the first closing bracket", () => {
    expect(parseScrapboxInline("[https://i.test/a[x.png]tail")).toMatchObject([
      { type: "image", from: 0, to: 24, src: "https://i.test/a[x.png" },
      { type: "text", from: 24, to: 28, value: "tail" },
    ]);
  });

  it("parses a src-first image with a link", () => {
    const [node] = parseScrapboxInline("[https://i.com/a.png https://link.com]");

    expect(node).toMatchObject({ type: "image", src: "https://i.com/a.png", link: "https://link.com" });
  });

  it("parses an observed double-bracket src-first image with a link as an ordinary image", () => {
    const input = "[[https://i.com/a.png https://link.com]]";
    const [node] = parseScrapboxInline(input);

    expect(node).toEqual({
      type: "image",
      from: 0,
      to: input.length,
      src: "https://i.com/a.png",
      link: "https://link.com",
    });
  });

  it("does not generalize double-bracket image parsing to the unobserved link-first form", () => {
    const [node] = parseScrapboxInline("[[https://link.com https://i.com/a.png]]");

    expect(node.type).toBe("strong");
  });

  it("does not consume part of a longer double-bracket closing run as the observed image form", () => {
    const [node] = parseScrapboxInline("[[https://i.com/a.png https://link.com]]]");

    expect(node.type).toBe("strong");
  });

  it("parses a link-first image", () => {
    const [node] = parseScrapboxInline("[https://link.com https://i.com/a.png]");

    expect(node).toMatchObject({ type: "image", src: "https://i.com/a.png", link: "https://link.com" });
  });

  it.each(["\t", "\n", "\u00a0", "\u2003", "\u2028", "\u2029"])(
    "preserves non-ASCII and line whitespace as the two-token separator: %s",
    (separator) => {
      expect(parseScrapboxInline(`[https://i.test/a.png${separator}https://link.test]`)[0]).toMatchObject({
        type: "image",
        src: "https://i.test/a.png",
        link: "https://link.test",
      });
    },
  );

  it("parses a strong (double-bracket) image", () => {
    const [node] = parseScrapboxInline("[[https://i.com/a.png]]");

    expect(node).toMatchObject({ type: "strongImage", from: 0, to: 23, src: "https://i.com/a.png" });
  });

  it("takes image priority over external link for image urls", () => {
    expect(parseScrapboxInline("[https://i.com/a.png]")[0].type).toBe("image");
    // a non-image url stays an external link
    expect(parseScrapboxInline("[https://i.com/page]")[0].type).toBe("externalLink");
  });

  it("keeps the regexp and hand-written Gyazo classifiers aligned across 21 boundary inputs", () => {
    expect(gyazoClassificationCases).toHaveLength(21);
    for (const [description, url, expected] of gyazoClassificationCases) {
      const singleBracket = `[${url}]`;
      const doubleBracket = `[[${url}]]`;
      expect(isWholeInputImage(singleBracket), `${description}: hand-written scanner`).toBe(expected);
      expect(isWholeInputImage(doubleBracket), `${description}: regexp`).toBe(expected);
    }
  });

  it.each([
    ["single brackets", "[https://i.gyazo.com/0123456789abcdef0123456789abcdef]"],
    ["double brackets", "[[https://i.gyazo.com/0123456789abcdef0123456789abcdef]]"],
  ])("keeps the observed i.gyazo.com host out of whole-input image nodes with %s", (_description, input) => {
    expect(isWholeInputImage(input)).toBe(false);
    const nodes = parseScrapboxInline(input);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ from: 0, to: input.length });
  });

  // These cases are grammar regression locks. The recorded upstream facts are
  // checked independently through inline-image-host.observed.json above.
  it("parses a bracketed Gyazo url with no file extension as an image", () => {
    const [node] = parseScrapboxInline("[https://gyazo.com/0123456789abcdef0123456789abcdef]");

    expect(node).toMatchObject({
      type: "image",
      src: "https://gyazo.com/0123456789abcdef0123456789abcdef",
      link: "",
    });
  });

  it("excludes an unobserved subdomain /raw form under mbox's conservative host generalisation", () => {
    const [node] = parseScrapboxInline("[https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw]");

    expect(node).toMatchObject({
      type: "externalLink",
      href: "https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw",
    });
  });

  it("parses a strong (double-bracket) Gyazo image", () => {
    const [node] = parseScrapboxInline("[[https://gyazo.com/0123456789abcdef0123456789abcdef]]");

    expect(node).toMatchObject({
      type: "strongImage",
      src: "https://gyazo.com/0123456789abcdef0123456789abcdef",
    });
  });

  it("parses a link-first Gyazo image", () => {
    const [node] = parseScrapboxInline("[https://link.com https://gyazo.com/0123456789abcdef0123456789abcdef]");

    expect(node).toMatchObject({
      type: "image",
      src: "https://gyazo.com/0123456789abcdef0123456789abcdef",
      link: "https://link.com",
    });
  });

  it("does not treat a non-32-hex gyazo.com path as an image", () => {
    expect(parseScrapboxInline("[https://gyazo.com/not-an-id]")[0].type).toBe("externalLink");
  });

  it("parses an icon and its page path, taking priority over internal links", () => {
    const [node] = parseScrapboxInline("[demo-user.icon]");

    expect(node).toMatchObject({ type: "icon", from: 0, to: 16, path: "demo-user", pathType: "relative" });
  });

  it("parses a root-path icon", () => {
    const [node] = parseScrapboxInline("[/team/bob.icon]");

    expect(node).toMatchObject({ type: "icon", path: "/team/bob", pathType: "root" });
  });

  it("keeps a plain bracket without .icon as an internal link", () => {
    expect(parseScrapboxInline("[demo-user]")[0].type).toBe("internalLink");
  });

  it("parses a formula and its expression, taking priority over internal links", () => {
    const [node] = parseScrapboxInline("[$ \\frac{1}{2}]");

    expect(node).toMatchObject({
      type: "formula",
      from: 0,
      expression: "\\frac{1}{2}",
      content: { from: 3, to: 14 },
    });
  });

  it("uses every observed inline-formula fact that establishes formula syntax", () => {
    expectObservedInlineFormulaFacts(readObservedInlineFormulaFixture());
  });

  it("would fail when one observed formula fact changes", () => {
    const altered = structuredClone(readObservedInlineFormulaFixture());
    const fact = altered.cases.find(({ facts }) => "formulaText" in facts)?.facts;
    if (!fact || !("formulaText" in fact)) throw new Error("fixture needs one formulaText fact");
    fact.formulaText = `${fact.formulaText}\u0000`;

    expect(() => expectObservedInlineFormulaFacts(altered)).toThrowError(/expected/);
  });

  it("accepts a bare empty formula as the consequence of the terminator rule", () => {
    // `[$ ]` was not observed. It becomes a formula because its bare `]` is
    // at contentStart; this is a consequence of the general empty-formula
    // rule, not a separately chosen syntax rule.
    expect(parseScrapboxInline("[$ ]")).toMatchObject([
      { type: "formula", from: 0, to: 4, expression: "", content: { from: 3, to: 3 } },
    ]);
  });

  it("does not look past a formula's line for a spaced closer", () => {
    expect(parseScrapboxInline("[$ a]b\nc ]").find((node) => node.type === "formula")).toMatchObject(
      { type: "formula", from: 0, to: 5, expression: "a", content: { from: 3, to: 4 } },
    );
  });

  it.each([
    ["[https://example.com]", "externalLink"],
    ["[[https://i.com/a.png]]", "strongImage"],
    ["[https://i.com/a.png]", "image"],
    ["[demo.icon]", "icon"],
    ["[Page]", "internalLink"],
    ["#tag", "hashTag"],
  ])("uses matcher order only to break a same-position tie: %s", (input, type) => {
    expect(parseScrapboxInline(input)[0].type).toBe(type);
  });

  it("lexes unclosed url-first links through the document parser in linear time", () => {
    // Before the dedicated scanner, hrefFirstUrlRegExp rescanned every suffix
    // from each "[". 40k repetitions take about 6.5s on the old code, while
    // the linear scanner finishes with substantial headroom under this limit.
    const input = "[https://a ".repeat(40_000);
    const document = parseScrapboxDocument(input);

    expect(document.lines[0].inline.filter((node) => node.type === "externalLink")).toHaveLength(40_000);
  }, 4_000);

  it("lexes unclosed decorations through the document parser in linear time", () => {
    // The former decoration regexp rescans every suffix from each "[! ".
    const document = parseScrapboxDocument("[! ".repeat(32_000));

    expect(document.lines[0].inline).toHaveLength(1);
  }, 1_000);

  it("lexes unclosed formulas through the document parser in linear time", () => {
    // The former formula regexp rescans every suffix from each "[$ ".
    const document = parseScrapboxDocument("[$ ".repeat(32_000));

    expect(document.lines[0].inline).toHaveLength(1);
  }, 1_000);

  it("lexes unclosed strong spans through the document parser in linear time", () => {
    // The former strong regexp rescans every suffix from each "[[x".
    const document = parseScrapboxDocument("[[x".repeat(48_000));

    expect(document.lines[0].inline).toHaveLength(1);
  }, 1_000);

  it("keeps the cross-matcher unclosed-input sweep linear", () => {
    const adversarialPrefixes = [
      "`x",
      "[! ",
      "[$ ",
      "[[https://i.com/a.png",
      "[[x",
      "[https://i.com/a.png ",
      "[https://link.com ",
      "[https://a ",
      "[x https://a",
      "[https://a",
      "https:// ",
      "[page.icon",
      "[Page",
      " #",
    ];

    for (const size of [8_000, 16_000]) {
      for (const prefix of adversarialPrefixes) {
        expect(parseScrapboxDocument(prefix.repeat(size)).lines).toHaveLength(1);
      }
    }
  }, 2_000);

  it("remains linear for mixed tokens and a late-only token", () => {
    const mixed = Array.from({ length: 5_000 }, (_, index) => `#tag${index} [Page${index}] https://a/${index}`).join(" ");
    const late = `${"plain ".repeat(50_000)}[Page]`;

    expect(parseScrapboxDocument(mixed).lines[0].inline).not.toHaveLength(0);
    expect(parseScrapboxDocument(late).lines[0].inline.at(-1)).toMatchObject({ type: "internalLink", href: "Page" });
  }, 5_000);
});

// Every pattern is instantiated once per parse, so nothing a parse learns can
// reach the next one. That property has no visible symptom while every pattern
// is stateless -- it starts mattering the moment one carries a cursor, and by
// then the failure would be a wrong offset in an unrelated document rather
// than an error. So it is pinned now, while it is still true by construction.
describe("parseScrapboxInline across parses", () => {
  const representativeLines = [
    "plain text with no tokens",
    "`code` and [* strong] and [/ italic]",
    "[[https://i.example/a.png]] and [https://i.example/b.png https://link.example]",
    "[$ x^2 + y^2 ] then [Page] then [/root/Page]",
    "#tag1 #tag2 https://bare.example/path",
    "[page.icon] [/project/page.icon]",
    "[https://a foo[bar] and an unclosed [ tail",
  ];

  it.each(representativeLines)("returns an equal result when the same input is parsed twice: %s", (line) => {
    expect(parseScrapboxInline(line)).toEqual(parseScrapboxInline(line));
  });

  it("gives the same result whether or not another document was parsed in between", () => {
    const solo = representativeLines.map((line) => parseScrapboxInline(line));

    // Interleave with a different, token-heavy document. If any pattern kept a
    // position from one parse to the next, the offsets here would drift.
    const interleaved = representativeLines.map((line) => {
      parseScrapboxInline("#other [Other] `x` [$ z ] https://other.example/q.png");
      return parseScrapboxInline(line);
    });

    expect(interleaved).toEqual(solo);
  });

  it("gives the same result when the same input is parsed after a longer one", () => {
    const line = representativeLines[3]!;
    const before = parseScrapboxInline(line);

    parseScrapboxInline(`${"padding ".repeat(500)}${line}`);

    expect(parseScrapboxInline(line)).toEqual(before);
  });

  it("keeps pathological strong scans independent across parses", () => {
    const line = "[[x]]".repeat(300) + "[[x\n".repeat(300) + "]]";
    const expected = parseScrapboxInline(line);

    expect(parseScrapboxInline(line)).toEqual(expected);
    parseScrapboxInline(`${"padding ".repeat(2_000)}[[other]]`);
    expect(parseScrapboxInline(line)).toEqual(expected);
  });
});

// Where a bare URL ends, as mbox reads it TODAY.
//
// This is a regression test, not a record of upstream behaviour: it makes no
// claim that any of these answers is right. It exists so that the performance
// work on this scanner can show it changed no meaning. Changing an expectation
// here to match upstream belongs to the work list's item 4-8, once that
// observation has been made and approved.
describe("where a bare url ends (pinned as-is, not as correct)", () => {
  function first(input: string) {
    const [node] = parseScrapboxInline(input);
    return { type: node.type, from: node.from, to: node.to, href: "href" in node ? node.href : undefined };
  }

  it.each([
    // The matched run reaches the next whitespace; the href is trimmed from it
    // afterwards, so the node can be wider than its own href.
    ["https://e.test/a]b", { type: "externalLink", from: 0, to: 18, href: "https://e.test/a" }],
    ["https://e.test/a[b]c", { type: "externalLink", from: 0, to: 20, href: "https://e.test/a[b" }],
    // A closing paren is NOT a terminator.
    ["https://e.test/a)b", { type: "externalLink", from: 0, to: 18, href: "https://e.test/a)b" }],
    ["https://e.test/x", { type: "externalLink", from: 0, to: 16, href: "https://e.test/x" }],
    ["http://e.test/x", { type: "externalLink", from: 0, to: 15, href: "http://e.test/x" }],
  ])("reads %s the same way", (input, expected) => {
    expect(first(input)).toEqual(expected);
  });

  it("does not require a word boundary before the scheme", () => {
    expect(parseScrapboxInline("axhttps://e.test/x")).toMatchObject([
      { type: "text", from: 0, to: 2 },
      { type: "externalLink", from: 2, to: 18, href: "https://e.test/x" },
    ]);
  });

  it("needs at least one character after the scheme", () => {
    expect(first("https://")).toMatchObject({ type: "text" });
    expect(first("https:// x")).toMatchObject({ type: "text" });
  });

  it("starts where the scheme starts, not at the line start", () => {
    expect(parseScrapboxInline("see https://e.test/x here")).toMatchObject([
      { type: "text", from: 0, to: 4 },
      { type: "externalLink", from: 4, to: 20, href: "https://e.test/x" },
      { type: "text", from: 20, to: 25 },
    ]);
  });

  it("loses to a bracketed url that starts earlier", () => {
    expect(parseScrapboxInline("[https://e.test/x]tail")).toMatchObject([
      { type: "externalLink", from: 0, to: 18, href: "https://e.test/x" },
      { type: "text", from: 18, to: 22 },
    ]);
  });
});
