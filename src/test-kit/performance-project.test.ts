import { describe, expect, it } from "vitest";
import vitestConfig from "../../vitest.config.js";

// The performance project's wiring fails silently. A guard file that is added
// to the performance `include` but not to the unit `exclude` still runs -- in
// the unit project, in parallel with 180 other files, where a ratio between
// two timings means nothing. The suite stays green and the guard is worthless.
//
// So the invariant is asserted rather than left to a code comment: every file
// the performance project claims must be excluded from the unit project, whose
// `src/**/*.test.ts` glob would otherwise pick it up.

type ProjectConfig = {
  test?: { name?: string; include?: string[]; exclude?: string[] };
};

const projects = (vitestConfig.test?.projects ?? []) as ProjectConfig[];

function projectNamed(name: string): NonNullable<ProjectConfig["test"]> {
  const found = projects.find((project) => project.test?.name === name)?.test;
  expect(found, `no vitest project named "${name}"`).toBeDefined();
  return found!;
}

describe("the performance project's registration", () => {
  it("declares its files explicitly instead of matching a name pattern", () => {
    const include = projectNamed("performance").include ?? [];

    expect(include.length).toBeGreaterThan(0);
    for (const entry of include) {
      expect(entry, `"${entry}" is a glob; two of these files also hold ordinary tests`).not.toMatch(/[*?]/);
    }
  });

  it("keeps every performance file out of the unit project", () => {
    const include = projectNamed("performance").include ?? [];
    const unitExclude = new Set(projectNamed("unit").exclude ?? []);

    for (const entry of include) {
      expect(unitExclude.has(entry), `${entry} runs in the performance project but is not excluded from unit`).toBe(true);
    }
  });

  it("keeps the performance project in a single worker", () => {
    // A second worker can delay one side of a sample pair, which is the one
    // thing a paired-ratio measurement cannot survive.
    expect((projectNamed("performance") as { fileParallelism?: boolean }).fileParallelism).toBe(false);
  });

  it("holds exactly the files that carry ratio guards", () => {
    // Pinned as a set, not a `toContain`: a file dropped from this list stops
    // being measured in isolation and nothing else notices. Adding a guard
    // file is meant to be a deliberate edit here as well as in the config.
    expect(projectNamed("performance").include).toEqual([
      "src/plugins/mbox/parser.inline.test.ts",
      "src/plugins/gfm/math.test.ts",
      "src/editor/plugin.performance.test.ts",
      "src/plugins/hatena/parser.performance.test.ts",
      "src/plugins/scrapbox/inline.performance.test.ts",
    ]);
  });
});
