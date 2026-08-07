import type { DecorationCorpusCase } from "../../unit-kit/decoration-conformance.js";

export const mboxDecorationCorpus: readonly DecorationCorpusCase[] = [
  { name: "headings", doc: "# h1\n## h2\n###### h6\n####### too deep\n#nospace\n# " },
  { name: "nested lists and tasks", doc: "- item\n  - nested\n    - deeper\n- [ ] open\n- [x] done\n- [X] caps\n-\n- " },
  { name: "quotes", doc: "> quote\n> \n>bare\nplain" },
  { name: "fenced code", doc: "```\ncode\n```\n```js\nconst x = 1;\n```\n```\nunclosed" },
  { name: "CRLF fenced code", doc: "```ts\r\nconst x = 1\r\n```" },
  { name: "table", doc: "| a | b |\n| --- | --- |\n| 1 | 2 |" },
  { name: "table with full-width text", doc: "| 日本 | b |\n| --- | --- |\n| a | 1 |" },
  { name: "table with astral text", doc: "| h | h |\n| --- | --- |\n| 😀a | b |" },
  { name: "degenerate table rows", doc: "| |\n| --- |\n|||\n| a\nb |\n| a | b |\n| |" },
  { name: "footnotes", doc: "text[^1] and [^Label]\n[^1]: note text\n[^label]: other" },
  { name: "inline styles", doc: "*em* **strong** ~~strike~~ `code` mixed **un*closed" },
  {
    name: "links, icons, and images",
    doc: "[Page] [name.icon] [team/alice.icon] [Label](https://example.com) ![Alt](image.png) https://example.com",
  },
  { name: "emoji shortcodes", doc: ":smile: text :not emoji :+1:" },
  {
    name: "kitchen sink",
    doc: "# Title\n- [ ] task with [Page] and :smile:\n> quote **strong**\n```\nfence\n```\n| a |\n| - |\n[^1]: note",
  },
];
