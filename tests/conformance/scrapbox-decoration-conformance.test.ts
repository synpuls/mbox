import { scrapboxPlugins } from "../../src/plugins/scrapbox/index.js";
import { runDecorationConformance } from "../unit-kit/decoration-conformance.js";
import { commonDecorationCorpus } from "./corpus/common.js";
import { scrapboxDecorationCorpus } from "./corpus/scrapbox.js";

runDecorationConformance({
  name: "scrapbox",
  plugins: () => scrapboxPlugins({ titleLine: true }),
  corpus: [...commonDecorationCorpus, ...scrapboxDecorationCorpus],
});
