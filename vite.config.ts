import { resolve } from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const external = [...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.peerDependencies ?? {})];

export default defineConfig({
  resolve: {
    // Lets demo entry points (demos/) import the library the same way a
    // real consumer would -- `import ... from "mbox"` -- instead of
    // reaching into src/ with relative paths. Matches vitest.config.ts's
    // and tsconfig.json's own "mbox" alias/path mapping.
    alias: {
      "mbox/gfm": resolve(__dirname, "src/gfm.ts"),
      "mbox/hatena": resolve(__dirname, "src/hatena.ts"),
      "mbox/scrapbox": resolve(__dirname, "src/scrapbox.ts"),
      mbox: resolve(__dirname, "src/index.ts"),
    },
  },
  build: {
    lib: {
      // "./testing" (src/testing.ts) is a separate entry, not re-exported
      // from index.ts -- plugin-author test helpers (createTestContext,
      // validateDecorationSpecs) live there. Runtime plugins use the matching
      // public getXxxDocumentFromState accessor.
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        testing: resolve(__dirname, "src/testing.ts"),
        gfm: resolve(__dirname, "src/gfm.ts"),
        hatena: resolve(__dirname, "src/hatena.ts"),
        scrapbox: resolve(__dirname, "src/scrapbox.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external,
    },
  },
});
