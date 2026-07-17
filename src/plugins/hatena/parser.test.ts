import { describe, expect, it } from "vitest";
import { parseHatenaDocument } from "./parser.js";

describe("parseHatenaDocument headings", () => {
  it("parses *, **, *** as h3/h4/h5 with the star run as the marker", () => {
    const doc = parseHatenaDocument("*a\n**b\n***c");
    expect(doc.lines[0].heading).toEqual({ marker: { from: 0, to: 1 }, level: 3, name: null });
    expect(doc.lines[1].heading).toEqual({ marker: { from: 3, to: 5 }, level: 4, name: null });
    expect(doc.lines[2].heading).toEqual({ marker: { from: 7, to: 10 }, level: 5, name: null });
  });

  it("caps the heading level at h5 but keeps the whole star run as the marker", () => {
    const doc = parseHatenaDocument("****deep");
    expect(doc.lines[0].heading).toEqual({ marker: { from: 0, to: 4 }, level: 5, name: null });
  });

  it("consumes a name attribute (`*name*text`) into the marker, leaving the text", () => {
    // Real Hatena renders `*name1*名前1` as <h3 id=name1>名前1</h3>; hide `*name1*`.
    const doc = parseHatenaDocument("*name1*名前1");
    expect(doc.lines[0].heading).toEqual({ marker: { from: 0, to: 7 }, level: 3, name: "name1" });
  });

  it("only treats an ASCII word + `*` as a name — Japanese heading text is untouched", () => {
    const doc = parseHatenaDocument("*重要な見出し");
    expect(doc.lines[0].heading).toEqual({ marker: { from: 0, to: 1 }, level: 3, name: null });
  });

  it("does not treat a plain line as a heading", () => {
    expect(parseHatenaDocument("plain").lines[0].heading).toBeNull();
  });
});

describe("parseHatenaDocument lists", () => {
  it("parses -, -- as depth 1 and 2, marker covers the hyphens and one trailing space", () => {
    const doc = parseHatenaDocument("-a\n-- b");
    expect(doc.lines[0].list).toEqual({ marker: { from: 0, to: 1 }, depth: 1, ordered: false, ordinal: null });
    expect(doc.lines[1].list).toEqual({ marker: { from: 3, to: 6 }, depth: 2, ordered: false, ordinal: null });
  });

  it("treats + / ++ as ordered lists (real Hatena renders <ol>) and numbers them", () => {
    const doc = parseHatenaDocument("+a\n+b\n+c");
    expect(doc.lines[0].list).toMatchObject({ depth: 1, ordered: true, ordinal: 1 });
    expect(doc.lines[1].list).toMatchObject({ ordered: true, ordinal: 2 });
    expect(doc.lines[2].list).toMatchObject({ ordered: true, ordinal: 3 });
  });

  it("numbers a nested ordered sublist independently and continues the outer run after it", () => {
    const doc = parseHatenaDocument("+a\n++x\n++y\n+b");
    expect(doc.lines[0].list).toMatchObject({ depth: 1, ordinal: 1 });
    expect(doc.lines[1].list).toMatchObject({ depth: 2, ordinal: 1 });
    expect(doc.lines[2].list).toMatchObject({ depth: 2, ordinal: 2 });
    expect(doc.lines[3].list).toMatchObject({ depth: 1, ordinal: 2 });
  });

  it("restarts numbering after the list block is broken by a non-list line", () => {
    const doc = parseHatenaDocument("+a\n+b\nplain\n+c");
    expect(doc.lines[1].list).toMatchObject({ ordinal: 2 });
    expect(doc.lines[3].list).toMatchObject({ ordinal: 1 });
  });

  it("does not treat a plain line as a list", () => {
    expect(parseHatenaDocument("plain").lines[0].list).toBeNull();
  });
});

