import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";

type TableCell = { kind: "th" | "td"; text: string };
type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/gfm/table-cells.github.json",
);

function readFixture(): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GitHubMarkdownFixture;
}

function githubTableCellIR(html: string): TableCell[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const headerRoots = [...document.querySelectorAll<HTMLElement>("thead")];
  const bodyRoots = [...document.querySelectorAll<HTMLElement>("tbody")];
  expect(headerRoots).not.toHaveLength(0);
  expect(bodyRoots).not.toHaveLength(0);

  const cells = [...document.querySelectorAll<HTMLElement>("thead th, tbody tr > td")].map((cell) => ({
    kind: cell.tagName.toLowerCase() as TableCell["kind"],
    text: cell.textContent ?? "",
  }));
  expect(cells).not.toHaveLength(0);
  return cells;
}

function mboxTableCellIR(markdown: string): TableCell[] {
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
    const headerRoots = [...parent.querySelectorAll<HTMLElement>(".mbox-gfm-table-header")];
    const bodyRoots = [...parent.querySelectorAll<HTMLElement>(".mbox-gfm-table-row")];
    expect(headerRoots).not.toHaveLength(0);
    expect(bodyRoots).not.toHaveLength(0);

    const cells = [
      ...headerRoots.flatMap((root) =>
        [...root.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")].map((cell) => ({
          kind: "th" as const,
          text: cell.textContent ?? "",
        })),
      ),
      ...bodyRoots.flatMap((root) =>
        [...root.querySelectorAll<HTMLElement>(".mbox-gfm-table-cell")].map((cell) => ({
          kind: "td" as const,
          text: cell.textContent ?? "",
        })),
      ),
    ];
    expect(cells).not.toHaveLength(0);
    return cells;
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe("GitHub Markdown API oracle: table cells", () => {
  it("derives document-order header and body cell text from GitHub's fixture", () => {
    const fixture = readFixture();

    expect(mboxTableCellIR(fixture.markdown)).toEqual(githubTableCellIR(fixture.html));
  });
});
