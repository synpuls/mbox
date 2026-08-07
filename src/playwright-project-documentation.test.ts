import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import playwrightConfig from "../playwright.config.js";

describe("layout-project documentation", () => {
  it("names every configured Playwright project in CONTRIBUTING.md", () => {
    const contributing = readFileSync(resolve(process.cwd(), "CONTRIBUTING.md"), "utf8");
    const projects = playwrightConfig.projects ?? [];

    expect(projects).not.toHaveLength(0);

    for (const project of projects) {
      expect(project.name, "each Playwright project must have a name").toBeTypeOf("string");

      if (typeof project.name === "string") {
        expect(
          contributing.toLocaleLowerCase(),
          `CONTRIBUTING.md must mention the ${project.name} layout project`,
        ).toContain(project.name.toLocaleLowerCase());
      }
    }
  });
});