describe("parseHatenaDocument definition lists", () => {
  it("parses `:用語:説明` into a leading marker, a term range and a separator", () => {
    const doc = parseHatenaDocument(":はてな:説明文");
    expect(doc.lines[0].definition).toEqual({
      continuation: false,
      marker: { from: 0, to: 1 },
      term: { from: 1, to: 4 },
      separator: { from: 4, to: 5 },
    });
  });

  it("parses `::継続` as a continuation dd with no term", () => {
    const doc = parseHatenaDocument(":用語:1行目\n::2行目");
    expect(doc.lines[1].definition).toEqual({
      continuation: true,
      marker: { from: 8, to: 10 },
      term: null,
      separator: null,
    });
  });

  it("does not treat a plain line or an id link as a definition", () => {
    expect(parseHatenaDocument("plain").lines[0].definition).toBeNull();
    expect(parseHatenaDocument("see id:hatena here").lines[0].definition).toBeNull();
  });
});

describe("parseHatenaDocument footnotes", () => {
  it("preserves Hatena footnote marker and content boundaries for edge cases", () => {
    const cases = [
      { source: "((a))", marker: "((a))", content: "a" },
      { source: "((()))", marker: "((())", content: "(" },
      { source: "(()))", marker: "(()))", content: ")" },
      { source: "(())", marker: null, content: null },
      { source: "(((a))", marker: "(((a))", content: "(a" },
      { source: "((a))b((c))", marker: "((a))|((c))", content: "a|c" },
    ];

    for (const { source, marker, content } of cases) {
      const footnotes = parseHatenaDocument(source).lines[0].footnotes;
      expect(footnotes.map((footnote) => source.slice(footnote.marker.from, footnote.marker.to)).join("|")).toBe(marker ?? "");
      expect(footnotes.map((footnote) => source.slice(footnote.content.from, footnote.content.to)).join("|")).toBe(content ?? "");
      expect(footnotes.map((footnote) => footnote.text).join("|")).toBe(content ?? "");
    }
  });

  it("uses absolute ranges for footnotes after earlier lines", () => {
    const doc = parseHatenaDocument("prefix\nA((note))B");
    expect(doc.lines[1].footnotes).toEqual([
      { marker: { from: 8, to: 16 }, content: { from: 10, to: 14 }, text: "note", number: 1 },
    ]);
  });

  it(
    "finishes parsing many unclosed footnote openers without collecting footnotes",
    () => {
      // Quadratic scanning would take minutes on this input; a linear scan is
      // instant. The tight test timeout catches a regression without depending
      // on an absolute millisecond budget that flakes on a loaded CI machine.
      const doc = parseHatenaDocument("((".repeat(200_000));
      expect(doc.lines[0].footnotes).toEqual([]);
    },
    1000,
  );

  it("collects `(( ))` footnotes with content ranges and document-order numbers", () => {
    const doc = parseHatenaDocument("A((一))B((二))");
    expect(doc.lines[0].footnotes).toEqual([
      { marker: { from: 1, to: 6 }, content: { from: 3, to: 4 }, text: "一", number: 1 },
      { marker: { from: 7, to: 12 }, content: { from: 9, to: 10 }, text: "二", number: 2 },
    ]);
  });

  it("numbers footnotes sequentially across lines", () => {
    const doc = parseHatenaDocument("x((a))\ny((b))");
    expect(doc.lines[0].footnotes[0].number).toBe(1);
    expect(doc.lines[1].footnotes[0].number).toBe(2);
  });

  it("does not collect footnotes inside a super-pre block", () => {
    const doc = parseHatenaDocument(">||\ntext((not a note))\n||<");
    expect(doc.lines[1].footnotes).toEqual([]);
  });
});

