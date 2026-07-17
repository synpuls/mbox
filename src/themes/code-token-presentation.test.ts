import { describe, expect, it } from "vitest";
import { codeTokenPresentationThemeSpec } from "./code-token-presentation.js";

describe("codeTokenPresentationThemeSpec", () => {
  it("defines all 24 token classes in the ten overridable colour groups", () => {
    const theme = codeTokenPresentationThemeSpec(["mbox-test-token"]);

    expect(theme).toMatchObject({
      ".mbox-test-token.tok-keyword": { color: "var(--mbox-code-token-keyword-color, #a626a4)" },
      ".mbox-test-token.tok-string, .mbox-test-token.tok-inserted": { color: "var(--mbox-code-token-string-color, #50a14f)" },
      ".mbox-test-token.tok-number, .mbox-test-token.tok-bool, .mbox-test-token.tok-atom, .mbox-test-token.tok-literal": {
        color: "var(--mbox-code-token-literal-color, #986801)",
      },
      ".mbox-test-token.tok-variableName, .mbox-test-token.tok-propertyName": { color: "var(--mbox-code-token-name-color, #005cc5)" },
      ".mbox-test-token.tok-variableName2, .mbox-test-token.tok-labelName, .mbox-test-token.tok-macroName": {
        color: "var(--mbox-code-token-name-alt-color, #4078f2)",
      },
      ".mbox-test-token.tok-typeName, .mbox-test-token.tok-className, .mbox-test-token.tok-namespace": {
        color: "var(--mbox-code-token-type-color, #c18401)",
      },
      ".mbox-test-token.tok-comment, .mbox-test-token.tok-meta": { color: "var(--mbox-code-token-comment-color, #6a737d)" },
      ".mbox-test-token.tok-punctuation, .mbox-test-token.tok-operator": {
        color: "var(--mbox-code-token-punctuation-color, #5c6370)",
      },
      ".mbox-test-token.tok-string2, .mbox-test-token.tok-url, .mbox-test-token.tok-link": {
        color: "var(--mbox-code-token-link-color, #0184bc)",
      },
      ".mbox-test-token.tok-deleted, .mbox-test-token.tok-invalid": { color: "var(--mbox-code-token-invalid-color, #e45649)" },
    });
  });

  it("underlines urls and links, but not string2 tokens", () => {
    const theme = codeTokenPresentationThemeSpec(["mbox-test-token"]);

    expect(theme[".mbox-test-token.tok-url, .mbox-test-token.tok-link"]).toMatchObject({ textDecoration: "underline" });
    expect(theme[".mbox-test-token.tok-string2"]).toBeUndefined();
    expect(theme[".mbox-test-token.tok-string2, .mbox-test-token.tok-url, .mbox-test-token.tok-link"]).not.toHaveProperty(
      "textDecoration",
    );
  });

  it("applies every colour and underline rule to each supplied token class", () => {
    const theme = codeTokenPresentationThemeSpec(["mbox-block-token", "mbox-inline-token"]);

    expect(theme).toEqual({
      ".mbox-block-token.tok-keyword, .mbox-inline-token.tok-keyword": {
        color: "var(--mbox-code-token-keyword-color, #a626a4)",
      },
      ".mbox-block-token.tok-string, .mbox-block-token.tok-inserted, .mbox-inline-token.tok-string, .mbox-inline-token.tok-inserted": {
        color: "var(--mbox-code-token-string-color, #50a14f)",
      },
      ".mbox-block-token.tok-number, .mbox-block-token.tok-bool, .mbox-block-token.tok-atom, .mbox-block-token.tok-literal, .mbox-inline-token.tok-number, .mbox-inline-token.tok-bool, .mbox-inline-token.tok-atom, .mbox-inline-token.tok-literal": {
        color: "var(--mbox-code-token-literal-color, #986801)",
      },
      ".mbox-block-token.tok-variableName, .mbox-block-token.tok-propertyName, .mbox-inline-token.tok-variableName, .mbox-inline-token.tok-propertyName": {
        color: "var(--mbox-code-token-name-color, #005cc5)",
      },
      ".mbox-block-token.tok-variableName2, .mbox-block-token.tok-labelName, .mbox-block-token.tok-macroName, .mbox-inline-token.tok-variableName2, .mbox-inline-token.tok-labelName, .mbox-inline-token.tok-macroName": {
        color: "var(--mbox-code-token-name-alt-color, #4078f2)",
      },
      ".mbox-block-token.tok-typeName, .mbox-block-token.tok-className, .mbox-block-token.tok-namespace, .mbox-inline-token.tok-typeName, .mbox-inline-token.tok-className, .mbox-inline-token.tok-namespace": {
        color: "var(--mbox-code-token-type-color, #c18401)",
      },
      ".mbox-block-token.tok-comment, .mbox-block-token.tok-meta, .mbox-inline-token.tok-comment, .mbox-inline-token.tok-meta": {
        color: "var(--mbox-code-token-comment-color, #6a737d)",
      },
      ".mbox-block-token.tok-punctuation, .mbox-block-token.tok-operator, .mbox-inline-token.tok-punctuation, .mbox-inline-token.tok-operator": {
        color: "var(--mbox-code-token-punctuation-color, #5c6370)",
      },
      ".mbox-block-token.tok-string2, .mbox-block-token.tok-url, .mbox-block-token.tok-link, .mbox-inline-token.tok-string2, .mbox-inline-token.tok-url, .mbox-inline-token.tok-link": {
        color: "var(--mbox-code-token-link-color, #0184bc)",
      },
      ".mbox-block-token.tok-deleted, .mbox-block-token.tok-invalid, .mbox-inline-token.tok-deleted, .mbox-inline-token.tok-invalid": {
        color: "var(--mbox-code-token-invalid-color, #e45649)",
      },
      ".mbox-block-token.tok-url, .mbox-block-token.tok-link, .mbox-inline-token.tok-url, .mbox-inline-token.tok-link": {
        textDecoration: "underline",
      },
    });
  });
});
