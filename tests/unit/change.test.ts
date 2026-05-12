import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAcMap, parseAcceptanceCriteria, parseReviewStatus, parseTasks } from "../../src/ecl/anchors.js";
import { closeChange, createChange, getChangeStatus } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-change-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function project(path: string): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("change parsing", () => {
  it("parses and normalizes AC IDs", () => {
    const parsed = parseAcceptanceCriteria("- ac-001: First\n- AC-002: Second\n- AC-001: Duplicate");

    expect(parsed.criteria.map((item) => item.id)).toEqual(["AC-001", "AC-002", "AC-001"]);
    expect(parsed.duplicateIds).toEqual(["AC-001"]);
  });

  it("parses task AC mappings", () => {
    const parsed = parseTasks("- [ ] T-001: Do it\n  - Covers: ac-001, AC-002\n- [x] T-002: Done");

    expect(parsed.tasks[0]).toMatchObject({ id: "T-001", acIds: ["AC-001", "AC-002"], done: false });
    expect(parsed.tasks[1]).toMatchObject({ id: "T-002", acIds: [], done: true });
  });

  it("builds AC map warnings and blocking issues", () => {
    const map = buildAcMap({
      changeId: "demo",
      specContent: "- AC-001: Exists",
      tasksContent: "- [ ] T-001: Bad ref\n  - Covers: AC-999",
      placeholderFiles: [{ path: "plan.md", content: "TBD" }],
    });

    expect(map.blockingIssues).toContain("Task T-001 references unknown Acceptance Criterion AC-999.");
    expect(map.warnings).toContain("plan.md:1 unresolved placeholder: TBD");
  });

  it("parses review status", () => {
    expect(parseReviewStatus("Status: approved-with-notes\n")).toBe("approved-with-notes");
    expect(parseReviewStatus("\uFEFFStatus: approved\n")).toBe("approved");
    expect(parseReviewStatus("Status: not-required\n")).toBe("unknown");
    expect(parseReviewStatus(null)).toBe("missing");
  });
});

describe("change manager", () => {
  it("creates an active change and generated ac-map", async () => {
    await initHarness(project(tempDir));
    const result = await createChange(project(tempDir), { title: "Add Sample Workflow", body: "Raw user request" });

    expect(result.change.id).toBe("add-sample-workflow");
    expect(result.acMap.acceptanceCriteria[0]?.id).toBe("AC-001");
    expect(await readFile(join(tempDir, "harness", "changes", "active", "add-sample-workflow", "summary.md"), "utf8")).toContain("Raw user request");
  });

  it("falls back to bundled templates when target change templates are missing", async () => {
    await initHarness(project(tempDir));
    await rm(join(tempDir, "harness", "templates", "change"), { recursive: true, force: true });

    const result = await createChange(project(tempDir), { title: "Fallback Template" });

    expect(result.change.id).toBe("fallback-template");
    expect(result.acMap.acceptanceCriteria).toHaveLength(1);
  });

  it("aborts creating a second active change", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "First" });

    await expect(createChange(project(tempDir), { title: "Second" })).rejects.toThrow("active change");
  });

  it("blocks close while review is pending and archives when approved", async () => {
    await initHarness(project(tempDir));
    await createChange(project(tempDir), { title: "Closable" });

    await expect(closeChange(tempDir)).rejects.toThrow("Review status is pending");

    const reviewPath = join(tempDir, "harness", "changes", "active", "closable", "reviews", "review.md");
    await writeFile(reviewPath, "# Review\n\nStatus: approved\n", "utf8");
    const closed = await closeChange(tempDir);
    const status = await getChangeStatus(tempDir);

    expect(closed.archivePath).toMatch(/harness\/changes\/archive\/\d{8}-closable/);
    expect(status.activeChanges).toHaveLength(0);
  });

  it("uses archive collision suffix", async () => {
    await initHarness(project(tempDir));
    await mkdir(join(tempDir, "harness", "changes", "archive", `${localDate()}-collision`), { recursive: true });
    await createChange(project(tempDir), { title: "Collision" });
    await writeFile(join(tempDir, "harness", "changes", "active", "collision", "reviews", "review.md"), "Status: approved\n", "utf8");

    const closed = await closeChange(tempDir);

    expect(closed.archivePath).toMatch(/collision-\d{6}$/);
  });
});

function localDate(date = new Date()): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
