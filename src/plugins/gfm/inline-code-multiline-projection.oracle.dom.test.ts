import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { describe, expect, it } from "vitest";
import { projectGfmInlineCodeDisplay } from "./parser.js";

type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/gfm/inline-code-multiline-projection.github.json",
);

function readFixture(): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GitHubMarkdownFixture;
}

function githubParagraphCodeSpanText(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const paragraphs = [...document.querySelectorAll("p")];
  expect(paragraphs).not.toHaveLength(0);
  const codeText = paragraphs.flatMap((paragraph) => [...paragraph.querySelectorAll("code")].map((code) => code.textContent ?? ""));
  expect(codeText).not.toHaveLength(0);
  return codeText;
}

function projectedParagraphCodeSpanText(markdown: string): string[] {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const paragraphs = tree.children.filter((node) => node.type === "paragraph");
  expect(paragraphs).not.toHaveLength(0);
  const codeValues = paragraphs.flatMap((paragraph) =>
    paragraph.children
      .filter((node) => node.type === "inlineCode")
      .map((node) => projectGfmInlineCodeDisplay(node.value)),
  );
  expect(codeValues).not.toHaveLength(0);
  return codeValues;
}

describe("GitHub Markdown API oracle: multiline inline-code display projection", () => {
  it("derives paragraph code-span display text from GitHub's fixture", () => {
    const fixture = readFixture();

    expect(projectedParagraphCodeSpanText(fixture.markdown)).toEqual(githubParagraphCodeSpanText(fixture.html));
  });
});
