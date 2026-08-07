import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseScrapboxInline, type ScrapboxInlineNode } from "../src/plugins/scrapbox/inline.js";

type MatcherEntry =
  | "code"
  | "decoration"
  | "formula"
  | "strongImage"
  | "doubleBracketImage"
  | "strong"
  | "image"
  | "externalLink"
  | "icon"
  | "internalLink"
  | "hashTag";

interface Fragment {
  syntax: string;
  matcherEntry: MatcherEntry;
  nodeType: ScrapboxInlineNode["type"];
  open: string;
  close: string;
  trailingDelimiterLength?: number;
}

interface NodeShape {
  type: ScrapboxInlineNode["type"];
  from: number;
  to: number;
  children?: NodeShape[];
}

type ResultClassification = "literal" | "outer-only" | "inner-only" | "both-nested" | "both-siblings" | "other";
type UniqueInputClassification = ResultClassification | "mixed";

const classifications: ResultClassification[] = [
  "literal",
  "outer-only",
  "inner-only",
  "both-nested",
  "both-siblings",
  "other",
];

const SHAPES_INDISTINGUISHABLE_REASON =
  "The outer and inner closer sequences commute (outer+inner === inner+outer), so closer ownership cannot be represented by their order.";

// These are the 11 hand-written forms used when a matcher entry is outside.
// Whitespace belongs only to syntax that requires it; in particular, hashtag
// boundaries are not padded by the combination loop and formulas use `[$ f]`.
const outerFragments: Fragment[] = [
  { syntax: "code", matcherEntry: "code", nodeType: "code", open: "`outer-", close: "`" },
  { syntax: "decoration", matcherEntry: "decoration", nodeType: "decoration", open: "[* outer-", close: "]" },
  { syntax: "formula", matcherEntry: "formula", nodeType: "formula", open: "[$ outer-", close: "]" },
  { syntax: "image", matcherEntry: "strongImage", nodeType: "strongImage", open: "[[https://image.test/outer-", close: ".png]]" },
  { syntax: "image", matcherEntry: "doubleBracketImage", nodeType: "image", open: "[[https://image.test/outer.png https://link.test/outer-", close: "]]" },
  { syntax: "strong", matcherEntry: "strong", nodeType: "strong", open: "[[outer-", close: "]]" },
  { syntax: "image", matcherEntry: "image", nodeType: "image", open: "[https://image.test/outer.png https://link.test/outer-", close: "]" },
  { syntax: "externalLink", matcherEntry: "externalLink", nodeType: "externalLink", open: "[https://link.test/outer ", close: "]" },
  { syntax: "icon", matcherEntry: "icon", nodeType: "icon", open: "[outer-", close: ".icon]" },
  { syntax: "internalLink", matcherEntry: "internalLink", nodeType: "internalLink", open: "[outer-", close: "]" },
  { syntax: "hashTag", matcherEntry: "hashTag", nodeType: "hashTag", open: "#outer-", close: " ", trailingDelimiterLength: 1 },
];

// These are separately hand-written rather than derived from the outer forms.
// That makes the 11 inner spellings reviewable independently of the 11 outer
// spellings before the mechanical Cartesian product is created.
const innerFragments: Fragment[] = [
  { syntax: "code", matcherEntry: "code", nodeType: "code", open: "`inner-", close: "`" },
  { syntax: "decoration", matcherEntry: "decoration", nodeType: "decoration", open: "[* inner-", close: "]" },
  { syntax: "formula", matcherEntry: "formula", nodeType: "formula", open: "[$ inner-", close: "]" },
  { syntax: "image", matcherEntry: "strongImage", nodeType: "strongImage", open: "[[https://image.test/inner-", close: ".png]]" },
  { syntax: "image", matcherEntry: "doubleBracketImage", nodeType: "image", open: "[[https://image.test/inner.png https://link.test/inner-", close: "]]" },
  { syntax: "strong", matcherEntry: "strong", nodeType: "strong", open: "[[inner-", close: "]]" },
  { syntax: "image", matcherEntry: "image", nodeType: "image", open: "[https://image.test/inner.png https://link.test/inner-", close: "]" },
  { syntax: "externalLink", matcherEntry: "externalLink", nodeType: "externalLink", open: "[https://link.test/inner ", close: "]" },
  { syntax: "icon", matcherEntry: "icon", nodeType: "icon", open: "[inner-", close: ".icon]" },
  { syntax: "internalLink", matcherEntry: "internalLink", nodeType: "internalLink", open: "[inner-", close: "]" },
  { syntax: "hashTag", matcherEntry: "hashTag", nodeType: "hashTag", open: "#inner-", close: " ", trailingDelimiterLength: 1 },
];

