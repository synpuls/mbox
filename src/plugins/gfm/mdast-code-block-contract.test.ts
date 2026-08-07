import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Code, Root } from "mdast";
import { describe, expect, it } from "vitest";

function parseMdast(input: string): Root {
  return fromMarkdown(input, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

describe("mdast fenced-code contract relied on by the GFM adapter", () => {
  it("strips container prefixes and fence indentation from a closed fence value", () => {
    const input = ">   ```ts title=\"example\"\n>   const a = 1;\n>   \n>   ```";
    const tree = parseMdast(input);
    const code = (tree.children[0] as { children: Code[] }).children[0]!;

    expect(code).toMatchObject({
      type: "code",
      lang: "ts",
      meta: "title=\"example\"",
      value: "const a = 1;\n",
    });
    // mdast positions the code node at the fence itself, after `>   `, not at
    // the physical line start. The adapter relies on this to preserve prefixes.
    expect(code.position?.start.offset).toBe(input.indexOf("```ts"));
    expect(code.position?.start.line).toBe(1);
    expect(code.position?.end.line).toBe(4);
    expect(code.value.split("\n")).toHaveLength(2);
  });

  it("omits the physical newline before a closing fence from value", () => {
    const [code] = parseMdast("```\nconst a = 1;\n```").children as Code[];

    expect(code.value).toBe("const a = 1;");
  });

  it("keeps every content line through the end of an unclosed fence", () => {
    const [code] = parseMdast("```\nconst a = 1;\n\nconst b = 2;").children as Code[];

    expect(code.value).toBe("const a = 1;\n\nconst b = 2;");
  });

  it("represents a closed empty block as a string with no value lines", () => {
    const input = "```\n```";
    const [code] = parseMdast(input).children as Code[];

    expect(typeof code.value).toBe("string");
    expect(code.value).toBe("");
    expect(code.position).toMatchObject({
      start: { line: 1, offset: 0 },
      end: { line: 2, offset: input.length },
    });
  });

  it("excludes only a valid closing-fence line from value", () => {
    const [closed] = parseMdast("```\nconst a = 1;\n```").children as Code[];
    const [unclosed] = parseMdast("```\nconst a = 1;\n``` not a close").children as Code[];

    expect(closed.value).toBe("const a = 1;");
    expect(unclosed.value).toBe("const a = 1;\n``` not a close");
    expect(unclosed.position?.end.line).toBe(3);
    expect(unclosed.value.split("\n")).toHaveLength(2);
  });
});
