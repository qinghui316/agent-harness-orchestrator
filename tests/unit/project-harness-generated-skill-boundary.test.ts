import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ProviderTurnRequest } from "../../src/provider-runtime/contracts.js";

const runCodexAppServerTurn = vi.hoisted(() => vi.fn(async () => ({
  status: "completed" as const,
  threadId: "thread-coder",
  turnId: "turn-coder",
  lastMessageItemId: null,
  lastMessage: "done",
  planText: "",
  goal: null,
  childThreads: [],
  changedFiles: [],
  error: undefined,
})));

vi.mock("../../src/codex/app-server.js", () => ({
  getActiveCodexAppServerTurn: vi.fn(() => null),
  isCodexAppServerChildAvailable: vi.fn(() => false),
  listActiveCodexAppServerTurns: vi.fn(() => []),
  runCodexAppServerChildClose: vi.fn(),
  runCodexAppServerChildTurn: vi.fn(),
  runCodexAppServerTurn,
}));

import { runCodexTurn } from "../../src/provider-runtime/codex-adapter.js";

const scaffoldRoot = join(process.cwd(), "templates", "project-harness-skill");
const workflowStages = [
  "intake",
  "locate",
  "plan",
  "implement",
  "verify",
  "close",
  "integrate",
  "evolve",
  "bootstrap-project",
] as const;

