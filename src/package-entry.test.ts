import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { codeBlockHighlightPlugin, createEditorState, mboxPlugins, parseMboxDocument } from "mbox";

describe("package entry", () => {
  it("exports the public API through the package name", () => {
    expect(createEditorState({ doc: "hello" }).doc.toString()).toBe("hello");
    expect(mboxPlugins()).toHaveLength(16);
    expect(mboxPlugins({ codeHighlight: true })).toHaveLength(17);
    expect(codeBlockHighlightPlugin().decorations).toBeTypeOf("function");
    expect(parseMboxDocument("# hello").blocks[0]?.type).toBe("heading");
  });

  it("points package exports at the built library output", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.name).toBe("@synpuls/mbox");
    expect(packageJson.description).toContain("CodeMirror 6");
    expect(packageJson.type).toBe("module");
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.module).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
    expect(packageJson.files).toEqual(["dist", "README.md", "LICENSE", "docs/guide.md"]);
  });
});
