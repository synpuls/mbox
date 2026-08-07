import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";
import { parseGfmDocument } from "./parser.js";

type CodeContext = "paragraph" | "link" | "tableCell" | "footnote";
type CodeSpan = { context: CodeContext; text: string };
type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/gfm/inline-code-padding.github.json",
);

function readFixture(): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GitHubMarkdownFixture;
}

function githubCodeSpanIR(html: string): CodeSpan[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const roots = {
    paragraph: document.querySelectorAll("p"),
    link: document.querySelectorAll("a"),
    tableCell: document.querySelectorAll("th, td"),
    footnote: document.querySelectorAll("section[data-footnotes] li"),
  };
  for (const context of Object.keys(roots) as CodeContext[]) expect(roots[context]).not.toHaveLength(0);
  const spans = [...document.querySelectorAll<HTMLElement>("code")].map((code) => ({
    context: githubCodeContext(code),
    text: code.textContent ?? "",
  }));
  expect(spans).not.toHaveLength(0);
  return spans;
}

function githubCodeContext(code: HTMLElement): CodeContext {
  if (code.closest("section[data-footnotes] li")) return "footnote";
  if (code.closest("a")) return "link";
  if (code.closest("th, td")) return "tableCell";
  return "paragraph";
}

function mboxCodeSpanIR(markdown: string): CodeSpan[] {
  return withMbox(markdown, (parent) => {
    const roots = {
      paragraph: parent.querySelectorAll(".cm-line"),
      link: parent.querySelectorAll("a.mbox-gfm-link"),
      tableCell: parent.querySelectorAll(".mbox-gfm-table-cell"),
      footnote: parent.querySelectorAll(".cm-line.mbox-gfm-footnote"),
    };
    for (const context of Object.keys(roots) as CodeContext[]) expect(roots[context]).not.toHaveLength(0);

    const codeDocument = parseGfmDocument(markdown);
    const tableCodeRanges = tableCodeRangesFor(codeDocument);
    const sourceCodes = [
      ...codeDocument.inlineCodes
        .filter((code) => !tableCodeRanges.some((range) => range.from === code.open.from && range.to === code.close.to))
        .map((code) => ({ from: code.open.from })),
      ...linkCodeOffsets(codeDocument),
    ].sort((left, right) => left.from - right.from);
    const codeElements = [...parent.querySelectorAll<HTMLElement>("code.mbox-gfm-code")]
      .filter((code) => code.closest(".mbox-gfm-table-cell") === null)
    expect(codeElements).toHaveLength(sourceCodes.length);
    const inlineSpans = codeElements.map((code, index) => ({
      from: sourceCodes[index]!.from,
      context: mboxCodeContext(code),
      text: code.textContent ?? "",
    }));
    const tableSpans = mboxTableCodeSpanIR(codeDocument);
    const spans = [...inlineSpans, ...tableSpans]
      .sort((left, right) => left.from - right.from)
      .map(({ context, text }) => ({ context, text }));
    expect(spans).not.toHaveLength(0);
    return spans;
  });
}

function mboxCodeContext(code: HTMLElement): Exclude<CodeContext, "tableCell"> {
  if (code.closest(".cm-line.mbox-gfm-footnote")) return "footnote";
  if (code.closest("a.mbox-gfm-link")) return "link";
  return "paragraph";
}

function mboxTableCodeSpanIR(document: ReturnType<typeof parseGfmDocument>): Array<CodeSpan & { from: number }> {
  return document.tables.flatMap((table) =>
    [table.header, ...table.rows].flatMap((row) =>
      row.cells.flatMap((cell) =>
        document.inlineCodes.some((code) => code.open.from >= cell.content.from && code.close.to <= cell.content.to)
          ? [{ from: cell.content.from, context: "tableCell" as const, text: cell.displayValue ?? cell.value.trim() }]
          : [],
      ),
    ),
  );
}

function tableCodeRangesFor(document: ReturnType<typeof parseGfmDocument>) {
  return document.tables.flatMap((table) =>
    [table.header, ...table.rows].flatMap((row) =>
      row.cells.flatMap((cell) => document.inlineCodes
        .filter((code) => code.open.from >= cell.content.from && code.close.to <= cell.content.to)
        .map((code) => ({ from: code.open.from, to: code.close.to }))),
    ),
  );
}

function linkCodeOffsets(document: ReturnType<typeof parseGfmDocument>): Array<{ from: number }> {
  const offsets: Array<{ from: number }> = [];
  const visit = (nodes: readonly (typeof document.links)[number]["label"][number][], labelFrom: number): void => {
    for (const node of nodes) {
      if (node.kind === "inlineCode") {
        offsets.push({ from: labelFrom + node.content.from });
      } else if (node.kind === "emphasis" || node.kind === "strong" || node.kind === "delete") {
        visit(node.children, labelFrom);
      }
    }
  };
  for (const link of document.links) visit(link.label, link.textFrom);
  return offsets;
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

describe("GitHub Markdown API oracle: inline-code padding", () => {
  it("derives document-order code-span context and text from GitHub's fixture", () => {
    const fixture = readFixture();

    expect(mboxCodeSpanIR(fixture.markdown)).toEqual(githubCodeSpanIR(fixture.html));
  });
});