describe("generated project Harness Skill execution boundary", () => {
  it("keeps one Change while Runtime exclusively owns task and worktree execution", async () => {
    const template = await read("SKILL.md.tpl");
    const generated = renderSkill(template, {
      SKILL_NAME: "sample-a1-harness",
      PROJECT_NAME: "Sample",
      PROJECT_ID: "sample-a1",
      MODE: "multi_lane",
      PROJECT_COMMAND: "aho harness project",
      CHANGE_COMMAND: "aho harness change",
      INTEGRATE_COMMAND: "aho harness integrate",
      EVOLVE_COMMAND: "aho harness evolve",
      KNOWLEDGE_COMMAND: "aho harness knowledge",
    });
    const normalized = generated.replace(/\s+/g, " ");

    expect(normalized).toContain("AHO Runtime is the only execution owner for multi-Agent coordination");
    expect(normalized).toContain("One Structured user goal maps to exactly one");
    expect(normalized).toContain("multiple AgentTasks and assigned worktrees");
    expect(normalized).toContain("a Workflow child never creates a child Change");
    expect(normalized).toContain("They never create a Change or Lane");
    expect(normalized).toContain("A model Worker must not invoke them to advance lifecycle state");
    expect(normalized).toContain("Registry baseline events and contracts");
    expect(normalized).toContain("The user confirms I2");
    expect(normalized).not.toContain("every repository mutation uses a Structured Change");
    expect(normalized).not.toContain("Its collaboration mode is `multi_lane`");
  });

  it("keeps every role on Runtime-supplied identities and lifecycle commands out of Workers", async () => {
    const workflows = await Promise.all(["intake", "locate", "plan", "implement", "verify", "close", "integrate", "bootstrap-project"]
      .map((stage) => read(join("references", "workflows", `${stage}.md`))));
    const combined = workflows.join("\n");

    expect(combined).toContain("Workflow children\n   inherit the Runtime-supplied Change and never create sub-Changes");
    expect(combined).toContain("without assigning Workers or worktrees");
    expect(combined).toContain("modify only the assigned checkout and scope");
    expect(combined).toContain("Auditor and Spec-Test Agents inspect Runtime-provided artifacts read-only");
    expect(combined).toContain("internal Workers do not\n  execute Close");
    expect(combined).toContain("Agents and Workers do not invoke Integration or worktree lifecycle commands");
    expect(combined).toContain("collaboration-mode metadata and\n  worktree count do not alter the Agent's search behavior");
    expect(combined).toContain("Runtime assigns the approved variant to an AHO Worker and its worktree");
    expect(combined).not.toContain("Treat every multi-Lane repository mutation as Structured");
    expect(combined).not.toContain("After Registry commit, verify and detach Codex/Claude");
    expect(combined).not.toContain("Create or reuse one Change");
    expect(combined).not.toContain("read its archived summary, create a new Change");
  });

  it("keeps all generated rule views exactly derived from red_lines.yaml", async () => {
    const source = JSON.parse(await read(join("references", "rules", "red_lines.yaml"))) as RuleSet;
    const critical = source.rules.filter((rule) => rule.severity === "critical");
    expect(await read(join("references", "rules", "critical.md")))
      .toBe(renderRules("Critical Harness Rules", critical));

    for (const stage of workflowStages) {
      const selected = source.rules.filter((rule) => rule.stages.includes("all") || rule.stages.includes(stage));
      expect(await read(join("references", "rules", "by-stage", `${stage}.md`)))
        .toBe(renderRules(`${stageTitle(stage)} Stage Rules`, selected));
    }
    expect(source.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "HR-02", title: "Keep One User Goal In One Change" }),
      expect.objectContaining({
        id: "HR-03",
        rule: expect.stringContaining("Runtime must publish an evidence-backed Registry contract"),
        on_violation: expect.stringContaining("return the contract proposal to Runtime"),
      }),
      expect.objectContaining({ id: "HR-14", title: "Keep Execution Ownership In Runtime" }),
      expect.objectContaining({ id: "HR-25", title: "Runtime Detaches Harness Links Before Worktree Removal" }),
    ]));
  });

  it("passes a physical Skill outside the coder worktree through the native Codex Skill input", async () => {
    runCodexAppServerTurn.mockClear();
    const root = await mkdtemp(join(tmpdir(), "aho-generated-skill-boundary-"));
    try {
      const projectRoot = join(root, "project");
      const coderWorktree = join(projectRoot, ".aho-worktrees", "task-coder");
      const physicalSkillPath = join(root, "physical-project-harness", "SKILL.md");
      await Promise.all([
        mkdir(coderWorktree, { recursive: true }),
        mkdir(join(root, "physical-project-harness"), { recursive: true }),
      ]);
      await writeFile(physicalSkillPath, [
        "---",
        "name: sample-a1-harness",
        "description: Test physical project Harness.",
        "---",
        "",
        "# Physical Harness Marker",
      ].join("\n"), "utf8");
      expect(isAbsolute(physicalSkillPath)).toBe(true);
      expect(physicalSkillPath.startsWith(coderWorktree)).toBe(false);
      await expect(readFile(physicalSkillPath, "utf8")).resolves.toContain("Physical Harness Marker");

      const request: ProviderTurnRequest = {
        providerId: "codex",
        operationProfile: "coder",
        projectId: "sample-a1",
        conversationId: "conversation-a1",
        changeId: "change-a1",
        runtimeScopeId: "graph-a1",
        roleId: "coder-agent",
        runId: "run-a1",
        attemptId: "attempt-a1",
        cwd: coderWorktree,
        prompt: "Read the project Harness marker.",
        sandboxPolicy: "workspace-write",
        paths: {
          events: join(projectRoot, "events.jsonl"),
          stderr: join(projectRoot, "stderr.log"),
          lastMessage: join(projectRoot, "last-message.md"),
          session: join(projectRoot, "session.json"),
        },
        skillInputs: [{
          id: "sample-a1-harness",
          path: physicalSkillPath,
          source: "project-harness",
          required: true,
          contentHash: "marker-hash",
        }],
      };

      await expect(runCodexTurn(request)).resolves.toMatchObject({ status: "completed" });
      expect(runCodexAppServerTurn).toHaveBeenCalledWith(expect.objectContaining({
        cwd: coderWorktree,
        skillInputs: [{ name: "sample-a1-harness", path: physicalSkillPath }],
      }));

      const appServerSource = await readFile(join(process.cwd(), "src", "codex", "app-server.ts"), "utf8");
      expect(appServerSource).toContain(".map((skill) => ({ type: \"skill\", ...skill }))");
      const coderSource = await readFile(join(process.cwd(), "src", "code", "provider-turn-runner.ts"), "utf8");
      expect(coderSource).toContain("cwd: input.worktree.checkoutPath");
      expect(coderSource).toContain("skillInputs: [input.projectHarnessSkillInput]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function read(relativePath: string): Promise<string> {
  return readFile(join(scaffoldRoot, relativePath), "utf8");
}

function renderSkill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (!value) throw new Error(`Missing test replacement: ${key}`);
    return value;
  });
}

interface Rule {
  id: string;
  severity: "critical" | "standard";
  stages: string[];
  title: string;
  rule: string;
  on_violation: string;
}

interface RuleSet {
  schema_version: "1.0";
  rules: Rule[];
}

function renderRules(title: string, rules: Rule[]): string {
  return [
    `# ${title}`,
    "",
    "> Generated from `red_lines.yaml`. Do not edit this file directly.",
    "",
    ...rules.flatMap((rule) => [
      `## ${rule.id}: ${rule.title}`,
      "",
      rule.rule,
      "",
      `**On violation:** ${rule.on_violation}`,
      "",
    ]),
  ].join("\n");
}

function stageTitle(stage: string): string {
  return stage.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
