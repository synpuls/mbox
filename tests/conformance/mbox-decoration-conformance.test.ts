import { mboxPlugins } from "../../src/plugins/mbox/default.js";
import { runDecorationConformance } from "../unit-kit/decoration-conformance.js";
import { commonDecorationCorpus } from "./corpus/common.js";
import { mboxDecorationCorpus } from "./corpus/mbox.js";

runDecorationConformance({
  name: "mbox",
  plugins: () => mboxPlugins(),
  corpus: [...commonDecorationCorpus, ...mboxDecorationCorpus],
});