function nodeShape(node: ScrapboxInlineNode): NodeShape {
  const shape: NodeShape = { type: node.type, from: node.from, to: node.to };
  if (node.type === "decoration" || node.type === "strong") shape.children = node.children.map(nodeShape);
  return shape;
}

function allNodes(nodes: ScrapboxInlineNode[]): ScrapboxInlineNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.type === "decoration" || node.type === "strong" ? allNodes(node.children) : []),
  ]);
}

function tokenEnd(positionAfterClose: number, fragment: Fragment): number {
  return positionAfterClose - (fragment.trailingDelimiterLength ?? 0);
}

function classify(
  nodes: ScrapboxInlineNode[],
  outer: Fragment,
  inner: Fragment,
  innerStart: number,
): ResultClassification {
  const nonText = allNodes(nodes).filter(({ type }) => type !== "text");
  if (nonText.length === 0) return "literal";

  // Classification is only a review index: exact identity is deliberately
  // left to expectedNodes. The outer spelling always starts at zero and the
  // inner spelling at innerStart, which disambiguates entries sharing a node
  // type (the three image entries and self-combinations).
  const outerNodes = nonText.filter((node) => node.type === outer.nodeType && node.from === 0);
  const innerNodes = nonText.filter((node) => node.type === inner.nodeType && node.from >= innerStart);
  for (const outerNode of outerNodes) {
    const descendants = outerNode.type === "decoration" || outerNode.type === "strong" ? allNodes(outerNode.children) : [];
    if (innerNodes.some((innerNode) => descendants.includes(innerNode))) return "both-nested";
  }
  if (outerNodes.length > 0 && innerNodes.length > 0) return "both-siblings";
  if (outerNodes.length > 0) return "outer-only";
  if (innerNodes.length > 0) return "inner-only";
  return "other";
}

function exercisesNamedPair(nodes: ScrapboxInlineNode[], outer: Fragment, inner: Fragment): boolean {
  const namedNodeTypes = new Set([outer.nodeType, inner.nodeType]);
  return allNodes(nodes).some((node) => node.type !== "text" && namedNodeTypes.has(node.type));
}

