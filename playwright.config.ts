import { defineConfig } from "@playwright/test";

// A dedicated test port, far from vite's 5173+auto-increment range that
// manual `npm run dev` servers (including other worktrees) occupy.
const port = process.env.MBOX_PLAYWRIGHT_PORT ?? "5199";
const baseURL = `http://127.0.0.1:${port}`;
const desktopProject = {
  viewport: { width: 1280, height: 720 },
  screen: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

export default defineConfig({
  testDir: "./tests/layout",
  timeout: 10_000,
  use: {
    baseURL,
  },
  projects: [
    { name: "chromium", use: { ...desktopProject, browserName: "chromium" } },
    { name: "firefox", use: { ...desktopProject, browserName: "firefox" } },
    { name: "webkit", use: { ...desktopProject, browserName: "webkit" } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    // Never reuse: a dev server started from another git worktree can occupy
    // this port and silently serve stale code (this happened; see todo.md).
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
