import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createEditorView } from "../../editor/create-editor.js";
import { createMboxExtension } from "../../editor/plugin.js";
import { gfmPlugins } from "./index.js";
import { gfmMathClassName } from "./math.js";

type MathOccurrence = { kind: "inline" | "block"; display: string; inTableCell: boolean };
type GitHubMarkdownFixture = { source: string; method: string; markdown: string; html: string; fetchedAt: string; githubApiVersion: string | null };

// Resolved from this module, not the process cwd, so a Vitest run started from
// anywhere still finds it. `fileURLToPath` gets the string, not a URL object:
// happy-dom replaces the global URL class, and node rejects its instances with
// "The URL must be of scheme file" even when the href is a perfectly good
// file: URL.
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/gfm/inline-math-display.github.json",
);

function readFixture(): GitHubMarkdownFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as GitHubMarkdownFixture;
}

function githubMathIR(html: string): MathOccurrence[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll<HTMLElement>("math-renderer.js-inline-math, math-renderer.js-display-math")].map((renderer) => ({
    kind: renderer.classList.contains("js-inline-math") ? "inline" : "block",
    display: renderer.style.display,
    inTableCell: renderer.closest("td") !== null,
  }));
}

function mboxMathIR(markdown: string): MathOccurrence[] {
  const parent = document.createElement("div");
  const view = createEditorView({
    parent,
    state: EditorState.create({
      doc: markdown,
      extensions: [
        createMboxExtension({
          plugins: gfmPlugins({
            math: {
              render: (expression) => {
                const element = document.createElement("span");
                element.textContent = expression;
                return element;
              },
            },
          }),
        }),
      ],
    }),
  });
  document.body.appendChild(parent);

  try {
    return [...parent.querySelectorAll<HTMLElement>(`.${gfmMathClassName}`)].map((renderer) => ({
      kind: renderer.classList.contains("mbox-gfm-math-inline") ? "inline" : "block",
      display: getComputedStyle(renderer).display,
      inTableCell: renderer.closest(".mbox-gfm-table-cell") !== null,
    }));
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe("GitHub Markdown API oracle: inline math display", () => {
  it("matches GitHub's fixture-derived math display IR", () => {
    const fixture = readFixture();

    // This committed fixture is GitHub as observed at `fetchedAt`: it catches
    // mbox regressions, but cannot notice a later GitHub change. Detecting
    // upstream changes needs scheduled, authenticated and rate-limit-aware CI
    // plus review of fixture diffs; it is intentionally outside `npm test`.
    // `data-run-id` is a per-request nonce in fixture.html. The IR ignores it
    // (and all unrelated GitHub wrappers), instead reading only math kind and
    // the renderer's inline style display value.
    expect(mboxMathIR(fixture.markdown)).toEqual(githubMathIR(fixture.html));
  });
});
