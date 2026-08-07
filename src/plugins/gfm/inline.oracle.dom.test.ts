import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";

type InlineKind = "a" | "code" | "del" | "em" | "strong";
type InlineSemantic = { kind: InlineKind; text: string };
type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

const fixturesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/gfm");

function readFixture(name: string): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(resolve(fixturesDirectory, name), "utf8")) as GitHubMarkdownFixture;
}

function githubLinkIR(html: string): InlineSemantic[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a")];
  expect(anchors).not.toHaveLength(0);
  return semanticIR(anchors, githubInlineKind);
}

function mboxLinkIR(markdown: string): InlineSemantic[] {
  return withMbox(markdown, (parent) => {
    const anchors = [...parent.querySelectorAll<HTMLElement>("a.mbox-gfm-link")];
    expect(anchors).not.toHaveLength(0);
    return semanticIR(anchors, mboxInlineKind);
  });
}

function githubFootnoteDefinitionIR(html: string): InlineSemantic[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const definitions = [...document.querySelectorAll<HTMLElement>("section[data-footnotes] li")];
  expect(definitions).not.toHaveLength(0);
  return semanticIR(definitions, githubInlineKind, (element) => !element.matches("a.data-footnote-backref"));
}

function mboxFootnoteDefinitionIR(markdown: string): InlineSemantic[] {
  return withMbox(markdown, (parent) => {
    const definitions = [...parent.querySelectorAll<HTMLElement>(".cm-line.mbox-gfm-footnote")];
    expect(definitions).not.toHaveLength(0);
    return semanticIR(definitions, mboxInlineKind, (element) => !element.matches(".mbox-gfm-footnote-marker"));
  });
}

function semanticIR(
  roots: readonly HTMLElement[],
  kindFor: (element: HTMLElement) => InlineKind | undefined,
  include: (element: HTMLElement) => boolean = () => true,
): InlineSemantic[] {
  const semantics = roots.flatMap((root) => [root, ...root.querySelectorAll<HTMLElement>("*")])
    .filter(include)
    .flatMap((element) => {
      const kind = kindFor(element);
      return kind === undefined ? [] : [{ kind, text: element.textContent ?? "" }];
    });
  expect(semantics).not.toHaveLength(0);
  return semantics;
}

function githubInlineKind(element: HTMLElement): InlineKind | undefined {
  if (element.matches("a")) return "a";
  if (element.matches("em")) return "em";
  if (element.matches("strong")) return "strong";
  if (element.matches("del")) return "del";
  if (element.matches("code")) return "code";
  return undefined;
}

function mboxInlineKind(element: HTMLElement): InlineKind | undefined {
  if (element.matches("a.mbox-gfm-link, .mbox-gfm-link")) return "a";
  if (element.matches("em, .mbox-gfm-em")) return "em";
  if (element.matches("strong, .mbox-gfm-strong")) return "strong";
  if (element.matches("del, .mbox-gfm-del")) return "del";
  if (element.matches("code, .mbox-gfm-code")) return "code";
  return undefined;
}

function withMbox<T>(markdown: string, read: (parent: HTMLElement) => T): T {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc: markdown,
      extensions: [createMboxExtension({ plugins: gfmPlugins() })],
    }),
  });
  document.body.appendChild(parent);
  try {
    return read(parent);
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe("GitHub Markdown API oracle: nested inline rendering", () => {
  it("derives the link-label inline IR from GitHub's fixture", () => {
    const fixture = readFixture("nested-inline-link-label.github.json");

    expect(mboxLinkIR(fixture.markdown)).toEqual(githubLinkIR(fixture.html));
  });

  it("derives the footnote-definition inline IR from GitHub's fixture", () => {
    const fixture = readFixture("footnote-definition-inline.github.json");

    expect(mboxFootnoteDefinitionIR(fixture.markdown)).toEqual(githubFootnoteDefinitionIR(fixture.html));
  });
});
