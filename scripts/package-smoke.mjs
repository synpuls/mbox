// Smoke-tests the packed artifact — the thing `npm publish` ships — not src/.
// Unit tests import source through a bundler alias, so exports-map, `files`,
// and dist-resolution mistakes are invisible to them; this catches those by
// packing the tarball, installing it into a throwaway project next to the
// declared peer dependencies, importing every public subpath, and mounting one
// real editor in a happy-dom document.
//
// Run via `npm run test:package` (which builds first; `npm pack` itself does
// not trigger prepublishOnly).
//
// `--import-only` skips the happy-dom install and the editor mount, leaving
// subpath resolution and the pure API assertions. That is the deepest check
// possible on Node 18: the `engines` floor the package declares to consumers
// is below the floor of the dev toolchain (vite 7 / happy-dom need >=20), so
// the Node 18 CI job runs this mode against a dist built on a newer Node.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

const importOnly = process.argv.includes("--import-only");

const SMOKE_DOM_IMPORT = `import { GlobalRegistrator } from "@happy-dom/global-registrator";`;

const SMOKE_DOM = `
// One real editor against the DOM: the most load-bearing peer integration.
GlobalRegistrator.register();
const parent = document.createElement("div");
document.body.appendChild(parent);
const view = root.createMboxEditor({ parent, doc: "[Page]" });
assert.ok(parent.querySelector(".cm-editor"), "editor mounted");
view.destroy();
await GlobalRegistrator.unregister();
`;

const SMOKE = `
${importOnly ? "" : SMOKE_DOM_IMPORT}
import assert from "node:assert/strict";

// Every exports-map subpath must resolve from the installed package.
const root = await import("@synpuls/mbox");
const testing = await import("@synpuls/mbox/testing");
const gfm = await import("@synpuls/mbox/gfm");
const hatena = await import("@synpuls/mbox/hatena");
const scrapbox = await import("@synpuls/mbox/scrapbox");

// createDocumentCache is the only removed API with a runtime value. Type-only
// exports are checked by the consumer typecheck below.
assert.ok(!("createDocumentCache" in root), "createDocumentCache is not importable from the package root");

// Pure paths: parser and the public plugin-author test helpers.
assert.equal(root.parseMboxDocument("# Hello").blocks[0]?.type, "heading");
const context = testing.createTestContext("plain");
testing.validateDecorationSpecs(context, []);

// Per-notation state construction (no DOM required).
gfm.createGfmEditorState({ doc: "# Hello" });
hatena.createHatenaEditorState({ doc: "*Title" });
scrapbox.createScrapboxEditorState({ doc: "Title" });
${importOnly ? "" : SMOKE_DOM}
console.log("smoke assertions passed");
`;

