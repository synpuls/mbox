import type { DecorationCorpusCase } from "../../unit-kit/decoration-conformance.js";

// Adversarial inputs every notation must survive, kept apart from the
// notation corpora so each notation file stays a catalog of its own syntax.
export const commonDecorationCorpus: readonly DecorationCorpusCase[] = [
  { name: "empty document", doc: "" },
  { name: "single newline", doc: "\n" },
  { name: "blank lines only", doc: "\n\n\n" },
  { name: "crlf line endings", doc: "# Title\r\n- item\r\n> quote\r\n" },
  { name: "emoji and surrogate pairs", doc: "😀 👨‍👩‍👧‍👦 text 🎉\n😀 - item [😀]" },
  { name: "zero-width and combining characters", doc: "a​b‌‍c\né *é*" },
  { name: "very long line", doc: "lorem ipsum ".repeat(1500) },
  { name: "many lines", doc: Array.from({ length: 500 }, (_, index) => `line ${index}`).join("\n") },
  { name: "whitespace soup", doc: "  \t 　 \n\t\t\n   " },
  { name: "unterminated syntax fragments", doc: "[unclosed\n**dangling\n`tick\n> \n- [ " },
];
