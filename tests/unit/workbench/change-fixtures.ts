import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeRawActiveChange(root: string, changeId: string, title: string): Promise<void> {
  const changeDir = join(root, "harness", "changes", "active", changeId);
  await mkdir(join(changeDir, "reviews"), { recursive: true });
  const now = new Date().toISOString();
  await writeFile(join(changeDir, "change.json"), JSON.stringify({
    version: "1.0",
    id: changeId,
    title,
    state: "active",
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    archivePath: null,
  }, null, 2), "utf8");
  await writeFile(join(changeDir, "summary.md"), `# ${title}\n\n## Status\n\nActive test fixture.\n`, "utf8");
  await writeFile(join(changeDir, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Complete one task-scoped change.\n", "utf8");
  await writeFile(join(changeDir, "plan.md"), "# Plan\n\nImplement this accepted task list.\n", "utf8");
  await writeFile(join(changeDir, "tasks.md"), "# Tasks\n\n- [ ] T-001: Implement one task.\n  - Covers: AC-001\n", "utf8");
  await writeFile(join(changeDir, "reviews", "review.md"), "Status: pending\n", "utf8");
}
