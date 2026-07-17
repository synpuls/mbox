import { resolve } from "node:path";
import { defineConfig } from "vite";

// Static build of the demo pages for GitHub Pages (https://synpuls.github.io/mbox/).
// The library build stays in vite.config.ts; this config only exists because a
// lib-mode config cannot also emit multi-page HTML. Same "mbox" alias so the
// demo sources keep importing the library the way a real consumer would.
export default defineConfig({
  base: "/mbox/",
  resolve: {
    alias: {
      "mbox/gfm": resolve(__dirname, "src/gfm.ts"),
      "mbox/hatena": resolve(__dirname, "src/hatena.ts"),
      "mbox/scrapbox": resolve(__dirname, "src/scrapbox.ts"),
      mbox: resolve(__dirname, "src/index.ts"),
    },
  },
  build: {
    outDir: "dist-demo",
    // Never inline sample-image.png as a data: URI — the scrapbox demo needs
    // a real http(s) URL for it (Scrapbox image notation requires a scheme).
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        gfm: resolve(__dirname, "demos/gfm.html"),
        hatena: resolve(__dirname, "demos/hatena.html"),
        scrapbox: resolve(__dirname, "demos/scrapbox.html"),
      },
    },
  },
});
