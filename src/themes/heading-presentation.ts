import type { MboxThemeSpec } from "../editor/plugin.js";

/**
 * One heading level's public class name, paired with the level it maps to
 * (1-6). A notation may map only a subset of levels (e.g. Hatena's h3-h5) —
 * pass just those entries.
 */
export interface HeadingPresentationEntry {
  level: number;
  className: string;
}

// The shared default heading scale (rem-based, CSS-variable overridable),
// keyed by level. This is the single source of truth other than the CSS
// variable itself; namespaces no longer hardcode these numbers.
const defaultHeadingFontSizeByLevel: Record<number, string> = {
  1: "1.45rem",
  2: "1.33rem",
  3: "1.21rem",
  4: "1.09rem",
  5: "1rem",
  6: "0.93rem",
};

/**
 * Build an OPT-IN heading presentation theme fragment for the given levels —
 * not a plugin theme. A notation's own `headingPlugin()` ships no font-size
 * or font-weight of its own; a host wanting the mbox-style scale passes its
 * heading class names here and adds the result to its own presentation
 * theme (see `mboxDefaultPresentationThemeSpec`).
 */
export function headingPresentationThemeSpec(entries: HeadingPresentationEntry[]): MboxThemeSpec {
  if (entries.length === 0) {
    return {};
  }

  const selector = entries.map((entry) => `.${entry.className}`).join(", ");
  const theme: MboxThemeSpec = {
    [selector]: {
      fontWeight: "var(--mbox-heading-font-weight, 700)",
    },
  };

  for (const entry of entries) {
    const defaultFontSize = defaultHeadingFontSizeByLevel[entry.level];
    if (!defaultFontSize) {
      continue;
    }
    theme[`.${entry.className}`] = {
      fontSize: `var(--mbox-h${entry.level}-font-size, ${defaultFontSize})`,
    };
  }

  return theme;
}
