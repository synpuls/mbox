import { gfmPlugins } from "../../src/plugins/gfm/index.js";
import { runDecorationConformance } from "../unit-kit/decoration-conformance.js";
import { commonDecorationCorpus } from "./corpus/common.js";
import { gfmDecorationCorpus } from "./corpus/gfm.js";

runDecorationConformance({
  name: "gfm",
  plugins: () => gfmPlugins(),
  corpus: [...commonDecorationCorpus, ...gfmDecorationCorpus],
});
