import { expect, type Page } from "@playwright/test";
import type { PlaygroundHandle } from "../../../demos/playground-handle";

export type PlaygroundNotation = "gfm" | "hatena";

type PlaygroundWindowKey = "__mboxGfmPlayground" | "__mboxHatenaPlayground";

// The demo entry point that creates the handle (demos/playground-handle.ts) owns
// its shape and the Window global declarations; redeclaring either here would
// conflict (TS2717) now that demos and tests share one TS program. Look the
// handle up through this explicit cast instead of the demo's `declare global`,
// so the dependency stays visible even if the two ever split programs.
type PlaygroundWindow = Window & Partial<Record<PlaygroundWindowKey, PlaygroundHandle>>;

const playgrounds: Record<PlaygroundNotation, { path: string; handle: PlaygroundWindowKey }> = {
  gfm: { path: "/demos/gfm.html", handle: "__mboxGfmPlayground" },
  hatena: { path: "/demos/hatena.html", handle: "__mboxHatenaPlayground" },
};

export async function openPlayground(page: Page, notation: PlaygroundNotation): Promise<void> {
  const playground = playgrounds[notation];

  await page.goto(playground.path);
  // The first dev-server load can pre-bundle notation dependencies and reload,
  // destroying the execution context mid-evaluate. Poll through that transient.
  await expect
    .poll(async () => {
      try {
        return await page.evaluate((handle) => Boolean((window as PlaygroundWindow)[handle]?.view), playground.handle);
      } catch {
        return false;
      }
    })
    .toBe(true);
}

export async function setPlaygroundDoc(
  page: Page,
  notation: PlaygroundNotation,
  doc: string,
  selection?: number,
  focus?: boolean,
): Promise<void> {
  await page.evaluate(
    ({ handle, doc: nextDoc, selection: nextSelection, focus: shouldFocus }) => {
      (window as PlaygroundWindow)[handle]?.setDoc(nextDoc, nextSelection, shouldFocus);
    },
    { handle: playgrounds[notation].handle, doc, selection, focus },
  );
}

export async function setPlaygroundSelection(
  page: Page,
  notation: PlaygroundNotation,
  anchor: number,
  head?: number,
): Promise<void> {
  await page.evaluate(
    ({ handle, anchor: selectionAnchor, head: selectionHead }) => {
      (window as PlaygroundWindow)[handle]?.setSelection(selectionAnchor, selectionHead);
    },
    { handle: playgrounds[notation].handle, anchor, head },
  );
}

export async function playgroundCoordsAtPos(
  page: Page,
  notation: PlaygroundNotation,
  pos: number,
): Promise<{ left: number; right: number; top: number; bottom: number } | null | undefined> {
  return page.evaluate(
    ({ handle, pos: position }) => (window as PlaygroundWindow)[handle]?.coordsAtPos?.(position),
    { handle: playgrounds[notation].handle, pos },
  );
}

export async function playgroundDocString(page: Page, notation: PlaygroundNotation): Promise<string | undefined> {
  return page.evaluate((handle) => (window as PlaygroundWindow)[handle]?.docString?.(), playgrounds[notation].handle);
}
