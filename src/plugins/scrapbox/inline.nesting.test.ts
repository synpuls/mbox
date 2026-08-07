import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ScrapboxInlineNode } from "./inline.js";
import { parseScrapboxInline } from "./inline.js";

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

type NestingShape = "outer-first" | "inner-first";
type ResultClassification = "literal" | "outer-only" | "inner-only" | "both-nested" | "both-siblings" | "other";
type UniqueInputClassification = ResultClassification | "mixed";

interface ExpectedNode {
  type: ScrapboxInlineNode["type"];
  from: number;
  to: number;
  children?: ExpectedNode[];
}

interface NestingCase {
  id: string;
  outer: { syntax: string; matcherEntry: MatcherEntry; close: string };
  inner: { syntax: string; matcherEntry: MatcherEntry; close: string };
  shape: NestingShape;
  input: string;
  expectedNodes: ExpectedNode[];
  classification: ResultClassification;
  shapesIndistinguishable: boolean;
  shapesIndistinguishableReason?: string;
  exercisesNamedPair: boolean;
  inputCollision?: {
    kind: "indistinguishable-shapes" | "cross-named-pair";
    aliasCaseIds: string[];
  };
}

interface InlineNestingFixture {
  summary: {
    logicalCaseCount: number;
    uniqueInputCount: number;
    indistinguishableShapePairCount: number;
    crossNamedPairInputCollisionCount: number;
    exercisesNamedPairCount: number;
    doesNotExerciseNamedPairCount: number;
    logicalClassificationCounts: Record<ResultClassification, number>;
    uniqueInputClassificationCounts: Record<UniqueInputClassification, number>;
    duplicateCaseIdGroups: string[][];
  };
  cases: NestingCase[];
}

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/scrapbox/inline-nesting-current.json",
);
const matcherEntries: MatcherEntry[] = [
  "code",
  "decoration",
  "formula",
  "strongImage",
  "doubleBracketImage",
  "strong",
  "image",
  "externalLink",
  "icon",
  "internalLink",
  "hashTag",
];
const classifications: ResultClassification[] = [
  "literal",
  "outer-only",
  "inner-only",
  "both-nested",
  "both-siblings",
  "other",
];
const matcherEntryNodeTypes: Record<MatcherEntry, ScrapboxInlineNode["type"][]> = {
  code: ["code"],
  decoration: ["decoration"],
  formula: ["formula"],
  strongImage: ["strongImage"],
  doubleBracketImage: ["image"],
  strong: ["strong"],
  image: ["image"],
  externalLink: ["externalLink"],
  icon: ["icon"],
  internalLink: ["internalLink"],
  hashTag: ["hashTag"],
};

function readFixture(): InlineNestingFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as InlineNestingFixture;
}

function nodeShape(node: ScrapboxInlineNode): ExpectedNode {
  const shape: ExpectedNode = { type: node.type, from: node.from, to: node.to };
  if (node.type === "decoration" || node.type === "strong") {
    shape.children = node.children.map(nodeShape);
  }
  return shape;
}

function expectedNodeTypes(nodes: ExpectedNode[]): ScrapboxInlineNode["type"][] {
  return nodes.flatMap((node) => [node.type, ...expectedNodeTypes(node.children ?? [])]);
}

function countClassifications<T extends string>(values: T[], keys: T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])) as Record<T, number>;
}

function groupCasesByInput(cases: NestingCase[]): Map<string, NestingCase[]> {
  const casesByInput = new Map<string, NestingCase[]>();
  for (const testCase of cases) {
    const group = casesByInput.get(testCase.input) ?? [];
    group.push(testCase);
    casesByInput.set(testCase.input, group);
  }
  return casesByInput;
}

function expectCurrentNestingCases(fixture: InlineNestingFixture): void {
  for (const testCase of fixture.cases) {
    const message = `${testCase.id}: ${JSON.stringify(testCase.input)}`;
    expect(parseScrapboxInline(testCase.input).map(nodeShape), message).toEqual(testCase.expectedNodes);
  }
}

