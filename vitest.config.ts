import { configDefaults, defineConfig } from "vitest/config";

const alias = {
  "mbox/gfm": new URL("./src/gfm.ts", import.meta.url).pathname,
  "mbox/hatena": new URL("./src/hatena.ts", import.meta.url).pathname,
  "mbox/scrapbox": new URL("./src/scrapbox.ts", import.meta.url).pathname,
  mbox: new URL("./src/index.ts", import.meta.url).pathname,
};

// Three projects so `npm test` means package correctness only: demo tests are
// a separate signal (`npm run test:demo`), not part of the library quality
// gate. The unit/dom split makes the environment structural — see the note on
// the projects list below.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Presentation themes are CSS-in-JS value objects; their contracts are
        // asserted structurally, so line coverage over them is noise.
        "src/themes/**",
        // Entry points: mostly re-export barrels (the notation files also hold
        // thin createXxxEditor wrappers that entry tests and the package smoke
        // exercise directly); import-time line coverage over them is noise.
        "src/index.ts",
        "src/gfm.ts",
        "src/hatena.ts",
        "src/scrapbox.ts",
        "src/testing.ts",
      ],
      // Slightly below current actuals (94/86/93/94) so a sizable untested
      // module trips the gate without making every refactor fight the meter.
      thresholds: {
        lines: 90,
        branches: 80,
        functions: 90,
        statements: 90,
      },
    },
    projects: [
      // unit and dom together are the library quality gate (`npm test`). The
      // file name carries the environment: `*.dom.test.ts` runs on happy-dom,
      // everything else on node, so a test that runs in plain node documents
      // that the logic under test is DOM-free (see TESTING.md §6).
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/conformance/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.dom.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "happy-dom",
          include: ["src/**/*.dom.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "demo",
          include: ["demos/**/*.test.ts"],
        },
      },
    ],
  },
});
