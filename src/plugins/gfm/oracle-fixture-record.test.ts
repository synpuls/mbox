import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every GFM oracle fixture must record HOW it was obtained, not just what came
// back. Without the endpoint and the request shape, a reader cannot re-run the
// observation and check that it still holds -- and an observation nobody can
// repeat is not evidence. This guard exists because the fields were missing:
// the method lived only in the generating script, which is not what the tests
// read.
const fixturesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/gfm");

type OracleFixtureRecord = {
  source: string;
  method: string;
  markdown: string;
  html: string;
  fetchedAt: string;
  githubApiVersion: string | null;
};

const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith(".github.json"));

function readFixture(name: string): OracleFixtureRecord {
  return JSON.parse(readFileSync(resolve(fixturesDirectory, name), "utf8")) as OracleFixtureRecord;
}

describe("GFM oracle fixtures", () => {
  it("has at least one fixture to check", () => {
    expect(fixtureNames.length).toBeGreaterThan(0);
  });

  it.each(fixtureNames)("%s records the endpoint it was fetched from", (name) => {
    expect(readFixture(name).source).toBe("https://api.github.com/markdown");
  });

  it.each(fixtureNames)("%s records the request that produced it", (name) => {
    const { method } = readFixture(name);

    expect(method).toContain("POST https://api.github.com/markdown");
    expect(method).toContain('"mode": "gfm"');
    expect(method).toContain("unauthenticated");
  });

  it.each(fixtureNames)("%s records when it was fetched, as a parseable timestamp", (name) => {
    expect(Number.isNaN(Date.parse(readFixture(name).fetchedAt))).toBe(false);
  });

  it.each(fixtureNames)("%s records both the input and the observed output", (name) => {
    const fixture = readFixture(name);

    expect(fixture.markdown.length).toBeGreaterThan(0);
    expect(fixture.html.length).toBeGreaterThan(0);
  });
});
