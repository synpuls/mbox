import type { DecorationCorpusCase } from "../../unit-kit/decoration-conformance.js";

export const hatenaDecorationCorpus: readonly DecorationCorpusCase[] = [
  { name: "headings", doc: "*重要な見出し\n**sub\n***subsub\n****deep" },
  { name: "named heading anchor", doc: "*name1*名前1" },
  { name: "unordered and ordered lists", doc: "-a\n--b\n---c\n+one\n++nested\n+two" },
  { name: "definition lists", doc: ":はてな:説明文\n:用語:1行目\n::2行目" },
  { name: "nested blockquotes", doc: ">>\nouter\n>>\ninner\n<<\n<<" },
  { name: "pre and super-pre", doc: ">|\npre body\n|<\n>||\n*not a heading\n||<\n>|python|\ncode\n||<" },
  { name: "unclosed super-pre", doc: ">||\nstill inside" },
  { name: "CRLF literal blocks", doc: ">||\r\n|not|a|table|\r\n||<\r\n>|\r\n|not|a|table|\r\n|<" },
  { name: "links", doc: "[http://example.com/]\n[http://example.com/:title=example]\nid:someone" },
  { name: "footnotes", doc: "text((note))((another)) and ((unclosed" },
  { name: "table", doc: "|*head|*head2|\n|a|b|" },
  { name: "table with astral text", doc: "|*h|*h|\n|😀a|b|" },
  { name: "degenerate table rows", doc: "|\n|||\n| a\n|b |\n| a | b |\n| |" },
];
