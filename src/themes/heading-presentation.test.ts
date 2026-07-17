import { describe, expect, it } from "vitest";
import { headingClassNames } from "../plugins/mbox/heading.js";
import { headingPresentationThemeSpec } from "./heading-presentation.js";

describe("headingPresentationThemeSpec", () => {
  it("provides the mbox default heading scale from a full h1-h6 entry list", () => {
    const theme = headingPresentationThemeSpec([
      { level: 1, className: headingClassNames.h1 },
      { level: 2, className: headingClassNames.h2 },
      { level: 3, className: headingClassNames.h3 },
      { level: 4, className: headingClassNames.h4 },
      { level: 5, className: headingClassNames.h5 },
      { level: 6, className: headingClassNames.h6 },
    ]);

    expect(theme).toMatchObject({
      [`.${headingClassNames.h1}, .${headingClassNames.h2}, .${headingClassNames.h3}, .${headingClassNames.h4}, .${headingClassNames.h5}, .${headingClassNames.h6}`]: {
        fontWeight: "var(--mbox-heading-font-weight, 700)",
      },
      [`.${headingClassNames.h1}`]: { fontSize: "var(--mbox-h1-font-size, 1.45rem)" },
      [`.${headingClassNames.h2}`]: { fontSize: "var(--mbox-h2-font-size, 1.33rem)" },
      [`.${headingClassNames.h3}`]: { fontSize: "var(--mbox-h3-font-size, 1.21rem)" },
      [`.${headingClassNames.h4}`]: { fontSize: "var(--mbox-h4-font-size, 1.09rem)" },
      [`.${headingClassNames.h5}`]: { fontSize: "var(--mbox-h5-font-size, 1rem)" },
      [`.${headingClassNames.h6}`]: { fontSize: "var(--mbox-h6-font-size, 0.93rem)" },
    });
  });

  it("generates a heading scale from a partial level range (e.g. h3-h5 only)", () => {
    const theme = headingPresentationThemeSpec([
      { level: 3, className: "mbox-hatena-h3" },
      { level: 4, className: "mbox-hatena-h4" },
      { level: 5, className: "mbox-hatena-h5" },
    ]);

    expect(theme).toMatchObject({
      ".mbox-hatena-h3, .mbox-hatena-h4, .mbox-hatena-h5": {
        fontWeight: "var(--mbox-heading-font-weight, 700)",
      },
      ".mbox-hatena-h3": { fontSize: "var(--mbox-h3-font-size, 1.21rem)" },
      ".mbox-hatena-h4": { fontSize: "var(--mbox-h4-font-size, 1.09rem)" },
      ".mbox-hatena-h5": { fontSize: "var(--mbox-h5-font-size, 1rem)" },
    });
    expect(theme).not.toHaveProperty(".mbox-hatena-h1");
  });
});
