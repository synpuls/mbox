import type { MboxPlugin } from "../../editor/plugin.js";
import { bracketPairInputPlugin } from "../bracket-pair-kit.js";

const scrapboxInlineCodePair = { open: "`", close: "`", requireNonEmptySelection: true };

/**
 * Surrounds the selected range with Scrapbox inline code backticks and keeps
 * the content selected. Empty selections fall through so a single backtick is
 * handled by normal text input.
 */
export function scrapboxInlineCodePlugin(): MboxPlugin {
  return bracketPairInputPlugin(scrapboxInlineCodePair);
}
