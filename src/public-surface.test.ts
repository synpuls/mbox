import { describe, expect, it } from "vitest";
import { createEditorState, getMboxDocumentFromState } from "mbox";
import type {
  CreateEditorStateOptions,
  CreateMboxEditorStateOptions,
  MboxPluginOptions,
  SharedMboxEditorOptions,
} from "mbox";
import type { ScrapboxPluginsOptions } from "./scrapbox.js";

// @ts-expect-error -- MboxPluginsOptions is not public
import type { MboxPluginsOptions } from "mbox";
// @ts-expect-error -- ParseMboxDocumentOptions is not public
import type { ParseMboxDocumentOptions } from "mbox";
// @ts-expect-error -- MboxBlockParser is not public
import type { MboxBlockParser } from "mbox";
// @ts-expect-error -- MboxBlockParserContext is not public
import type { MboxBlockParserContext } from "mbox";
// @ts-expect-error -- MboxBlockParseResult is not public
import type { MboxBlockParseResult } from "mbox";
// @ts-expect-error -- createDocumentCache is not public
import { createDocumentCache } from "mbox";
// @ts-expect-error -- DocumentCache is not public
import type { DocumentCache } from "mbox";
// @ts-expect-error -- DocumentCacheEntry is not public
import type { DocumentCacheEntry } from "mbox";
// @ts-expect-error -- ScrapboxInlineOptions is not public
import type { ScrapboxInlineOptions as RootScrapboxInlineOptions } from "mbox";
// @ts-expect-error -- ScrapboxInlineOptions is not public
import type { ScrapboxInlineOptions as SubpathScrapboxInlineOptions } from "./scrapbox.js";

if (false) {
  // @ts-expect-error -- debugLineNumbers is not public
  createEditorState({ debugLineNumbers: true } satisfies CreateEditorStateOptions);
  // @ts-expect-error -- debugLineNumbers is not public
  const options: SharedMboxEditorOptions = { debugLineNumbers: true };
  void options;
  // @ts-expect-error -- renamed to link
  ({ pageLink: {} } satisfies MboxPluginOptions);
  // @ts-expect-error -- renamed to image
  ({ markdownImage: {} } satisfies MboxPluginOptions);
  // @ts-expect-error -- notation selection is by package entry point
  ({ notation: "gfm" } satisfies CreateMboxEditorStateOptions);
  // @ts-expect-error -- moved under link
  ({ iconUrl: () => "" } satisfies ScrapboxPluginsOptions);
  // @ts-expect-error -- moved under link
  ({ pageUrl: () => "" } satisfies ScrapboxPluginsOptions);
  // @ts-expect-error -- moved under link
  ({ pageExists: () => true } satisfies ScrapboxPluginsOptions);
  ({ link: { iconUrl: () => "", pageUrl: () => "", pageExists: () => true } } satisfies ScrapboxPluginsOptions);
}

describe("public surface", () => {
  it("keeps document accessors public", () => {
    const state = createEditorState({ doc: "# Hello" });

    expect(getMboxDocumentFromState(state).blocks[0]?.type).toBe("heading");
  });
});
