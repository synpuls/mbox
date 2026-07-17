import { describe, expect, it } from "vitest";
import { hatenaHeadingClassNames } from "../plugins/hatena/heading.js";
import { hatenaLinkClassName } from "../plugins/hatena/link.js";
import { hatenaPreClassName } from "../plugins/hatena/pre.js";
import { hatenaSuperPreClassName, hatenaSuperPreLangClassName } from "../plugins/hatena/super-pre.js";
import { hatenaDefaultPresentationThemeSpec } from "./hatena-presentation.js";
import { hatenaSuperPreTokenClassName } from "../plugins/hatena/super-pre.js";

describe("hatenaDefaultPresentationThemeSpec", () => {
  it("composes the shared code token presentation spec", () => {
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaSuperPreTokenClassName}.tok-keyword`]).toMatchObject({
      color: "var(--mbox-code-token-keyword-color, #a626a4)",
    });
  });
  it("provides optional heading presentation styles through public classes (h3-h5), matching mbox's own scale", () => {
    expect(hatenaDefaultPresentationThemeSpec).toMatchObject({
      [`.${hatenaHeadingClassNames.h3}, .${hatenaHeadingClassNames.h4}, .${hatenaHeadingClassNames.h5}`]: {
        fontWeight: "var(--mbox-heading-font-weight, 700)",
      },
      [`.${hatenaHeadingClassNames.h3}`]: {
        fontSize: "var(--mbox-h3-font-size, 1.21rem)",
      },
    });
  });

  it("colours and underlines links through the public class", () => {
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaLinkClassName}`]).toMatchObject({
      color: "var(--mbox-hatena-link-color, #2563eb)",
      textDecoration: "underline",
      cursor: "pointer",
    });
  });

  it("gives pre and super-pre their own monospace and a translucent background the selection can blend through", () => {
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaPreClassName}`]).toMatchObject({
      fontFamily: "var(--mbox-hatena-literal-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)",
      background: "var(--mbox-hatena-pre-background, rgba(148, 163, 184, 0.06))",
    });
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaSuperPreClassName}`]).toMatchObject({
      fontFamily: "var(--mbox-hatena-literal-font-family, ui-monospace, SFMono-Regular, Menlo, monospace)",
      background: "var(--mbox-hatena-superpre-background, rgba(148, 163, 184, 0.12))",
    });
  });

  it("rounds the first/last line corners of a literal block", () => {
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaPreClassName}-first`]).toMatchObject({
      borderTopLeftRadius: "4px",
      borderTopRightRadius: "4px",
    });
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaPreClassName}-last`]).toMatchObject({
      borderBottomLeftRadius: "4px",
      borderBottomRightRadius: "4px",
    });
  });

  it("gives the super-pre lang label a small sans-serif presentation", () => {
    expect(hatenaDefaultPresentationThemeSpec[`.${hatenaSuperPreLangClassName}`]).toMatchObject({
      color: "var(--mbox-hatena-superpre-lang-color, #64748b)",
      fontFamily: "var(--mbox-hatena-superpre-lang-font-family, ui-sans-serif, system-ui, sans-serif)",
      fontSize: "var(--mbox-hatena-superpre-lang-font-size, 0.8em)",
      fontWeight: "var(--mbox-hatena-superpre-lang-font-weight, 600)",
    });
  });
});
