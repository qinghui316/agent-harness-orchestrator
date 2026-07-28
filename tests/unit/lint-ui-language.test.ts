import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintUiLanguage } from "../../scripts/lint-ui-language.mjs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("UI language lint", () => {
  it("rejects internal visible copy and raw identifiers", async () => {
    const root = await fixture({
      "src/web/src/Panel.tsx": `export const Panel = ({ item, taskId }) => <><button aria-label="Open Workpad">SchedulerRun</button><span>{item.taskRunId}</span><span>{taskId}</span><span>{"Plan mode"}</span></>;`,
    });
    const result = await lintUiLanguage(root);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.stringContaining("Workpad"),
      expect.stringContaining("SchedulerRun"),
      expect.stringContaining("taskRunId"),
      expect.stringContaining("taskId"),
      expect.stringContaining("Plan mode"),
    ]));
  });

  it("rejects nested visible expressions and same-scope raw identifier aliases", async () => {
    const root = await fixture({
      "src/web/src/Panel.tsx": `export function Panel({ item, ok, value }) {
        const id = item.taskId;
        const forwardedId = id;
        return <>
          <span>{\`Workpad \${value}\`}</span>
          <span>{ok ? "TaskQueue" : "完成"}</span>
          <span>{forwardedId}</span>
          <button aria-label={ok ? \`Open SchedulerRun \${value}\` : item.runId}>打开</button>
        </>;
      }`,
    });
    const violations = (await lintUiLanguage(root)).violations.join("\n");
    for (const term of ["Workpad", "TaskQueue", "forwardedId", "SchedulerRun", "runId"]) {
      expect(violations).toContain(term);
    }
  });

  it("checks user-copy presenter modules and the complete forbidden vocabulary", async () => {
    const root = await fixture({
      "src/web/src/action-labels.ts": `export function label() { return "Topic Change TaskRun WorkerLease blocked audit-blocked queue blocked Approval Inbox"; }`,
    });
    const violations = (await lintUiLanguage(root)).violations.join("\n");
    for (const term of ["Topic", "Change", "TaskRun", "WorkerLease", "blocked", "Approval Inbox"]) {
      expect(violations).toContain(term);
    }
  });

  it("allows raw terms only inside an explicit Diagnostics evidence subtree", async () => {
    const root = await fixture({
      "src/web/src/panels/workbench/RuntimeDiagnosticsDock.tsx": `export const Diagnostics = ({ raw }) => <><header>Workpad</header><div data-diagnostic-raw-evidence>SchedulerRun {raw.taskRunId}</div></>;`,
      "src/web/src/Panel.tsx": `export const Panel = ({ message }) => <><code>SchedulerRun claim</code><p>{message}</p></>;`,
    });
    const result = await lintUiLanguage(root);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("Workpad");
  });
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aho-ui-language-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return root;
}
