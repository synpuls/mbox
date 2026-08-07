import { WidgetType } from "@codemirror/view";
import { createContentMarkSpec, type MboxDecorationSpec, type MboxPlugin, type MboxThemeSpec } from "../../editor/plugin.js";
import type { MboxActiveLineNumbers } from "../../editor/focused-line.js";
import type { ScrapboxInlineNode } from "./inline.js";
import { collectScrapboxInlineNodeResults } from "./inline-walker.js";
import type { ScrapboxDocument, ScrapboxLine } from "./parser.js";
import { getScrapboxDocumentFromState } from "./parser-cache.js";
import { scrapboxLinkSkippedLineNumbers } from "./visible-lines.js";
import { createAnchorElement } from "../inline-notation-kit.js";

export const scrapboxLinkClassName = "mbox-scrapbox-link";
export const scrapboxUrlClassName = "mbox-scrapbox-url";
export const scrapboxHashTagClassName = "mbox-scrapbox-hashtag";
export const scrapboxIconClassName = "mbox-scrapbox-icon";
export const scrapboxIconImageClassName = "mbox-scrapbox-icon-image";
export const scrapboxStrongIconClassName = "mbox-scrapbox-icon-strong";
export const scrapboxStrongIconMeasureClassName = "mbox-scrapbox-icon-strong-measure";
export const scrapboxPageMissingClassName = "mbox-scrapbox-page-missing";

export const scrapboxLinkClassNames = {
  link: scrapboxLinkClassName,
  url: scrapboxUrlClassName,
  hashTag: scrapboxHashTagClassName,
  icon: scrapboxIconClassName,
  strongIcon: scrapboxStrongIconClassName,
  pageMissing: scrapboxPageMissingClassName,
};

/**
 * Build the avatar image URL for an icon notation from its raw name — the exact
 * text between `[` and `.icon]`, unparsed. `[demo-user.icon]` passes
 * `"demo-user"`, `[/team/bob.icon]` passes `"/team/bob"`, `[team/alice.icon]`
 * passes `"team/alice"`. The library makes no assumption about project/host/path
 * structure — the consumer maps the name to whatever URL their instance uses.
 */
export type ScrapboxIconUrlResolver = (iconName: string) => string;

/**
 * Build the href for an internal page reference from its raw name — the exact
 * text between `[` and `]` (or after `#`), unparsed. `[Page]` passes `"Page"`,
 * `[/proj/Page]` passes `"/proj/Page"`, `#tag` passes `"tag"`. Like
 * {@link ScrapboxIconUrlResolver}, the library assumes nothing about the URL;
 * the consumer maps the name to whatever their instance uses. When omitted the
 * href defaults to `./name` (or the raw `/proj/name` for a root reference).
 */
export type ScrapboxPageUrlResolver = (pageName: string) => string;

/**
 * Test whether an internal page reference exists from its raw name — the exact
 * text between `[` and `]` (or after `#`), unparsed. `[Page]` passes `"Page"`,
 * `[/proj/Page]` passes `"/proj/Page"`, `#tag` passes `"tag"`. Normalization
 * is the consumer's responsibility. Page references for which this returns
 * `false` get {@link scrapboxPageMissingClassName} added; when omitted no
 * missing-page class is added, preserving the previous behavior. This predicate
 * is called synchronously for every page-reference node whenever decorations
 * are rebuilt, so it must be cheap and pure (no side effects, no async work) and
 * must not throw — like {@link ScrapboxPageUrlResolver}, an exception from it
 * discards the link plugin's decorations for that update cycle. After existence
 * data changes, the consumer controls immediate reflection by dispatching an
 * editor transaction.
 */
export type ScrapboxPageExistsResolver = (pageName: string) => boolean;

export interface ScrapboxLinkPluginOptions {
  iconUrl?: ScrapboxIconUrlResolver;
  pageUrl?: ScrapboxPageUrlResolver;
  /**
   * Test whether a page reference exists from its raw name. `[Page]` passes
   * `"Page"`, `[/proj/Page]` passes `"/proj/Page"`, and `#tag` passes `"tag"`;
   * normalization is the consumer's responsibility. Returning `false` adds
   * {@link scrapboxPageMissingClassName}; omitting the resolver adds no class.
   * Called synchronously per page-reference node on every decoration rebuild,
   * so it must be cheap, pure, side-effect free, and non-async. Dispatch a
   * transaction after existence data changes to reflect updates immediately.
   */
  pageExists?: ScrapboxPageExistsResolver;
}