describe("current Scrapbox inline nesting behavior", () => {
  it("contains exactly all 11 x 11 x 2 logical cases", () => {
    const cases = readFixture().cases;
    const expectedIds = matcherEntries.flatMap((outer) =>
      matcherEntries.flatMap((inner) =>
        (["outer-first", "inner-first"] as const).map((shape) => `outer-${outer}__inner-${inner}__${shape}`),
      ),
    );

    expect(cases).toHaveLength(242);
    expect(cases.map(({ id }) => id).sort()).toEqual(expectedIds.sort());
  });

  it("uses a unique stable ID for every logical case", () => {
    const ids = readFixture().cases.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the unique-input and duplicate-case index consistent", () => {
    const fixture = readFixture();
    const casesByInput = new Map<string, NestingCase[]>();
    for (const testCase of fixture.cases) {
      const group = casesByInput.get(testCase.input) ?? [];
      group.push(testCase);
      casesByInput.set(testCase.input, group);
    }
    const duplicateCaseIdGroups = [...casesByInput.values()]
      .filter((group) => group.length > 1)
      .map((group) => group.map(({ id }) => id));

    expect(fixture.summary.logicalCaseCount).toBe(fixture.cases.length);
    expect(fixture.summary.uniqueInputCount).toBe(casesByInput.size);
    expect(fixture.summary.duplicateCaseIdGroups).toEqual(duplicateCaseIdGroups);
  });

  it("distinguishes structurally identical closing orders from other input aliases", () => {
    const fixture = readFixture();
    for (const testCase of fixture.cases) {
      const counterpart = fixture.cases.find(({ outer, inner, shape }) =>
        outer.matcherEntry === testCase.outer.matcherEntry
        && inner.matcherEntry === testCase.inner.matcherEntry
        && shape !== testCase.shape
      );
      if (counterpart === undefined) throw new Error(`missing shape counterpart for ${testCase.id}`);
      const closersCommute = testCase.outer.close + testCase.inner.close === testCase.inner.close + testCase.outer.close;

      expect(testCase.shapesIndistinguishable, testCase.id).toBe(closersCommute);
      expect(testCase.input === counterpart.input, testCase.id).toBe(closersCommute);
      expect(testCase.shapesIndistinguishableReason !== undefined, testCase.id).toBe(closersCommute);
    }

    const indistinguishableShapePairCount = fixture.cases.filter(({ shape, shapesIndistinguishable }) =>
      shape === "outer-first" && shapesIndistinguishable
    ).length;
    const casesByInput = groupCasesByInput(fixture.cases);
    const crossNamedPairInputCollisionCount = [...casesByInput.values()].filter((group) =>
      new Set(group.map(({ outer, inner }) => `${outer.matcherEntry}/${inner.matcherEntry}`)).size > 1
    ).length;
    expect(fixture.summary.indistinguishableShapePairCount).toBe(indistinguishableShapePairCount);
    expect(fixture.summary.crossNamedPairInputCollisionCount).toBe(crossNamedPairInputCollisionCount);
    for (const testCase of fixture.cases) {
      const aliases = casesByInput.get(testCase.input)?.filter(({ id }) => id !== testCase.id) ?? [];
      expect(testCase.inputCollision?.aliasCaseIds ?? [], testCase.id).toEqual(aliases.map(({ id }) => id));
      if (aliases.length > 0) {
        expect(testCase.inputCollision?.kind, testCase.id).toBe(
          testCase.shapesIndistinguishable ? "indistinguishable-shapes" : "cross-named-pair",
        );
      }
    }
  });

  it("records whether an expected node type can come from either named entry", () => {
    const fixture = readFixture();
    for (const testCase of fixture.cases) {
      const namedNodeTypes = new Set([
        ...matcherEntryNodeTypes[testCase.outer.matcherEntry],
        ...matcherEntryNodeTypes[testCase.inner.matcherEntry],
      ]);
      const exercisesNamedPair = expectedNodeTypes(testCase.expectedNodes)
        .some((type) => type !== "text" && namedNodeTypes.has(type));
      expect(testCase.exercisesNamedPair, testCase.id).toBe(exercisesNamedPair);
    }

    const exercisesNamedPairCount = fixture.cases.filter(({ exercisesNamedPair }) => exercisesNamedPair).length;
    expect(fixture.summary.exercisesNamedPairCount).toBe(exercisesNamedPairCount);
    expect(fixture.summary.doesNotExerciseNamedPairCount).toBe(fixture.cases.length - exercisesNamedPairCount);
  });

  it("keeps logical-case and unique-input classification totals separately", () => {
    const fixture = readFixture();
    const logicalCounts = countClassifications(fixture.cases.map(({ classification }) => classification), classifications);
    const uniqueInputClassifications: UniqueInputClassification[] = [...groupCasesByInput(fixture.cases).values()]
      .map((group) => {
        const groupClassifications = new Set(group.map(({ classification }) => classification));
        return groupClassifications.size === 1 ? group[0].classification : "mixed";
      });
    const uniqueCounts = countClassifications(uniqueInputClassifications, [...classifications, "mixed"]);

    expect(fixture.summary.logicalClassificationCounts).toEqual(logicalCounts);
    expect(fixture.summary.uniqueInputClassificationCounts).toEqual(uniqueCounts);
    expect(Object.values(logicalCounts).reduce((sum, count) => sum + count, 0)).toBe(242);
    expect(Object.values(uniqueCounts).reduce((sum, count) => sum + count, 0)).toBe(187);
  });

  it("keeps every explicit node type and exact range", () => {
    expectCurrentNestingCases(readFixture());
  });

  it("would fail when one explicit expected range changes", () => {
    const altered = structuredClone(readFixture());
    const firstNode = altered.cases.find(({ expectedNodes }) => expectedNodes.length > 0)?.expectedNodes[0];
    if (firstNode === undefined) throw new Error("fixture needs at least one expected node");
    firstNode.to += 1;

    expect(() => expectCurrentNestingCases(altered)).toThrowError(/expected/);
  });
});
