import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintDependencyCycles } from "../../scripts/lint-dependency-cycles.mjs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("dependency-cycle lint", () => {
  it("accepts an acyclic source graph", async () => {
    const root = await createFixture({
      "src/a.ts": 'import "./b.js";',
      "src/b.ts": "export const value = 1;",
    });
    expect((await lintDependencyCycles(root, { allowedRootCycles: [] })).violations).toEqual([]);
  });

  it("rejects every Web Client SCC and prints a concrete cycle path", async () => {
    const root = await createFixture({
      "src/web/src/a.ts": 'import "./b.js";',
      "src/web/src/b.ts": 'import "./a.js";',
    });
    const violations = (await lintDependencyCycles(root, { allowedRootCycles: [] })).violations;
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^Web Client cycle: src\/web\/src\/(?:a|b)\.ts -> src\/web\/src\/(?:a|b)\.ts -> src\/web\/src\/(?:a|b)\.ts$/);
  });

  it("rejects a new unregistered root SCC with its members", async () => {
    const root = await createFixture({
      "src/domain/a.ts": 'import "./b.js";',
      "src/domain/b.ts": 'import "./a.js";',
    });
    const violations = (await lintDependencyCycles(root, { allowedRootCycles: [] })).violations.join("\n");
    expect(violations).toContain("Unregistered source cycle:");
    expect(violations).toContain("src/domain/a.ts");
    expect(violations).toContain("src/domain/b.ts");
  });

  it("rejects expansion or membership drift in a registered SCC", async () => {
    const root = await createFixture({
      "src/domain/a.ts": 'import "./b.js";',
      "src/domain/b.ts": 'import "./c.js";',
      "src/domain/c.ts": 'import "./a.js";',
    });
    const violations = (await lintDependencyCycles(root, {
      allowedRootCycles: [["src/domain/a.ts", "src/domain/b.ts"]],
    })).violations.join("\n");
    expect(violations).toContain("Unregistered source cycle:");
    expect(violations).toContain("src/domain/c.ts");
    expect(violations).toContain("Registered cycle changed or disappeared: src/domain/a.ts -> src/domain/b.ts");
  });
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aho-dependency-cycle-lint-"));
  roots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return root;
}