// This fixture is compiled from the installed consumer project so the package
// exports map and generated declaration files, rather than source aliases,
// define the public surface under test.
const PUBLIC_SURFACE = `
import { createEditorState } from "@synpuls/mbox";
import type { CreateEditorStateOptions, ImageKitMeasureClassNames, SharedMboxEditorOptions } from "@synpuls/mbox";

const imageKitMeasureClassNames: ImageKitMeasureClassNames = { measure: "measure" };
void imageKitMeasureClassNames;

// @ts-expect-error -- MboxPluginsOptions is not public
import type { MboxPluginsOptions } from "@synpuls/mbox";
// @ts-expect-error -- ParseMboxDocumentOptions is not public
import type { ParseMboxDocumentOptions } from "@synpuls/mbox";
// @ts-expect-error -- MboxBlockParser is not public
import type { MboxBlockParser } from "@synpuls/mbox";
// @ts-expect-error -- MboxBlockParserContext is not public
import type { MboxBlockParserContext } from "@synpuls/mbox";
// @ts-expect-error -- MboxBlockParseResult is not public
import type { MboxBlockParseResult } from "@synpuls/mbox";
// @ts-expect-error -- createDocumentCache is not public
import { createDocumentCache } from "@synpuls/mbox";
// @ts-expect-error -- DocumentCache is not public
import type { DocumentCache } from "@synpuls/mbox";
// @ts-expect-error -- DocumentCacheEntry is not public
import type { DocumentCacheEntry } from "@synpuls/mbox";
// @ts-expect-error -- ScrapboxInlineOptions is not public
import type { ScrapboxInlineOptions as RootScrapboxInlineOptions } from "@synpuls/mbox";
// @ts-expect-error -- ScrapboxInlineOptions is not public
import type { ScrapboxInlineOptions as SubpathScrapboxInlineOptions } from "@synpuls/mbox/scrapbox";

// Notation-specific APIs are subpath-only; keeping them out of the root makes
// the root entry point a focused mbox/core surface.
// @ts-expect-error -- gfmPlugins is not public from the root
import { gfmPlugins as rootGfmPlugins } from "@synpuls/mbox";
// @ts-expect-error -- gfmDefaultPresentationTheme is not public from the root
import { gfmDefaultPresentationTheme as rootGfmDefaultPresentationTheme } from "@synpuls/mbox";
// @ts-expect-error -- GfmDocument is not public from the root
import type { GfmDocument as RootGfmDocument } from "@synpuls/mbox";
// @ts-expect-error -- GfmPluginsOptions is not public from the root
import type { GfmPluginsOptions as RootGfmPluginsOptions } from "@synpuls/mbox";
import { gfmDefaultPresentationTheme, gfmPlugins } from "@synpuls/mbox/gfm";
import type { GfmDocument, GfmPluginsOptions } from "@synpuls/mbox/gfm";

// @ts-expect-error -- hatenaPlugins is not public from the root
import { hatenaPlugins as rootHatenaPlugins } from "@synpuls/mbox";
// @ts-expect-error -- hatenaDefaultPresentationTheme is not public from the root
import { hatenaDefaultPresentationTheme as rootHatenaDefaultPresentationTheme } from "@synpuls/mbox";
// @ts-expect-error -- HatenaDocument is not public from the root
import type { HatenaDocument as RootHatenaDocument } from "@synpuls/mbox";
// @ts-expect-error -- HatenaPluginsOptions is not public from the root
import type { HatenaPluginsOptions as RootHatenaPluginsOptions } from "@synpuls/mbox";
import { hatenaDefaultPresentationTheme, hatenaPlugins } from "@synpuls/mbox/hatena";
import type { HatenaDocument, HatenaPluginsOptions } from "@synpuls/mbox/hatena";

// @ts-expect-error -- scrapboxPlugins is not public from the root
import { scrapboxPlugins as rootScrapboxPlugins } from "@synpuls/mbox";
// @ts-expect-error -- scrapboxDefaultPresentationTheme is not public from the root
import { scrapboxDefaultPresentationTheme as rootScrapboxDefaultPresentationTheme } from "@synpuls/mbox";
// @ts-expect-error -- ScrapboxDocument is not public from the root
import type { ScrapboxDocument as RootScrapboxDocument } from "@synpuls/mbox";
// @ts-expect-error -- ScrapboxPluginsOptions is not public from the root
import type { ScrapboxPluginsOptions as RootScrapboxPluginsOptions } from "@synpuls/mbox";
import { scrapboxDefaultPresentationTheme, scrapboxPlugins } from "@synpuls/mbox/scrapbox";
import type { ScrapboxDocument, ScrapboxPluginsOptions } from "@synpuls/mbox/scrapbox";

// @ts-expect-error -- debugLineNumbers is not public
createEditorState({ debugLineNumbers: true } satisfies CreateEditorStateOptions);
// @ts-expect-error -- debugLineNumbers is not public
const options: SharedMboxEditorOptions = { debugLineNumbers: true };
void options;
`;

const PUBLIC_SURFACE_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: "ES2022",
    },
    files: ["public-surface.ts"],
  },
  null,
  2,
);

const tmp = mkdtempSync(join(tmpdir(), "mbox-smoke-"));
try {
  console.log(`[package-smoke] packing into ${tmp}`);
  const packOutput = run("npm", ["pack", "--pack-destination", tmp], root);
  const tarball = packOutput.trim().split("\n").at(-1);

  writeFileSync(
    join(tmp, "package.json"),
    JSON.stringify({ name: "mbox-smoke", private: true, type: "module" }, null, 2),
  );

  const peers = Object.entries(pkg.peerDependencies).map(([name, range]) => `${name}@${range}`);
  const happyDomRange = pkg.devDependencies["happy-dom"];
  const domDeps = importOnly ? [] : [`happy-dom@${happyDomRange}`, `@happy-dom/global-registrator@${happyDomRange}`];
  console.log(`[package-smoke] installing tarball + peer dependencies${importOnly ? " (import-only)" : ""}`);
  run("npm", ["install", "--no-audit", "--no-fund", join(tmp, tarball), ...peers, ...domDeps], tmp);

  // Public docs linked from the packaged README must ship with the tarball.
  const packageDir = join(tmp, "node_modules", ...pkg.name.split("/"));
  const readmePath = join(packageDir, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const guideLink = readme.match(/\[guide\]\((\.\/docs\/guide\.md)\)/)?.[1];
  assert.ok(guideLink, "README links to ./docs/guide.md");
  const guidePath = fileURLToPath(new URL(guideLink, pathToFileURL(readmePath)));
  const guide = readFileSync(guidePath, "utf8");
  assert.match(guide, /^# Guide\s*$/m);
  assert.ok(guide.trim().length > "# Guide".length, "guide contains public documentation");

  writeFileSync(join(tmp, "smoke.mjs"), SMOKE);
  console.log("[package-smoke] running smoke.mjs");
  run("node", ["smoke.mjs"], tmp);
  writeFileSync(join(tmp, "public-surface.ts"), PUBLIC_SURFACE);
  writeFileSync(join(tmp, "tsconfig.json"), PUBLIC_SURFACE_TSCONFIG);
  console.log("[package-smoke] typechecking public-surface.ts as an installed consumer");
  run(join(root, "node_modules", ".bin", "tsc"), ["--project", "tsconfig.json"], tmp);
  console.log("[package-smoke] OK");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
