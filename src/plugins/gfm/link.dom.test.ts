import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createTestContext } from "../../editor/test-context.js";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { GfmLinkWidget, gfmLinkClassName, gfmLinkPlugin, gfmUnsafeLinkClassName } from "./link.js";
import { gfmInlineCodeClassName } from "./inline-code.js";
import { gfmInlineClassNames } from "./inline.js";
import { gfmPlugins } from "./index.js";
import { parseGfmDocument } from "./parser.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options: Parameters<typeof gfmLinkPlugin>[0] = {}, activeLines: Iterable<number> = noActiveLines) {
  return gfmLinkPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

function elementFor(input: string, options: Parameters<typeof gfmLinkPlugin>[0] = {}): HTMLElement {
  const specs = specsFor(input, options);
  return (specs[0] as unknown as { widget: { toDOM(): HTMLElement } }).widget.toDOM();
}

describe("gfmLinkPlugin", () => {
  it("creates an editor for a multiline link without emitting a cross-line replace", () => {
    const parent = document.createElement("div");
    const doc = "[plain\nmultiline](https://e.test)";

    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: gfmPlugins() })],
      }),
    });

    expect(parent.textContent).toContain("[plain");
    expect(parent.textContent).toContain("multiline](https://e.test)");
    view.destroy();
  });

  it("keeps nested inline label DOM while preserving its plain-text projection", () => {
    const input = "[*a* **b**](https://example.com)";
    const link = parseGfmDocument(input).links[0];
    const element = elementFor(input);

    expect(link.text).toBe("a b");
    expect(element.querySelector(":scope > em")?.textContent).toBe("a");
    expect(element.querySelector(":scope > strong")?.textContent).toBe("b");
    expect(element.textContent).toBe("a b");
  });

  it.each([
    ["[*em* **strong** ~~deleted~~ `code`](https://example.com)", "em strong deleted code"],
    ["[![alt](https://i.example/x.png)](https://example.com)", "alt"],
    ["note[^a]\n\n[^a]: definition\n\n[x[^a]y](https://example.com)", "xay"],
    ["[<b>html</b>](https://example.com)", "<b>html</b>"],
    ["[a\\*b](https://example.com)", "a*b"],
  ])("keeps every label projection equal to its anchor text for %s", (input, expectedText) => {
    const link = parseGfmDocument(input).links.at(-1)!;
    const element = elementFor(input);

    // `[*a* **b**](u)` alone cannot break this invariant: emphasis and strong
    // already render their children. Images and footnote references instead
    // have display projections that differ from their raw source slices.
    expect(link.text).toBe(expectedText);
    expect(element.textContent).toBe(link.text);
  });

  it("uses the same semantic elements for every supported nested label kind", () => {
    const element = elementFor("[*em* **strong** `code` ~~deleted~~](https://example.com)");

    expect(element.querySelector(":scope > em")?.textContent).toBe("em");
    expect(element.querySelector(":scope > strong")?.textContent).toBe("strong");
    expect(element.querySelector(":scope > code")?.textContent).toBe("code");
    expect(element.querySelector(":scope > del")?.textContent).toBe("deleted");
  });

  it("uses the shared code-span content range for a multi-backtick label", () => {
    const element = elementFor("[``a`b``](https://example.com)");

    expect(element.querySelector(":scope > code")?.textContent).toBe("a`b");
    expect(element.textContent).toBe("a`b");
  });

  it("strips CommonMark padding from an inline-code link label", () => {
    const element = elementFor("[` a `](https://example.com)");

    expect(element.querySelector(":scope > code")?.textContent).toBe("a");
    expect(element.textContent).toBe("a");
  });

  it("keeps public inline classes on every nested link-label element", () => {
    const element = elementFor("[*em* **strong** `code` ~~deleted~~](https://example.com)");

    expect(element.querySelector(`:scope > em.${gfmInlineClassNames.emphasis}`)?.textContent).toBe("em");
    expect(element.querySelector(`:scope > strong.${gfmInlineClassNames.strong}`)?.textContent).toBe("strong");
    expect(element.querySelector(`:scope > code.${gfmInlineCodeClassName}`)?.textContent).toBe("code");
    expect(element.querySelector(`:scope > del.${gfmInlineClassNames.delete}`)?.textContent).toBe("deleted");
  });

  it("treats HTML-looking link labels as text, never as DOM", () => {
    const element = elementFor("[<b>x</b>](https://example.com)");

    // Trust boundary: the label projection contains only parser-approved
    // inline kinds. Unknown/HTML nodes are appended with textContent.
    expect(element.textContent).toBe("<b>x</b>");
    expect(element.querySelector("b")).toBeNull();
  });

  it("keeps entity spellings in link labels raw", () => {
    expect(elementFor("[a&amp;b](https://example.com)").textContent).toBe("a&amp;b");
  });

  it("does not consider differently nested link labels equivalent", () => {
    const plain = new GfmLinkWidget("a", "https://example.com", false, true);
    const emphasized = new GfmLinkWidget("a", "https://example.com", false, true, [{
      kind: "emphasis",
      from: 0,
      to: 3,
      children: [{ kind: "text", from: 1, to: 2 }],
    }], "*a*");

    expect(plain.eq(emphasized)).toBe(false);
  });

  it("reuses a later link anchor after inserting before the document", () => {
    const parent = document.createElement("div");
    const doc = Array.from({ length: 20 }, (_, index) => `[link ${index}](https://example.com/${index})`).join("\n");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [createMboxExtension({ plugins: [gfmLinkPlugin()] })],
      }),
    });
    const laterAnchor = parent.querySelectorAll<HTMLAnchorElement>(`.${gfmLinkClassName}`)[15]!;

    view.dispatch({ changes: { from: 0, insert: "x" } });

    expect(parent.querySelectorAll<HTMLAnchorElement>(`.${gfmLinkClassName}`)[15]).toBe(laterAnchor);
    view.destroy();
  });

  it("renders a javascript destination as an unsafe span instead of an anchor", () => {
    const specs = specsFor("[x](javascript:alert(1))");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.tagName).toBe("SPAN");
    expect(element.className).toBe(gfmUnsafeLinkClassName);
    expect(element.textContent).toBe("x");
  });

  it("validates the final href returned by linkUrl", () => {
    expect(elementFor("[x](./safe)", { linkUrl: () => "javascript:alert(1)" }).tagName).toBe("SPAN");
  });

  it.each([
    ["JaVaScRiPt:alert(1)", undefined],
    ["javascript&#58;alert(1)", undefined],
    ["./safe", "\u0001 javascript:alert(1)"],
    ["./safe", "java\tscript:alert(1)"],
    ["./safe", "java\nscript:alert(1)"],
    ["./safe", "java\rscript:alert(1)"],
  ])("rejects normalized javascript destination %j", (url, resolvedUrl) => {
    const options = resolvedUrl === undefined ? {} : { linkUrl: () => resolvedUrl };
    expect(elementFor(`[x](${url})`, options).tagName).toBe("SPAN");
  });

  it.each(["vbscript:msgbox(1)", "data:text/html,x", "file:///tmp/x", "blob:https://example.com/id"])(
    "rejects permanently blocked destination %j",
    (url) => {
      expect(elementFor(`[x](${url})`).tagName).toBe("SPAN");
    },
  );

  it("rejects an unknown custom scheme by default", () => {
    expect(elementFor("[x](obsidian://open?vault=notes)").tagName).toBe("SPAN");
  });

  it("allows a validated additional protocol case-insensitively", () => {
    const element = elementFor("[x](obsidian://open?vault=notes)", {
      additionalAllowedProtocols: ["Obsidian"],
    });
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("href")).toBe("obsidian://open?vault=notes");
  });

  it.each([
    ["obsidian:", "obsidian://open"],
    ["1custom", "obsidian://open"],
    ["custom name", "custom://open"],
    ["", "obsidian://open"],
    ["javascript", "javascript:alert(1)"],
    ["VBScript", "vbscript:msgbox(1)"],
    ["DATA", "data:text/plain,x"],
    ["file", "file:///tmp/x"],
    ["blob", "blob:https://example.com/id"],
  ])(
    "ignores invalid or permanently blocked additional protocol %j",
    (protocol, destination) => {
      expect(
        elementFor(`[x](${destination})`, { additionalAllowedProtocols: [protocol] }).tagName,
      ).toBe("SPAN");
    },
  );

  it.each([
    "http://example.com",
    "https://example.com",
    "mailto:user@example.com",
    "tel:+15555550123",
    "foo",
    "./foo",
    "../foo",
    "/foo",
    "?q=1",
    "#section",
    "//example.com/path",
    "javascript%3Aalert(1)",
    "%6aavascript:alert(1)",
  ])("allows safe destination %j without rewriting its href", (url) => {
    const element = elementFor(`[x](${url})`);
    expect(element.tagName).toBe("A");
    expect(element.getAttribute("href")).toBe(url);
  });

  it("renders an unsafe span with only the unsafe class, no link attributes, and the original label", () => {
    const element = elementFor("[visible label](javascript:alert(1))");
    expect(element.outerHTML).toBe(`<span class="${gfmUnsafeLinkClassName}">visible label</span>`);
    expect(element.getAttribute("href")).toBeNull();
    expect(element.getAttribute("target")).toBeNull();
    expect(element.classList.contains("mbox-gfm-link")).toBe(false);
  });

  it("keeps an empty-label unsafe destination visible", () => {
    const element = elementFor("[](javascript:alert(1))");
    expect(element.tagName).toBe("SPAN");
    expect(element.textContent).toBe("[](javascript:alert(1))");
  });

  it("keeps an empty-label safe destination visible", () => {
    const element = elementFor("[](https://example.com)");
    expect(element.tagName).toBe("A");
    expect(element.textContent).toBe("[](https://example.com)");
  });

  it("marks a bracketed absolute URL as external", () => {
    const specs = specsFor("[label](https://example.com)");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("does not mark a bracketed relative URL as external", () => {
    const specs = specsFor("[label](./other)");
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("marks a final absolute HTTP href as external even when the source URL was relative", () => {
    const specs = specsFor("[label](./other)", { linkUrl: (url) => `https://host/${url}` });
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    const element = widget.toDOM();
    expect(element.getAttribute("href")).toBe("https://host/./other");
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });

  it("does not mark a final relative href as external when the source URL was absolute", () => {
    const element = elementFor("[label](https://example.com)", { linkUrl: () => "./internal" });
    expect(element.getAttribute("href")).toBe("./internal");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("does not mark a protocol-relative href as external", () => {
    const element = elementFor("[label](//example.com/path)");
    expect(element.getAttribute("target")).toBeNull();
    expect(element.getAttribute("rel")).toBeNull();
  });

  it("renders a GFM autolink as an anchor over its own text", () => {
    const specs = specsFor("www.example.com", { linkUrl: (url) => `${url}?via=mbox` });
    const widget = (specs[0] as unknown as { widget: GfmLinkWidget }).widget;
    expect(widget.text).toBe("www.example.com");
    // The autolink url is already normalized to http(s) by the parser, then run
    // through the host resolver like any other link.
    expect(widget.href).toBe("http://www.example.com?via=mbox");
    expect(widget.autolink).toBe(true);
    const element = widget.toDOM();
    expect(element.getAttribute("target")).toBe("_blank");
    expect(element.getAttribute("rel")).toBe("noreferrer");
  });
});

// `[![alt](img)](link)` is plain CommonMark -- not a GitHub extension -- and it
// means `<a><img></a>`. The anchor is already the link widget, so the image
// only has to become an `<img>` inside it. That also keeps the destination on
// the link plugin's allowlist-checked path instead of handing a URL to another
// plugin to render.
describe("an image inside a link label", () => {
  function linkView(doc: string, plugins = gfmPlugins({ image: { renderMode: "preview" } })) {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      // Selection on the trailing line so the link's own line stays idle.
      state: EditorState.create({ doc: `${doc}\ntrailing`, selection: { anchor: doc.length + 1 }, extensions: [createMboxExtension({ plugins })] }),
    });
    return { parent, view };
  }

  it("draws the image inside the anchor, not its alt text", () => {
    const { parent, view } = linkView("[![alt](https://e.test/i.png)](https://e.test/page)");
    const anchor = parent.querySelector<HTMLAnchorElement>(`a.${gfmLinkClassName}`);
    const image = anchor?.querySelector("img");

    expect(anchor).not.toBeNull();
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toBe("https://e.test/i.png");
    expect(image?.getAttribute("alt")).toBe("alt");
    // The alt must not ALSO appear as text beside the picture.
    expect(anchor?.textContent).toBe("");

    view.destroy();
  });

  it("sends a click to the link's destination, not the image's", () => {
    const { parent, view } = linkView("[![alt](https://e.test/i.png)](https://e.test/page)");
    const anchor = parent.querySelector<HTMLAnchorElement>(`a.${gfmLinkClassName}`);

    expect(anchor?.getAttribute("href")).toBe("https://e.test/page");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noreferrer");

    view.destroy();
  });

  it("keeps the alt text when the host renders tokens", () => {
    // Whether pictures are drawn at all is the image plugin's setting, and a
    // link label is not an exception to it.
    const { parent, view } = linkView(
      "[![alt](https://e.test/i.png)](https://e.test/page)",
      gfmPlugins({ image: { renderMode: "token" } }),
    );
    const anchor = parent.querySelector<HTMLAnchorElement>(`a.${gfmLinkClassName}`);

    expect(anchor?.querySelector("img")).toBeNull();
    expect(anchor?.textContent).toBe("alt");

    view.destroy();
  });

  it("draws an image beside other label content", () => {
    const { parent, view } = linkView("[before ![alt](https://e.test/i.png) after](https://e.test/page)");
    const anchor = parent.querySelector<HTMLAnchorElement>(`a.${gfmLinkClassName}`);

    expect(anchor?.querySelector("img")).not.toBeNull();
    expect(anchor?.textContent).toBe("before  after");

    view.destroy();
  });

  it("draws an image nested inside emphasis in the label", () => {
    const { parent, view } = linkView("[**![alt](https://e.test/i.png)**](https://e.test/page)");

    expect(parent.querySelector(`a.${gfmLinkClassName} strong img`)).not.toBeNull();

    view.destroy();
  });

  it("leaves the raw source on the active line", () => {
    const doc = "[![alt](https://e.test/i.png)](https://e.test/page)";
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: { anchor: 2 },
        extensions: [createMboxExtension({ plugins: gfmPlugins({ image: { renderMode: "preview" } }) })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: { anchor: 2 } as never });

    expect(parent.querySelector("img")).toBeNull();
    expect(parent.querySelector(".cm-line")?.textContent).toBe(doc);

    view.destroy();
  });

  it("does not draw a picture for a destination the allowlist rejects", () => {
    // The unsafe widget is a span, not an anchor -- but its label is built the
    // same way, so the image still renders. What must not appear is a
    // clickable anchor to the rejected destination.
    const { parent, view } = linkView("[![alt](https://e.test/i.png)](javascript:alert(1))");

    expect(parent.querySelector(`a.${gfmLinkClassName}`)).toBeNull();
    expect(parent.querySelector(`.${gfmUnsafeLinkClassName} img`)).not.toBeNull();

    view.destroy();
  });
});
