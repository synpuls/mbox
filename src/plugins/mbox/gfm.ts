import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

// Kept exported as a documented future experiment: a GFM (mdast) parse path we
// may adopt for the mbox notation. Not re-exported from src/index.ts and not yet
// wired into any plugin — only its own test exercises it for now.
export function parseGfmMarkdown(input: string) {
  return fromMarkdown(input, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}
