// Plugin-author / extension-author entry point, separate from the root
// batteries-included barrel: helpers for writing and testing a THIRD-PARTY
// mbox plugin -- a decoration context built straight from a document string,
// and validation for the spec arrays a plugin's `decorations()` returns.
//
// A namespace's document getter (getMboxDocumentFromState,
// getGfmDocumentFromState, ...) is NOT here: those are plugin-author-facing
// runtime helpers, so they live at the root and each notation's own sub-path
// instead (matching getGfmDocumentFromState/getHatenaDocumentFromState/
// getScrapboxDocumentFromState in "mbox/gfm"/"mbox/hatena"/"mbox/scrapbox").
export { createTestContext, validateDecorationSpecs } from "./editor/test-context.js";
export type { CreateTestContextOptions } from "./editor/test-context.js";
