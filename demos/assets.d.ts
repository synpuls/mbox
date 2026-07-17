// Vite asset imports used by the demo entry points (see sample-image.png in
// demo.ts / gfm-main.ts / scrapbox-demo.ts): the import resolves to the served
// URL, which respects the build's `base` (dev "/", GitHub Pages "/mbox/").
declare module "*.png" {
  const url: string;
  export default url;
}
