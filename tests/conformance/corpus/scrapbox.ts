import type { DecorationCorpusCase } from "../../unit-kit/decoration-conformance.js";

export const scrapboxDecorationCorpus: readonly DecorationCorpusCase[] = [
  { name: "plain text", doc: "Page Title\njust plain text" },
  { name: "indent lists", doc: " item\n  child\n\ttab item\n　full-width item" },
  { name: "ordered items", doc: "1. first\n 2. second" },
  { name: "bracket styles", doc: "[* strong] [/ italic] [- strike] [*/ both]\n[[bold]]\n[unclosed" },
  {
    name: "links, icons, and hashtags",
    doc: "[Page] [/proj/Page] #tag [name.icon] [/team/bob.icon] [https://example.com Example]",
  },
  { name: "inline code", doc: "a `code` b\n`a`\n`b`\n`unclosed" },
  { name: "code blocks", doc: "code:hello.js\n console.log(1)\n end\nafter\ncode:x\n `not inline code`" },
  { name: "quotes", doc: "> quoted line\n>bare" },
  { name: "formulas", doc: "[$ x^2 + y^2 ] inline\n$ a\n$ b" },
  { name: "table", doc: "table:t\n a\tb\n c\td\nafter" },
  // The namespace-specific DOM tests pin which parts render. This smallest
  // mixed row keeps the reported Scrapbox table-cell case in the shared corpus.
  { name: "table-cell link, image, and formula", doc: "table:t\n [12345]\t[https://example.com/i.png]\t[$ x^2]" },
];
