/**
 * Finds pipe-table separators at the offsets understood by JavaScript string
 * slicing and CodeMirror decorations: UTF-16 code units. This small scanner
 * exists because `[...text]` produces code points, so its `index` values drift
 * after every non-BMP character when used as UTF-16 offsets. That does not
 * merely choose a wrong cell boundary: it can leave a separator pipe in the
 * cell value or split a surrogate pair while slicing/decorating the row.
 *
 * Only pipe positions are shared. Each notation still decides its own cell
 * boundaries and leading/trailing-pipe policy; Hatena also owns its leading
 * `*` header marker. Keeping those rules in their namespaces prevents GFM
 * grammar from leaking into mbox or Hatena. The GFM, mbox, and Hatena parsers
 * use this helper. Scrapbox tables are tab-separated, so they intentionally do
 * not.
 *
 * This is internal parser infrastructure, not part of the public API.
 */
export function findPipeOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < text.length; offset += 1) {
    if (text[offset] === "|") {
      offsets.push(offset);
    }
  }
  return offsets;
}