export class ScrapboxLinkWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly text: string,
    private readonly className: string,
    private readonly external: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ScrapboxLinkWidget &&
      this.href === other.href &&
      this.text === other.text &&
      this.className === other.className &&
      this.external === other.external
    );
  }

  toDOM(): HTMLElement {
    return createAnchorElement({
      href: this.href,
      text: this.text,
      className: this.className,
      attributes: this.external ? { target: "_blank", rel: "noreferrer" } : undefined,
    });
  }
}

export class ScrapboxIconWidget extends WidgetType {
  constructor(
    private readonly href: string,
    private readonly name: string,
    private readonly iconUrl: string | undefined,
    private readonly repeatCount = 1,
    private readonly strong = false,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ScrapboxIconWidget &&
      this.href === other.href &&
      this.name === other.name &&
      this.iconUrl === other.iconUrl &&
      this.repeatCount === other.repeatCount &&
      this.strong === other.strong
    );
  }

  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.className = scrapboxIconClassName;
    anchor.setAttribute("href", this.href);
    anchor.setAttribute("title", this.name);
    if (this.iconUrl) {
      const image = document.createElement("img");
      image.className = scrapboxIconImageClassName;
      image.src = this.iconUrl;
      image.alt = this.name;
      anchor.appendChild(image);
    } else {
      anchor.textContent = this.name;
    }
    if (this.repeatCount === 1 && !this.strong) return anchor;
    const container = document.createElement("span");
    container.className = this.strong ? `${scrapboxIconClassName} ${scrapboxStrongIconClassName}` : scrapboxIconClassName;
    container.append(anchor);
    for (let index = 1; index < this.repeatCount; index += 1) container.append(anchor.cloneNode(true));
    return container;
  }
}

class ScrapboxStrongIconMeasureWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof ScrapboxStrongIconMeasureWidget;
  }

  toDOM(): HTMLElement {
    const measure = document.createElement("span");
    measure.className = scrapboxStrongIconMeasureClassName;
    measure.setAttribute("aria-hidden", "true");
    measure.style.pointerEvents = "none";
    return measure;
  }
}

function replaceWithWidget(from: number, to: number, widget: WidgetType): MboxDecorationSpec {
  return { type: "replace", from, to, widget };
}

interface ScrapboxLinkResolvers {
  iconUrl?: ScrapboxIconUrlResolver;
  pageUrl?: ScrapboxPageUrlResolver;
  /**
   * Test whether a page reference exists from its raw name. `[Page]` passes
   * `"Page"`, `[/proj/Page]` passes `"/proj/Page"`, and `#tag` passes `"tag"`;
   * normalization is the consumer's responsibility. Returning `false` adds
   * {@link scrapboxPageMissingClassName}; omitting the resolver adds no class.
   * Called synchronously per page-reference node on every decoration rebuild,
   * so it must be cheap, pure, side-effect free, and non-async. Dispatch a
   * transaction after existence data changes to reflect updates immediately.
   */
  pageExists?: ScrapboxPageExistsResolver;
}

/**
 * Build the href for an internal page reference. When a `pageUrl` resolver is
 * given the consumer owns the whole URL (raw `name` passed through); otherwise
 * fall back to the default `./name` (or the raw `/proj/name` for a root ref).
 */
export function pageHref(name: string, pathType: "root" | "relative", pageUrl?: ScrapboxPageUrlResolver): string {
  if (pageUrl) return pageUrl(name);
  return pathType === "root" ? name.replace(/^[/\\\t\n\r]+/, "/") : `./${name}`;
}

function withMissingPageClass(baseClassName: string, pageName: string, resolvers: ScrapboxLinkResolvers): string {
  return resolvers.pageExists?.(pageName) === false ? `${baseClassName} ${scrapboxPageMissingClassName}` : baseClassName;
}

