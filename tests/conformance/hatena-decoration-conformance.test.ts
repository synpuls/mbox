import { hatenaPlugins } from "../../src/plugins/hatena/index.js";
import { runDecorationConformance } from "../unit-kit/decoration-conformance.js";
import { commonDecorationCorpus } from "./corpus/common.js";
import { hatenaDecorationCorpus } from "./corpus/hatena.js";

runDecorationConformance({
  name: "hatena",
  plugins: () => hatenaPlugins(),
  corpus: [...commonDecorationCorpus, ...hatenaDecorationCorpus],
});