describe("parseHatenaDocument super-pre", () => {
  it("groups >|| ... ||< and marks inner lines literal (no heading/list/link parse)", () => {
    const doc = parseHatenaDocument(">||\n*not a heading\n-not a list\n||<");
    expect(doc.lines.map((line) => line.superPre)).toEqual(["opener", "body", "body", "closer"]);
    // Inner lines are literal: no heading / list / links are produced for them.
    expect(doc.lines[1].heading).toBeNull();
    expect(doc.lines[2].list).toBeNull();
  });

  it("leaves an unclosed super-pre running to the end of the document", () => {
    const doc = parseHatenaDocument(">||\nstill inside");
    expect(doc.lines.map((line) => line.superPre)).toEqual(["opener", "body"]);
  });

  it("captures the language of a `>|lang|` opener and treats `>||` as language-less", () => {
    const withLang = parseHatenaDocument(">|python|\ncode\n||<");
    expect(withLang.lines.map((line) => line.superPre)).toEqual(["opener", "body", "closer"]);
    expect(withLang.lines[0].superPreLang).toBe("python");

    const plain = parseHatenaDocument(">||\ncode\n||<");
    expect(plain.lines[0].superPreLang).toBeNull();
  });
});

describe("parseHatenaDocument plain pre", () => {
  it("groups `>| ... |<` as a literal pre block", () => {
    const doc = parseHatenaDocument(">|\n*not a heading\n|<");
    expect(doc.lines.map((line) => line.pre)).toEqual(["opener", "body", "closer"]);
    expect(doc.lines[1].heading).toBeNull();
    expect(doc.lines.map((line) => line.superPre)).toEqual([null, null, null]);
  });

  it("keeps `>||` literal when it sits inside a plain pre block", () => {
    const doc = parseHatenaDocument(">|\n>||\n|<");
    expect(doc.lines.map((line) => line.pre)).toEqual(["opener", "body", "closer"]);
    expect(doc.lines.map((line) => line.superPre)).toEqual([null, null, null]);
  });

  it("keeps `>|` literal when it sits inside a super-pre block", () => {
    const doc = parseHatenaDocument(">||\n>|\n||<");
    expect(doc.lines.map((line) => line.superPre)).toEqual(["opener", "body", "closer"]);
    expect(doc.lines.map((line) => line.pre)).toEqual([null, null, null]);
  });
});

describe("parseHatenaDocument blockquote depth", () => {
  it("tracks nested >> ... << as per-line depth", () => {
    const doc = parseHatenaDocument(">>\nouter\n>>\ninner\n<<\n<<");
    expect(doc.lines.map((line) => line.quote?.depth ?? 0)).toEqual([1, 1, 2, 2, 2, 1]);
    expect(doc.lines.map((line) => line.quote?.role ?? null)).toEqual([
      "open",
      "content",
      "open",
      "content",
      "close",
      "close",
    ]);
  });

  it("recognises a `>URL>` cite opener and captures the source URL", () => {
    const doc = parseHatenaDocument(">http://example.com/>\nquoted\n<<");
    expect(doc.lines[0].quote).toMatchObject({ depth: 1, role: "open", cite: "http://example.com/" });
    expect(doc.lines[1].quote).toMatchObject({ role: "content", cite: null });
  });

  it("leaves a plain `>>` opener without a cite", () => {
    const doc = parseHatenaDocument(">>\nq\n<<");
    expect(doc.lines[0].quote?.cite).toBeNull();
  });

  it("ignores >> and << that live inside a super-pre block", () => {
    const doc = parseHatenaDocument(">||\n>>\n||<");
    expect(doc.lines[1].quote).toBeNull();
  });

  it("does not confuse >|| with a blockquote opener", () => {
    const doc = parseHatenaDocument(">||\n||<");
    expect(doc.lines[0].quote).toBeNull();
  });
});

