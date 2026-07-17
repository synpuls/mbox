import type { MboxThemeSpec } from "../editor/plugin.js";

interface CodeTokenPresentationGroup {
  tokenNames: readonly string[];
  variableName: string;
  defaultColor: string;
}

const codeTokenPresentationGroups: readonly CodeTokenPresentationGroup[] = [
  { tokenNames: ["keyword"], variableName: "keyword", defaultColor: "#a626a4" },
  { tokenNames: ["string", "inserted"], variableName: "string", defaultColor: "#50a14f" },
  { tokenNames: ["number", "bool", "atom", "literal"], variableName: "literal", defaultColor: "#986801" },
  { tokenNames: ["variableName", "propertyName"], variableName: "name", defaultColor: "#005cc5" },
  { tokenNames: ["variableName2", "labelName", "macroName"], variableName: "name-alt", defaultColor: "#4078f2" },
  { tokenNames: ["typeName", "className", "namespace"], variableName: "type", defaultColor: "#c18401" },
  { tokenNames: ["comment", "meta"], variableName: "comment", defaultColor: "#6a737d" },
  { tokenNames: ["punctuation", "operator"], variableName: "punctuation", defaultColor: "#5c6370" },
  { tokenNames: ["string2", "url", "link"], variableName: "link", defaultColor: "#0184bc" },
  { tokenNames: ["deleted", "invalid"], variableName: "invalid", defaultColor: "#e45649" },
];

function selectors(tokenClassNames: readonly string[], tokenNames: readonly string[]): string {
  return tokenClassNames.flatMap((className) => tokenNames.map((tokenName) => `.${className}.tok-${tokenName}`)).join(", ");
}

/**
 * Builds code token colours that apply only in an opt-in presentation theme;
 * highlighting plugins deliberately do not apply this palette themselves.
 */
export function codeTokenPresentationThemeSpec(tokenClassNames: readonly string[]): MboxThemeSpec {
  const theme: MboxThemeSpec = {};

  for (const group of codeTokenPresentationGroups) {
    theme[selectors(tokenClassNames, group.tokenNames)] = {
      color: `var(--mbox-code-token-${group.variableName}-color, ${group.defaultColor})`,
    };
  }

  theme[selectors(tokenClassNames, ["url", "link"])] = { textDecoration: "underline" };
  return theme;
}
