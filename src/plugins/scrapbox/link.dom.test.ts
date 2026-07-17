import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension, mboxDecorationProviders } from "../../editor/plugin.js";
import { scrapboxDecorationPlugin, scrapboxStrongClassName } from "./decoration.js";
import { parseScrapboxDocument } from "./parser.js";
import {
  scrapboxHashTagClassName,
  scrapboxIconImageClassName,
  scrapboxLinkClassName,
  scrapboxLinkPlugin,
  scrapboxPageMissingClassName,
  pageHref,
  scrapboxUrlClassName,
  ScrapboxIconWidget,
  ScrapboxLinkWidget,
} from "./link.js";
import { createTestContext } from "../../editor/test-context.js";
import type { MboxReplaceDecorationSpec } from "../../editor/plugin.js";

const noActiveLines = new Set<number>();

function specsFor(input: string, options = {}, activeLines: Iterable<number> = noActiveLines) {
  return scrapboxLinkPlugin(options).decorations!(createTestContext(input, { activeLines }));
}

describe("createScrapboxLinkSpecs", () => {
  it("keeps link classes unchanged when pageExists is omitted", () => {
    const specs = specsFor("[Page] #tag https://e.com [demo-user.icon]");

    for (const spec of specs) {
      const widget = (spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget | ScrapboxIconWidget;
      expect(widget.toDOM().className).not.toContain(scrapboxPageMissingClassName);
    }
  });

  it("adds the missing page class to an inactive internal link only when pageExists returns false", () => {
    const [missingSpec] = specsFor("[Missing]", {
      pageExists: (name: string) => name !== "Missing",
    });
    const [existingSpec] = specsFor("[Existing]", {
      pageExists: (name: string) => name !== "Missing",
    });

    expect(((missingSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().classList).toContain(
      scrapboxPageMissingClassName,
    );
    expect(((existingSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().classList).not.toContain(
      scrapboxPageMissingClassName,
    );
  });

  it("replaces a bracketed external link with a widget carrying the url and label", () => {
    const [spec] = specsFor("[https://e.com label]");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 21 });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM();
    expect(dom.className).toContain(scrapboxUrlClassName);
    expect(dom.textContent).toBe("label");
    expect(dom.getAttribute("href")).toBe("https://e.com");
    expect(dom.getAttribute("target")).toBe("_blank");
  });

  it("does not add the missing page class to external links or icons", () => {
    const specs = specsFor("[https://e.com label] [missing.icon]", {
      pageExists: () => false,
    });

    for (const spec of specs) {
      const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget | ScrapboxIconWidget).toDOM();
      expect(dom.classList).not.toContain(scrapboxPageMissingClassName);
    }
  });

  it("replaces a bare external url with a widget showing the url", () => {
    const [spec] = specsFor("https://e.com");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 13 });
    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().textContent).toBe("https://e.com");
  });

  it("replaces a hashtag with an anchor keeping the hash", () => {
    const [spec] = specsFor("a #tag");

    expect(spec).toMatchObject({ type: "replace", from: 2, to: 6 });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM();
    expect(dom.textContent).toBe("#tag");
    expect(dom.getAttribute("href")).toBe("./tag");
  });

  it("adds the missing page class to an inactive hashtag while keeping the hashtag base class", () => {
    const [spec] = specsFor("a #missing", {
      pageExists: (name: string) => name !== "missing",
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM();

    expect(dom.classList).toContain(scrapboxHashTagClassName);
    expect(dom.classList).toContain(scrapboxPageMissingClassName);
  });

  it("adds the missing page class to a link nested inside a decoration", () => {
    const [spec] = specsFor("[* [Missing]]", {
      pageExists: (name: string) => name !== "Missing",
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM();

    expect(dom.classList).toContain(scrapboxLinkClassName);
    expect(dom.classList).toContain(scrapboxPageMissingClassName);
  });

  it("replaces an icon with an anchor to its page, showing the name by default", () => {
    const [spec] = specsFor("[demo-user.icon]");

    expect(spec).toMatchObject({ type: "replace", from: 0, to: 16 });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM();
    expect(dom.getAttribute("href")).toBe("./demo-user");
    expect(dom.textContent).toBe("demo-user");
    expect(dom.querySelector("img")).toBeNull();
  });

  it("renders an icon image from the raw icon name, unparsed", () => {
    const document = parseScrapboxDocument("[/team/bob.icon]");
    // The icon name is handed to iconUrl exactly as written between `[` and
    // `.icon]` — no project/path parsing — so `/team/bob` arrives whole.
    const [spec] = specsFor("[/team/bob.icon]", {
      iconUrl: (iconName: string) => `https://icons.example/${iconName}.png`,
    });
    const dom = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM();
    const image = dom.querySelector<HTMLImageElement>(`img.${scrapboxIconImageClassName}`);

    expect(dom.getAttribute("href")).toBe("/team/bob");
    expect(image?.getAttribute("src")).toBe("https://icons.example//team/bob.png");
    expect(image?.getAttribute("alt")).toBe("bob");
  });

  it("builds the internal link href via pageUrl", () => {
    const [spec] = specsFor("[Page]", {
      pageUrl: (name: string) => `https://example.com/wiki/${name}`,
    });

    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("https://example.com/wiki/Page");
  });

  it("defaults the internal link href to ./name without a pageUrl resolver", () => {
    const [spec] = specsFor("[Page]");

    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("./Page");
  });

  it("keeps ordinary root, relative, and hashtag hrefs unchanged by the default resolver", () => {
    const [rootSpec] = specsFor("[/project/Page]");
    const [relativeSpec] = specsFor("[Page]");
    const [tagSpec] = specsFor("#tag");

    expect(((rootSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("/project/Page");
    expect(((relativeSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("./Page");
    expect(((tagSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("./tag");
  });

  it.each([
    ["[//evil.example/x]", "/evil.example/x"],
    ["[/\\evil.example/x]", "/evil.example/x"],
    ["[/\\\\evil.example/x]", "/evil.example/x"],
    ["[/\t//evil.example/x]", "/evil.example/x"],
  ])("normalizes unsafe root reference %s", (input, expectedHref) => {
    const [spec] = specsFor(input);
    const href = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href");

    expect(href).toBe(expectedHref);
    expect(new URL(href!, "https://mbox.example/current").origin).toBe("https://mbox.example");
  });

  it("parses a single-backslash root reference as an internal link before rendering it safely", () => {
    const input = "[/\\evil.example/x]";
    const [node] = parseScrapboxDocument(input).lines[0].inline;
    const [spec] = specsFor(input);

    expect(node).toMatchObject({ type: "internalLink", pathType: "root", href: "/\\evil.example/x" });
    const href = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href");
    expect(href).toBe("/evil.example/x");
    expect(new URL(href!, "https://mbox.example/current").origin).toBe("https://mbox.example");
  });

  it("normalizes a CR in a root name before the browser URL parser can remove it", () => {
    const href = pageHref("/\r//evil.example/x", "root");

    expect(href).toBe("/evil.example/x");
    expect(new URL(href, "https://mbox.example/current").origin).toBe("https://mbox.example");
  });

  it("normalizes unsafe root icon hrefs through the same default resolver", () => {
    const [rootSpec] = specsFor("[/team/bob.icon]");
    const [unsafeSpec] = specsFor("[//evil.example/bob.icon]");

    expect(((rootSpec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM().getAttribute("href")).toBe("/team/bob");
    const href = ((unsafeSpec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM().getAttribute("href");
    expect(href).toBe("/evil.example/bob");
    expect(new URL(href!, "https://mbox.example/current").origin).toBe("https://mbox.example");
  });

  it("does not rewrite a custom pageUrl result", () => {
    const [spec] = specsFor("[//evil.example/x]", { pageUrl: () => "//custom.example/x" });

    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("//custom.example/x");
  });

  it.each(["%2f%2fevil", "%5c%5cevil", "／／evil"])("does not over-normalize %s", (name) => {
    const [spec] = specsFor(`[/${name}]`);

    expect(((spec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe(`/${name}`);
  });

  it("routes the icon anchor and hashtag hrefs through pageUrl too", () => {
    const pageUrl = (name: string) => `https://example.com/wiki/${name}`;

    const [iconSpec] = specsFor("[demo-user.icon]", {
      pageUrl,
    });
    expect(((iconSpec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM().getAttribute("href")).toBe("https://example.com/wiki/demo-user");

    const [tagSpec] = specsFor("a #tag", { pageUrl });
    expect(((tagSpec as MboxReplaceDecorationSpec).widget as ScrapboxLinkWidget).toDOM().getAttribute("href")).toBe("https://example.com/wiki/tag");
  });
});

describe("scrapboxLinkPlugin", () => {
  it("builds the icon image src from the raw icon name via the iconUrl option", () => {
    const state = EditorState.create({
      doc: "[demo-user.icon]",
      extensions: [
        createMboxExtension({
          plugins: [scrapboxLinkPlugin({ iconUrl: (iconName) => `https://icons.example/${iconName}/icon` })],
        }),
      ],
    });
    const [{ provider }] = state.facet(mboxDecorationProviders);
    const [spec] = provider({ state, hasFocus: false, activeLineNumbers: new Set<number>() } as unknown as Parameters<typeof provider>[0]);
    const image = ((spec as MboxReplaceDecorationSpec).widget as ScrapboxIconWidget).toDOM().querySelector<HTMLImageElement>(`img.${scrapboxIconImageClassName}`);

    // A relative icon passes its bare name through untouched — the consumer's
    // iconUrl supplies the project/host.
    expect(image?.getAttribute("src")).toBe("https://icons.example/demo-user/icon");
  });

  it("styles internal link, url and hashtag targets in the editor view", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page] https://e.com #tag",
        selection: EditorSelection.cursor(0),
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
      }),
    });

    const internal = parent.querySelector<HTMLAnchorElement>(`a.${scrapboxLinkClassName}`);
    expect(internal?.textContent).toBe("Page");
    expect(internal?.getAttribute("href")).toBe("./Page");
    expect(parent.querySelector<HTMLAnchorElement>(`a.${scrapboxUrlClassName}`)?.getAttribute("href")).toBe(
      "https://e.com",
    );
    expect(parent.querySelector(`a.${scrapboxHashTagClassName}`)?.textContent).toBe("#tag");
    // Internal link brackets are hidden while the editor is unfocused.
    expect(parent.querySelector(".cm-line")?.textContent).not.toContain("[Page]");

    view.destroy();
  });

  it("renders an empty decoration marker (e.g. [* ]) as a link to a garbage-titled page", () => {
    // decorationRegExp requires non-empty content, so "[* ]" never matches as
    // a decoration -- it falls through to the more permissive internal-link
    // pattern instead. Accepted, current behavior (not literal unstyled
    // text), confirmed with the user.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "a [* ] b",
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
      }),
    });

    const link = parent.querySelector<HTMLAnchorElement>(`a.${scrapboxLinkClassName}`);
    expect(link?.textContent).toBe("* ");
    expect(link?.getAttribute("href")).toBe("./* ");

    view.destroy();
  });

  it("reveals the raw brackets on the active line but keeps the link color", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[Page]",
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("[Page]");
    // No clickable anchor while editing (real Scrapbox does the same -- an
    // unclickable span carries the color instead), but the color itself
    // survives onto the active line.
    expect(parent.querySelector(`a.${scrapboxLinkClassName}`)).toBeNull();
    const mark = parent.querySelector(`.${scrapboxLinkClassName}`);
    expect(mark?.textContent).toBe("[Page]");

    view.destroy();
  });

  it("keeps the color on an active line's bracketed external link and hashtag too", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[https://e.com label] #tag",
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("[https://e.com label] #tag");
    expect(parent.querySelector(`.${scrapboxUrlClassName}`)?.textContent).toBe("[https://e.com label]");
    expect(parent.querySelector(`.${scrapboxHashTagClassName}`)?.textContent).toBe("#tag");

    view.destroy();
  });

  it("keeps both the link color and the strong style on an active line's nested [[[Page]]]", () => {
    // `[[[Page]]]` is a strong span whose sole content is `[Page]`, an
    // internalLink -- the strong's content range and the link's from/to are
    // the exact same span, from two independent plugins each marking it.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[[[Page]]]",
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin(), scrapboxDecorationPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(parent.querySelector(".cm-line")?.textContent).toBe("[[[Page]]]");
    expect(parent.querySelector(`.${scrapboxLinkClassName}`)?.textContent).toBe("[Page]");
    expect(parent.querySelector(`.${scrapboxStrongClassName}`)?.textContent).toBe("[Page]");

    view.destroy();
  });

  it("keeps the missing page class alongside the strong style on an active nested [[[Missing]]]", () => {
    // The most consumer-fragile case: a missing link nested in a strong span.
    // The strong content range and the link's from/to are the same span, so
    // the missing modifier must stay reachable as an independent class token
    // even while the decoration plugin also marks that span as strong.
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[[[Missing]]]",
        extensions: [
          createMboxExtension({
            plugins: [scrapboxLinkPlugin({ pageExists: (name) => name !== "Missing" }), scrapboxDecorationPlugin()],
          }),
        ],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    expect(parent.querySelector(`.${scrapboxPageMissingClassName}`)?.textContent).toBe("[Missing]");
    expect(parent.querySelector(`.${scrapboxStrongClassName}`)?.textContent).toBe("[Missing]");

    view.destroy();
  });

  it("renders two adjacent active links as separate spans, not merged into one", () => {
    const parent = document.createElement("div");
    const view = createEditorView({
      parent,
      state: EditorState.create({
        doc: "[A][B]",
        extensions: [createMboxExtension({ plugins: [scrapboxLinkPlugin()] })],
      }),
    });
    Object.defineProperty(view, "hasFocus", { value: true });
    view.dispatch({ selection: EditorSelection.cursor(0) });

    const links = parent.querySelectorAll(`.${scrapboxLinkClassName}`);
    expect(links).toHaveLength(2);
    expect(links[0].textContent).toBe("[A]");
    expect(links[1].textContent).toBe("[B]");

    view.destroy();
  });
});