describe("parseHatenaDocument tables", () => {
  it("parses a 3-row table with per-cell header flags, content offsets and line numbers", () => {
    const doc = parseHatenaDocument("|*名前|*色|*個数|\n|りんご|赤|1|\n|みかん|だいだい|2|");
    expect(doc.tables).toHaveLength(1);
    const table = doc.tables[0];
    expect(table.line).toBe(1);
    expect(table.rows).toHaveLength(3);
    expect(table.rows.map((row) => row.line)).toEqual([1, 2, 3]);

    // Header row: every cell is a header; the leading `*` is the marker and is
    // excluded from the displayed content.
    const header = table.rows[0];
    expect(header.cells.map((cell) => cell.header)).toEqual([true, true, true]);
    expect(header.cells.map((cell) => cell.value)).toEqual(["名前", "色", "個数"]);
    // `|*名前|` — pipe at 0, cell span 1..4, `*` marker at 1..2, content 2..4.
    expect(header.cells[0]).toMatchObject({
      from: 1,
      to: 4,
      header: true,
      marker: { from: 1, to: 2 },
      content: { from: 2, to: 4 },
    });

    // Body rows: no header cells, `*` stripping does not apply.
    const body = table.rows[1];
    expect(body.cells.map((cell) => cell.header)).toEqual([false, false, false]);
    expect(body.cells.map((cell) => cell.value)).toEqual(["りんご", "赤", "1"]);
    expect(body.cells[0].marker).toBeNull();
  });

  it("does not parse a `|...|` line inside a super-pre block as a table", () => {
    const doc = parseHatenaDocument(">||\n|not|a|table|\n||<");
    expect(doc.tables).toEqual([]);
    expect(doc.lines[1].superPre).toBe("body");
  });

  it("parses a single `|a|b|` line as a one-row table", () => {
    const doc = parseHatenaDocument("|a|b|");
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0].rows).toHaveLength(1);
    expect(doc.tables[0].rows[0].cells.map((cell) => cell.value)).toEqual(["a", "b"]);
  });

  it("splits two consecutive tables broken by a blank line", () => {
    const doc = parseHatenaDocument("|a|\n\n|b|");
    expect(doc.tables).toHaveLength(2);
    expect(doc.tables[0].line).toBe(1);
    expect(doc.tables[1].line).toBe(3);
  });
});

