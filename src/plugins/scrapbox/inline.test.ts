import { describe, expect, it } from "vitest";
import { parseScrapboxInline } from "./inline.js";
import { parseScrapboxDocument } from "./parser.js";

describe("parseScrapboxInline", () => {
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
  ])("keeps an opening bracket in the url-first link label, like the reference parser: %s", (input, content) => {
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
    ["image URL", "[https://i.invalid/a[x.png]", "image"],
    ["image URL query", "[https://i.invalid/a.png?[x]", "image"],
    ["src-first image link", "[https://i.invalid/a[x.png https://link.invalid]", "image"],
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

  it("parses a src-first image with a link", () => {
    const [node] = parseScrapboxInline("[https://i.com/a.png https://link.com]");

    expect(node).toMatchObject({ type: "image", src: "https://i.com/a.png", link: "https://link.com" });
  });

  it("parses a link-first image", () => {
    const [node] = parseScrapboxInline("[https://link.com https://i.com/a.png]");

    expect(node).toMatchObject({ type: "image", src: "https://i.com/a.png", link: "https://link.com" });
  });

  it("parses a strong (double-bracket) image", () => {
    const [node] = parseScrapboxInline("[[https://i.com/a.png]]");

    expect(node).toMatchObject({ type: "strongImage", from: 0, to: 23, src: "https://i.com/a.png" });
  });

  it("takes image priority over external link for image urls", () => {
    expect(parseScrapboxInline("[https://i.com/a.png]")[0].type).toBe("image");
    // a non-image url stays an external link
    expect(parseScrapboxInline("[https://i.com/page]")[0].type).toBe("externalLink");
  });

  it("parses a bracketed Gyazo url with no file extension as an image", () => {
    const [node] = parseScrapboxInline("[https://gyazo.com/0123456789abcdef0123456789abcdef]");

    expect(node).toMatchObject({
      type: "image",
      src: "https://gyazo.com/0123456789abcdef0123456789abcdef",
      link: "",
    });
  });

  it("recognises a Gyazo url with a subdomain and a /raw suffix", () => {
    const [node] = parseScrapboxInline("[https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw]");

    expect(node).toMatchObject({
      type: "image",
      src: "https://i.gyazo.com/0123456789abcdef0123456789abcdef/raw",
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