/**
 * The text a link-shaped inline node contributes after this module renders it.
 * Keeping this beside the widgets makes their visible labels a single
 * responsibility: consumers such as table measurement project this function's
 * result instead of reimplementing Scrapbox link grammar.
 */
function linkDisplayText(node: ScrapboxInlineNode): string | undefined {
  switch (node.type) {
    case "icon":
      return (node.path.split("/").pop() ?? node.path).repeat(node.repeatCount);
    case "internalLink":
      return node.href;
    case "externalLink":
      return node.content || node.href;
    case "hashTag":
      return `#${node.href}`;
    default:
      return undefined;
  }
}

function iconDisplayName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * @internal Exported for focused projection tests and table-kit integration;
 * not part of the notation bundle's public API.
 *
 * Project a range as its link widgets display it. This belongs in the link
 * module because it owns both the widget replacements and their labels;
 * `table.ts` only asks for the projection to measure a cell. Icons always
 * project to the final page-name segment (`[alice/bob.icon]` becomes `bob`),
 * independently of `iconUrl`: without a resolver this exactly matches the
 * text fallback. With a resolver the final segment is usually wider than the
 * roughly 1em image, but that is not guaranteed: it depends on the name
 * length, the loaded image's aspect ratio, and the host cell box. A one-letter
 * name reserves only 1ch, which can be narrower than 1em.
 *
 * Work-list 4-4 records the measured host interaction: the fixture's square
 * icon fits because its cell has extra host width, while a wide image crosses
 * its cell. This projection remains text-only; it cannot promise image fit.
 */
export function projectScrapboxLinkDisplayValue(
  input: string,
  line: ScrapboxLine,
  from: number,
  to: number,
): string | undefined {
  const links = collectScrapboxInlineNodeResults(line.inline, (node) => {
    const text = linkDisplayText(node);
    return text !== undefined && node.from >= from && node.to <= to ? [{ from: node.from, to: node.to, text }] : [];
  });
  if (links.length === 0) return undefined;

  let cursor = from;
  let value = "";
  for (const link of links) {
    if (link.from < cursor) continue;
    value += input.slice(cursor, link.from) + link.text;
    cursor = link.to;
  }
  return value + input.slice(cursor, to);
}

/**
 * Build the decoration specs for one link-shaped inline node.
 *
 * A page/external/hash link stays coloured even while its line is focused:
 * the raw brackets are revealed, but the whole span (brackets included) stays
 * wrapped in the same link styling, so the text under the cursor does not
 * change colour as you move into it. The anchor itself is dropped on an active
 * line -- a clickable link would fight the caret -- and only the colour
 * survives. The icon widget is left as-is here: showing the raw `[name.icon]`
 * text *and* the icon image side by side is a dual-render this plugin does not
 * attempt.
 */
function collectLinkSpecs(node: ScrapboxInlineNode, resolvers: ScrapboxLinkResolvers, active: boolean): MboxDecorationSpec[] {
  switch (node.type) {
    case "icon": {
      if (active) return [];
      const href = pageHref(node.path, node.pathType, resolvers.pageUrl);
      const name = iconDisplayName(node.path);
      return [
        replaceWithWidget(
          node.from,
          node.to,
          // Pass the raw icon name straight through; the consumer builds the URL.
          new ScrapboxIconWidget(href, name!, resolvers.iconUrl?.(node.path), node.repeatCount),
        ),
      ];
    }
    case "internalLink": {
      const className = withMissingPageClass(scrapboxLinkClassName, node.href, resolvers);
      if (active) return [createContentMarkSpec(node.from, node.to, className)];
      const href = pageHref(node.href, node.pathType, resolvers.pageUrl);
      return [
        replaceWithWidget(
          node.from,
          node.to,
          new ScrapboxLinkWidget(href, node.href, className, false),
        ),
      ];
    }
    case "externalLink": {
      const className = `${scrapboxUrlClassName} ${scrapboxLinkClassName}`;
      if (active) return [createContentMarkSpec(node.from, node.to, className)];
      return [
        replaceWithWidget(
          node.from,
          node.to,
          new ScrapboxLinkWidget(node.href, node.content || node.href, className, true),
        ),
      ];
    }
    case "hashTag": {
      // A hashtag is an internal page reference too, so it shares `pageUrl`
      // (relative fallback `./tag`). The display keeps the leading `#`.
      const className = withMissingPageClass(scrapboxHashTagClassName, node.href, resolvers);
      if (active) return [createContentMarkSpec(node.from, node.to, className)];
      return [
        replaceWithWidget(
          node.from,
          node.to,
          new ScrapboxLinkWidget(pageHref(node.href, "relative", resolvers.pageUrl), `#${node.href}`, className, false),
        ),
      ];
    }
    default:
      return [];
  }
}