describe("parseHatenaDocument inline links", () => {
  it("parses a bracket link with a custom title", () => {
    const doc = parseHatenaDocument("see [http://example.com/:title=foo] end");
    expect(doc.lines[0].links).toMatchObject([
      { kind: "bracket", href: "http://example.com/", label: "foo", from: 4, to: 35 },
    ]);
  });

  it("parses a bracket link without a title, using the URL as the label", () => {
    const doc = parseHatenaDocument("[http://example.com/]");
    expect(doc.lines[0].links).toMatchObject([{ kind: "bracket", href: "http://example.com/", label: "http://example.com/" }]);
  });

  it("does not recognize a bracket link whose URL contains an opening bracket", () => {
    const doc = parseHatenaDocument("[http://example.invalid/a[b]]");

    expect(doc.lines[0].links.some((link) => link.kind === "bracket")).toBe(false);
  });

  it("handles repeated unclosed bracket URLs without bracket links", () => {
    // No spaces and no closing "]": every "[" is a fresh candidate whose URL
    // run stops only at the next "[". The pre-fix regex (which swallowed "[")
    // rescanned to the end from each one — ~8.7s at this size — while the
    // fixed regex stops at the first "[" and finishes in ~1ms.
    const doc = parseHatenaDocument("[https://x".repeat(40_000));

    expect(doc.lines[0].links.some((link) => link.kind === "bracket")).toBe(false);
  }, 5_000);

  it("parses a bare URL but not one already inside a bracket link", () => {
    const doc = parseHatenaDocument("go http://a.example/ and [http://b.example/]");
    expect(doc.lines[0].links.map((link) => link.kind)).toEqual(["url", "bracket"]);
    expect(doc.lines[0].links[0]).toMatchObject({ href: "http://a.example/", label: "http://a.example/" });
  });

  it("keeps bracket, bare URL, and id links distinct at bracket boundaries", () => {
    const input = "[http://inside.example/:title=inside] id:outside http://after.example/ [http://id.example/id:inside]";
    const doc = parseHatenaDocument(input);

    expect(doc.lines[0].links).toEqual([
      { kind: "bracket", href: "http://inside.example/", label: "inside", from: 0, to: 37 },
      { kind: "id", href: "outside", label: "id:outside", from: 38, to: 48 },
      { kind: "url", href: "http://after.example/", label: "http://after.example/", from: 49, to: 70 },
      { kind: "bracket", href: "http://id.example/id:inside", label: "http://id.example/id:inside", from: 71, to: 100 },
    ]);
  });

  it("uses absolute offsets for links on later lines", () => {
    const doc = parseHatenaDocument("first\n[http://bracket.example/] http://bare.example/ id:user");

    expect(doc.lines[1].links).toEqual([
      { kind: "bracket", href: "http://bracket.example/", label: "http://bracket.example/", from: 6, to: 31 },
      { kind: "url", href: "http://bare.example/", label: "http://bare.example/", from: 32, to: 52 },
      { kind: "id", href: "user", label: "id:user", from: 53, to: 60 },
    ]);
  });

  it("handles lines with no bracket links or no bare/id links", () => {
    const doc = parseHatenaDocument("http://bare.example/ id:user\n[http://bracket.example/]");

    expect(doc.lines[0].links.map(({ kind, href, label, from, to }) => ({ kind, href, label, from, to }))).toEqual([
      { kind: "url", href: "http://bare.example/", label: "http://bare.example/", from: 0, to: 20 },
      { kind: "id", href: "user", label: "id:user", from: 21, to: 28 },
    ]);
    expect(doc.lines[1].links).toEqual([
      { kind: "bracket", href: "http://bracket.example/", label: "http://bracket.example/", from: 29, to: 54 },
    ]);
  });

  it("parses many bare URLs after bracket links in linear time", () => {
    const count = 64_000;
    const doc = parseHatenaDocument("[http://a] ".repeat(count) + "http://b ".repeat(count));

    expect(doc.lines[0].links).toHaveLength(count * 2);
  }, 1_000);

  it("parses many id links after bracket links in linear time", () => {
    const count = 64_000;
    const doc = parseHatenaDocument("[http://a] ".repeat(count) + "id:name ".repeat(count));

    expect(doc.lines[0].links).toHaveLength(count * 2);
  }, 1_000);

  it("matches the previous range predicate at half-open boundaries", () => {
    let seed = 0x5eed1234;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    for (let trial = 0; trial < 200; trial += 1) {
      const ranges: { from: number; to: number }[] = [];
      let offset = random() % 5;
      for (let index = 0; index < 200; index += 1) {
        offset += 1 + (random() % 5);
        const from = offset;
        const to = from + 1 + (random() % 10);
        ranges.push({ from, to });
        offset = to;
      }
      const positions = [
        ...ranges.flatMap(({ from, to }) => [from, to - 1, to]),
        ...Array.from({ length: 400 }, () => random() % (offset + 10)),
      ].sort((a, b) => a - b);
      let rangeIndex = 0;

      for (const position of positions) {
        const previous = ranges.some((range) => position >= range.from && position < range.to);
        while (ranges[rangeIndex]?.to <= position) {
          rangeIndex += 1;
        }
        const range = ranges[rangeIndex];
        const current = range !== undefined && position >= range.from && position < range.to;

        expect(current).toBe(previous);
      }
    }
  });

  it("parses id:username exposing the raw username, leaving /path resolution to the plugin", () => {
    const doc = parseHatenaDocument("hi id:bob");
    expect(doc.lines[0].links).toMatchObject([{ kind: "id", href: "bob", label: "id:bob", from: 3, to: 9 }]);
  });

  it("does not parse links inside a super-pre body", () => {
    const doc = parseHatenaDocument(">||\n[http://example.com/]\n||<");
    expect(doc.lines[1].links).toEqual([]);
  });
});
