import { describe, expect, it } from "vitest";
import { createTestContext } from "../editor/test-context.js";
import { hatenaSuperPreHighlightPlugin, hatenaSuperPreTokenClassName } from "./hatena/super-pre.js";
import { parseHatenaDocument } from "./hatena/parser.js";
import { codeBlockHighlightPlugin, codeBlockHighlightClassNames } from "./mbox/code-block.js";
import { parseMboxDocument } from "./mbox/parser.js";
import { scrapboxCodeBlockClassNames, scrapboxCodeBlockHighlightPlugin } from "./scrapbox/code-block.js";
import { parseScrapboxDocument } from "./scrapbox/parser.js";

describe("code block callers' parser-to-kit contract", () => {
  it("mbox passes horizontal padding and metadata through to the kit", () => {
    const input = '```\t ts title="demo"\nconst x = 1;\n```';
    const [block] = parseMboxDocument(input).blocks;
    expect(block).toMatchObject({ type: "codeBlock", infoValue: '\t ts title="demo"' });

    expect(codeBlockHighlightPlugin().decorations!(createTestContext(input))).toContainEqual(
      expect.objectContaining({
        from: input.indexOf("const"),
        to: input.indexOf("const") + "const".length,
        className: expect.stringContaining(codeBlockHighlightClassNames.token),
      }),
    );
  });

  it("mbox does not reinterpret a vertical tab in the info string as metadata", () => {
    const input = '```ts\vtitle="demo"\nconst x = 1;\n```';
    const [block] = parseMboxDocument(input).blocks;
    expect(block).toMatchObject({ type: "codeBlock", infoValue: 'ts\vtitle="demo"' });

    expect(codeBlockHighlightPlugin().decorations!(createTestContext(input))).not.toContainEqual(
      expect.objectContaining({ className: expect.stringContaining(codeBlockHighlightClassNames.token) }),
    );
  });

  it("hatena passes horizontal padding and metadata in its super-pre language to the kit", () => {
    const input = '>|\t ts title="demo"|\nconst x = 1;\n||<';
    expect(parseHatenaDocument(input).lines[0]).toMatchObject({ superPre: "opener", superPreLang: '\t ts title="demo"' });

    expect(hatenaSuperPreHighlightPlugin().decorations!(createTestContext(input))).toContainEqual({
      from: input.indexOf("const"),
      to: input.indexOf("const") + "const".length,
      className: `${hatenaSuperPreTokenClassName} tok-keyword`,
    });
  });

  it("hatena does not reinterpret a vertical tab in super-pre language as metadata", () => {
    const input = '>|ts\vtitle="demo"|\nconst x = 1;\n||<';
    expect(parseHatenaDocument(input).lines[0]).toMatchObject({ superPre: "opener", superPreLang: 'ts\vtitle="demo"' });

    expect(hatenaSuperPreHighlightPlugin().decorations!(createTestContext(input))).not.toContainEqual(
      expect.objectContaining({ className: expect.stringContaining(hatenaSuperPreTokenClassName) }),
    );
  });

  it("scrapbox preserves a space-containing filename for extension resolution", () => {
    const input = "code: my component.test.tsx \n const x: number = 1;";
    expect(parseScrapboxDocument(input).codeBlocks[0]).toMatchObject({ fileName: " my component.test.tsx " });

    expect(scrapboxCodeBlockHighlightPlugin().decorations!(createTestContext(input))).toContainEqual({
      from: input.indexOf("const"),
      to: input.indexOf("const") + "const".length,
      className: `${scrapboxCodeBlockClassNames.token} tok-keyword`,
    });
  });

  it("parsers remove CRLF terminators before handing code-block values to callers", () => {
    const mboxInput = '```\t ts title="demo"\r\nconst x = 1;\r\n```';
    const [mboxBlock] = parseMboxDocument(mboxInput).blocks;
    expect(mboxBlock).toMatchObject({ type: "codeBlock", infoValue: '\t ts title="demo"' });
    expect(mboxBlock?.type === "codeBlock" && /[\r\n]/.test(mboxBlock.infoValue)).toBe(false);

    const hatenaInput = '>|\t ts title="demo"|\r\nconst x = 1;\r\n||<';
    const hatenaOpener = parseHatenaDocument(hatenaInput).lines[0];
    expect(hatenaOpener).toMatchObject({ superPre: "opener", superPreLang: '\t ts title="demo"' });
    expect(/[\r\n]/.test(hatenaOpener!.superPreLang ?? "")).toBe(false);

    const scrapboxInput = "code: my component.test.tsx \r\n const x: number = 1;";
    const scrapboxBlock = parseScrapboxDocument(scrapboxInput).codeBlocks[0];
    expect(scrapboxBlock).toMatchObject({ fileName: " my component.test.tsx " });
    expect(/[\r\n]/.test(scrapboxBlock!.fileName)).toBe(false);
  });
});