function countClassifications<T extends string>(values: T[], keys: T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

for (const fragment of [...outerFragments, ...innerFragments]) {
  const input = `${fragment.open}probe${fragment.close}`;
  const expectedTo = tokenEnd(input.length, fragment);
  const exact = parseScrapboxInline(input).find(
    (node) => node.type === fragment.nodeType && node.from === 0 && node.to === expectedTo,
  );
  if (exact === undefined) throw new Error(`invalid hand-written ${fragment.matcherEntry} fragment: ${JSON.stringify(input)}`);
}

const cases = outerFragments.flatMap((outer) =>
  innerFragments.flatMap((inner) =>
    (["outer-first", "inner-first"] as const).map((shape) => {
      const innerStart = outer.open.length;
      const input =
        shape === "outer-first"
          ? `${outer.open}${inner.open}probe${outer.close}${inner.close}`
          : `${outer.open}${inner.open}probe${inner.close}${outer.close}`;
      const nodes = parseScrapboxInline(input);
      const shapesIndistinguishable = outer.close + inner.close === inner.close + outer.close;

      return {
        id: `outer-${outer.matcherEntry}__inner-${inner.matcherEntry}__${shape}`,
        outer: { syntax: outer.syntax, matcherEntry: outer.matcherEntry, close: outer.close },
        inner: { syntax: inner.syntax, matcherEntry: inner.matcherEntry, close: inner.close },
        shape,
        input,
        expectedNodes: nodes.map(nodeShape),
        classification: classify(nodes, outer, inner, innerStart),
        shapesIndistinguishable,
        ...(shapesIndistinguishable ? { shapesIndistinguishableReason: SHAPES_INDISTINGUISHABLE_REASON } : {}),
        exercisesNamedPair: exercisesNamedPair(nodes, outer, inner),
      };
    }),
  ),
);

if (cases.length !== 242) throw new Error(`expected 242 cases, got ${cases.length}`);
if (new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error("generated duplicate case IDs");

const casesByInput = new Map<string, typeof cases>();
for (const testCase of cases) {
  const group = casesByInput.get(testCase.input) ?? [];
  group.push(testCase);
  casesByInput.set(testCase.input, group);
}
const duplicateCaseIdGroups = [...casesByInput.values()]
  .filter((group) => group.length > 1)
  .map((group) => group.map(({ id }) => id));
const casesWithInputCollisionMetadata = cases.map((testCase) => {
  const group = casesByInput.get(testCase.input) ?? [];
  if (group.length === 1) return testCase;
  return {
    ...testCase,
    inputCollision: {
      kind: testCase.shapesIndistinguishable ? "indistinguishable-shapes" : "cross-named-pair",
      aliasCaseIds: group.filter(({ id }) => id !== testCase.id).map(({ id }) => id),
    },
  };
});

for (const testCase of cases) {
  const counterpart = cases.find(({ outer, inner, shape }) =>
    outer.matcherEntry === testCase.outer.matcherEntry
    && inner.matcherEntry === testCase.inner.matcherEntry
    && shape !== testCase.shape
  );
  if (counterpart === undefined) throw new Error(`missing shape counterpart for ${testCase.id}`);
  if ((testCase.input === counterpart.input) !== testCase.shapesIndistinguishable) {
    throw new Error(`closer commutation did not explain shape equality for ${testCase.id}`);
  }
}

const indistinguishableShapePairs = cases.filter(({ shape, shapesIndistinguishable }) =>
  shape === "outer-first" && shapesIndistinguishable
).length;
const crossNamedPairInputCollisionCount = [...casesByInput.values()].filter((group) =>
  new Set(group.map(({ outer, inner }) => `${outer.matcherEntry}/${inner.matcherEntry}`)).size > 1
).length;
const logicalClassificationCounts = countClassifications(cases.map(({ classification }) => classification), classifications);
const uniqueInputClassifications: UniqueInputClassification[] = [...casesByInput.values()].map((group) => {
  const groupClassifications = new Set(group.map(({ classification }) => classification));
  return groupClassifications.size === 1 ? group[0].classification : "mixed";
});
const uniqueInputClassificationCounts = countClassifications(
  uniqueInputClassifications,
  [...classifications, "mixed"],
);
const exercisesNamedPairCount = cases.filter(({ exercisesNamedPair }) => exercisesNamedPair).length;

writeFileSync(
  resolve("tests/fixtures/scrapbox/inline-nesting-current.json"),
  `${JSON.stringify(
    {
      summary: {
        logicalCaseCount: cases.length,
        uniqueInputCount: casesByInput.size,
        indistinguishableShapePairCount: indistinguishableShapePairs,
        crossNamedPairInputCollisionCount,
        exercisesNamedPairCount,
        doesNotExerciseNamedPairCount: cases.length - exercisesNamedPairCount,
        logicalClassificationCounts,
        uniqueInputClassificationCounts,
        duplicateCaseIdGroups,
      },
      cases: casesWithInputCollisionMetadata,
    },
    null,
    2,
  )}\n`,
);