function isStrongIcon(node: ScrapboxInlineNode): node is Extract<ScrapboxInlineNode, { type: "strong" }> & { children: [Extract<ScrapboxInlineNode, { type: "icon" }>] } {
  return node.type === "strong" && node.children.length === 1 && node.children[0]?.type === "icon";
}

function collectLineLinkSpecs(nodes: ScrapboxInlineNode[], resolvers: ScrapboxLinkResolvers, active: boolean): MboxDecorationSpec[] {
  return nodes.flatMap((node) => {
    if (isStrongIcon(node)) {
      const icon = node.children[0];
      if (active) return [{ type: "widget" as const, from: node.from, side: -1, widget: new ScrapboxStrongIconMeasureWidget() }];
      const href = pageHref(icon.path, icon.pathType, resolvers.pageUrl);
      const name = iconDisplayName(icon.path);
      return [replaceWithWidget(node.from, node.to, new ScrapboxIconWidget(href, name, resolvers.iconUrl?.(icon.path), icon.repeatCount, true))];
    }
    const own = collectLinkSpecs(node, resolvers, active);
    return node.type === "decoration" || node.type === "strong" ? [...own, ...collectLineLinkSpecs(node.children, resolvers, active)] : own;
  });
}

function createScrapboxLinkSpecs(
  document: ScrapboxDocument,
  activeLines: MboxActiveLineNumbers,
  resolvers: ScrapboxLinkResolvers = {},
): MboxDecorationSpec[] {
  const skippedLineNumbers = scrapboxLinkSkippedLineNumbers(document);

  return document.lines.flatMap((line) => {
    if (skippedLineNumbers.has(line.line)) return [];
    const active = activeLines.has(line.line);
    return collectLineLinkSpecs(line.inline, resolvers, active);
  });
}

export function scrapboxLinkPlugin(options: ScrapboxLinkPluginOptions = {}): MboxPlugin {
  return {
    theme: {
      // Keep the icon exactly one text em tall and aligned to the text bottom.
      // The raw `[name.icon]` text it replaces is one line tall, so an icon that
      // never exceeds the line box produces no vertical layout shift on focus.
      [`.${scrapboxIconClassName}`]: {
        textDecoration: "none",
      },
      [`.${scrapboxIconImageClassName}`]: {
        height: "1em",
        width: "auto",
        verticalAlign: "text-bottom",
      },
      [`.${scrapboxStrongIconClassName} .${scrapboxIconImageClassName}`]: {
        height: "calc(var(--mbox-scrapbox-icon-strong-scale, 3) * 1em)",
      },
      [`.${scrapboxStrongIconMeasureClassName}`]: {
        // Repeats deliberately have no measure widget: their wrapped height
        // cannot be reproduced by a zero-width box, and upstream's focused-row
        // behaviour for repeats has not been observed.
        display: "inline-block",
        width: "0",
        height: "calc(var(--mbox-scrapbox-icon-strong-scale, 3) * 1em)",
        visibility: "hidden",
        pointerEvents: "none",
        verticalAlign: "text-bottom",
      },
    },
    name: "scrapbox/link",
    decorations: (context) => {
      const document = getScrapboxDocumentFromState(context.state);
      return createScrapboxLinkSpecs(document, context.activeLineNumbers, {
        iconUrl: options.iconUrl,
        pageUrl: options.pageUrl,
        pageExists: options.pageExists,
      });
    },
  };
}
