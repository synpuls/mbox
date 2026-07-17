import type { DecorationCorpusCase } from "../../unit-kit/decoration-conformance.js";

export const gfmDecorationCorpus: readonly DecorationCorpusCase[] = [
  { name: "atx and setext headings", doc: "# h1\n## h2\nSetext\n===\nAlt\n---" },
  { name: "bullet and ordered lists", doc: "- a\n  - b\n1. first\n2. second\n* star\n+ plus" },
  { name: "task lists", doc: "- [ ] open\n- [x] done\n  - [ ] nested" },
  { name: "blockquotes with laziness", doc: "> quote\n>> deep\nlazy continuation\n\n> " },
  { name: "fenced and indented code", doc: "```ts\nconst a = 1;\n```\n\n    indented code\n~~~\ntilde fence\n~~~" },
  { name: "pipe table with alignment", doc: "| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |" },
  { name: "degenerate pipe table rows", doc: "| |\n| --- |\n|||\n| a\nb |\n| a | b |\n| |" },
  { name: "inline styles and escapes", doc: "*em* **strong** ~~strike~~ `code` \\*escaped\\*" },
  {
    name: "links, autolinks, and images",
    doc: "[t](https://e.com) <https://e.com> www.example.com https://bare.example ![alt](i.png)",
  },
  { name: "footnotes", doc: "ref[^1]\n\n[^1]: the note" },
  { name: "thematic and hard breaks", doc: "---\n***\n___\nline\\\nbreak  \nend" },
];
