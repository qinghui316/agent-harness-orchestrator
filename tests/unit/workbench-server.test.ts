import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { startLocalCommandRun } from "../../src/run/manager.js";
import { TerminalRuntime } from "../../src/server/terminal/terminal-runtime.js";
import { buildNativeFolderDialogCommand, executeWorkbenchAction, startWorkbenchServer, type WorkbenchServerHandle } from "../../src/server/workbench-server.js";
import type { ManagedProject } from "../../src/types/index.js";
import { appendConversationThreadEntry, buildInitialMainAgentPrompt, buildProjectScopedMainAgentPrompt } from "../../src/workbench/chat.js";
import { validatePlanHandoffIntent } from "../../src/workbench/plan-handoff.js";
import type { WorkbenchLiveSink } from "../../src/workbench/types.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";

let tempDir: string;
let staticRoot: string;
let registryRoot: string;
let handle: WorkbenchServerHandle | null = null;
let originalCodexHome: string | undefined;
let originalAhoHome: string | undefined;
let serverConversationId: string;
const execFileAsync = promisify(execFile);

interface SnapshotResponse {
  left: { topics: Array<{ id: string }> };
  center: { agentLoop: { runs: Array<{ id: string }> } };
}

function project(): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path: tempDir,
    addedAt: "2026-05-15T00:00:00.000Z",
    lastSeenAt: "2026-05-15T00:00:00.000Z",
  };
}

async function fakeInitialMainAgentTurn(
  inputProject: ManagedProject,
  changeId: string,
  userMessage: string,
  live?: WorkbenchLiveSink,
) {
  live?.emit({ event: "run.status", data: { runId: "run-main-agent-initial-test", status: "running", label: "Codex" } });
  const entry = await appendConversationThreadEntry(inputProject, changeId, {
    type: "assistant.message",
    status: "main-agent-initial-turn",
    text: `主 Agent 已读取需求，下一步会先判断规划边界：${userMessage}`,
    runId: "run-main-agent-initial-test",
    artifact: ".agent-harness/runs/run-main-agent-initial-test/last-message.md",
    blocks: [{
      id: "main-agent-initial-test:prose",
      runId: "run-main-agent-initial-test",
      sequence: 1,
      kind: "prose",
      timestamp: "2026-05-15T00:00:00.000Z",
      source: "codex",
      text: `主 Agent 已读取需求，下一步会先判断规划边界：${userMessage}`,
    }],
  });
  live?.emit({ event: "topic.message", data: entry });
  return entry;
}

describe("workbench server", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-server-"));
    staticRoot = await mkdtemp(join(tmpdir(), "aho-web-"));
    registryRoot = await mkdtemp(join(tmpdir(), "aho-registry-"));
    originalCodexHome = process.env.CODEX_HOME;
    originalAhoHome = process.env.AHO_HOME;
    process.env.CODEX_HOME = join(tempDir, "codex-home");
    await writeFile(join(staticRoot, "index.html"), "<div>AHO</div>", "utf8");
    await initHarness(project());
    const conversation = await createConversationChangeFixture(project(), { title: "Server Topic" });
    serverConversationId = conversation.conversationId;
    await startLocalCommandRun(project(), [process.execPath, "-e", "console.log('server stream')"]);
    handle = await startWorkbenchServer({ project: project(), path: tempDir }, {
      port: 0,
      staticRoot,
      initialMainAgentTurn: fakeInitialMainAgentTurn,
    });
  });

  afterEach(async () => {
    if (handle) await new Promise<void>((resolve) => handle?.server.close(() => resolve()));
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    if (originalAhoHome === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = originalAhoHome;
    await rm(tempDir, { recursive: true, force: true });
    await rm(staticRoot, { recursive: true, force: true });
    await rm(registryRoot, { recursive: true, force: true });
  });

  it("serves workbench JSON routes and static index", async () => {
    const snapshot = await getJson<SnapshotResponse>(`${handle!.url}/api/workbench/snapshot`);
    expect(snapshot.left.topics[0]).toMatchObject({ id: serverConversationId, boundChangeId: "server-topic" });

    const topics = await getJson<unknown[]>(`${handle!.url}/api/workbench/topics`);
    expect(topics).toHaveLength(1);

    const stream = await getJson<{ events: Array<{ type: string }> }>(`${handle!.url}/api/workbench/stream/${snapshot.center.agentLoop.runs[0].id}`);
    expect(stream.events.some((event: { type: string }) => event.type === "run.completed")).toBe(true);

    const page = await fetch(`${handle!.url}/`);
    expect(await page.text()).toContain("AHO");
  });

  it("serves messages and replay through the bound conversation id", async () => {
    await appendConversationThreadEntry(project(), "server-topic", { type: "user.message", text: "Conversation route message." });

    const payload = await getJson<{ messages: Array<{ conversationId: string; changeId: string; text?: string }> }>(
      `${handle!.url}/api/projects/repo/workbench/topics/${serverConversationId}/messages`,
    );
    const conversationId = payload.messages[0]?.conversationId;
    expect(conversationId).toBe(serverConversationId);
    expect(payload.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ conversationId, changeId: "server-topic", text: "Conversation route message." }),
    ]));

    const replay = await fetch(`${handle!.url}/api/projects/repo/workbench/topics/${serverConversationId}/messages/stream`);
    expect(replay.ok).toBe(true);
    expect(await replay.text()).toContain(`"conversationId":"${conversationId}"`);
  });

  it("serves project Skill catalog and Codex bridge routes", async () => {
    const skillRoot = join(tempDir, "custom-skills");
    const skillDir = join(skillRoot, "pricing-helper");
    await mkdir(join(skillDir, "scripts"), { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: pricing-helper\ndescription: Pricing helper.\n---\n\n# Pricing\n", "utf8");
    await writeFile(join(skillDir, "scripts", "run.ps1"), "Write-Host skill\n", "utf8");

    const addedRoot = await fetch(`${handle!.url}/api/projects/repo/skill-roots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootPath: skillRoot }),
    });
    expect(addedRoot.ok).toBe(true);
    const listed = await getJson<{ roots: Array<{ rootPath: string }>; skills: Array<{ skillId: string; sourceKind: string; runtimeTargets: Array<{ provider: string; status: string }> }> }>(`${handle!.url}/api/projects/repo/skills`);
    expect(listed.roots.some((root) => root.rootPath === skillRoot)).toBe(true);
    const pricing = listed.skills.find((skill) => skill.skillId === "pricing-helper");
    const system = listed.skills.find((skill) => skill.skillId === "aho-harness-onboarding");
    expect(pricing).toMatchObject({ skillId: "pricing-helper", sourceKind: "custom" });
    expect(pricing?.runtimeTargets[0]).toMatchObject({ provider: "codex", status: "not-synced" });
    expect(system).toMatchObject({ skillId: "aho-harness-onboarding", sourceKind: "system-aho" });

    const enabled = await fetch(`${handle!.url}/api/projects/repo/skills/pricing-helper/enable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(enabled.ok).toBe(true);

    const synced = await fetch(`${handle!.url}/api/projects/repo/skills/codex-bridge/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(synced.ok).toBe(true);
    expect(existsSync(join(process.env.CODEX_HOME ?? "", "plugins", "aho-managed", "skills", "repo__pricing-helper", "scripts", "run.ps1"))).toBe(true);
  });

  it("serves safe project file search results for composer references", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(tempDir, "dist"), { recursive: true });
    await writeFile(join(tempDir, "src", "pricing.ts"), "export const price = 1;\n", "utf8");
    await writeFile(join(tempDir, "node_modules", "pkg", "index.js"), "module.exports = 1;\n", "utf8");
    await writeFile(join(tempDir, "dist", "bundle.js"), "console.log(1);\n", "utf8");

    const result = await getJson<{ files: Array<{ relativePath: string; kind: string; name: string }> }>(
      `${handle!.url}/api/projects/repo/files/search?q=src&limit=10`,
    );

    expect(result.files).toContainEqual(expect.objectContaining({ relativePath: "src", kind: "directory", name: "src" }));
    expect(result.files).toContainEqual(expect.objectContaining({ relativePath: "src/pricing.ts", kind: "file", name: "pricing.ts" }));
    expect(result.files.some((file) => file.relativePath.includes("node_modules"))).toBe(false);
    expect(result.files.some((file) => file.relativePath.startsWith("dist/"))).toBe(false);
  });

  it("stores composer attachments and binds them to the first topic message", async () => {
    const attachment = await fetch(`${handle!.url}/api/projects/repo/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "note.md",
        mediaType: "text/markdown",
        data: `data:text/markdown;base64,${Buffer.from("# Notes\nUse this context.\n", "utf8").toString("base64")}`,
      }),
    });
    expect(attachment.ok).toBe(true);
    const attachmentPayload = await attachment.json() as { attachment: { id: string; kind: string; fileName: string } };
    expect(attachmentPayload.attachment).toMatchObject({ kind: "text", fileName: "note.md" });

    const topicResponse = await fetch(`${handle!.url}/api/projects/repo/workbench/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Use attachment",
        body: "Please use the attached context.",
        attachmentIds: [attachmentPayload.attachment.id],
        confirm: true,
      }),
    });
    expect(topicResponse.ok).toBe(true);
    const topicPayload = await topicResponse.json() as { topic: { id: string; conversationId: string } };
    const messages = await getJson<{ messages: Array<{ type: string; attachments?: Array<{ id: string; fileName: string }> }> }>(
      `${handle!.url}/api/projects/repo/workbench/topics/${encodeURIComponent(topicPayload.topic.conversationId ?? topicPayload.topic.id)}/messages`,
    );
    const userMessage = messages.messages.find((message) => message.type === "user.message");
    expect(userMessage?.attachments).toContainEqual(expect.objectContaining({
      id: attachmentPayload.attachment.id,
      fileName: "note.md",
    }));
  });

  it("streams topic creation before the initial main-agent turn finishes", async () => {
    const live = await fetch(`${handle!.url}/api/projects/repo/workbench/topics/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Live topic", body: "请先判断下一步", confirm: true }),
    });

    expect(live.ok).toBe(true);
    expect(live.headers.get("content-type")).toContain("text/event-stream");
    const body = await live.text();
    expect(body).toContain("event: topic.created");
    expect(body).toContain("event: topic.message");
    expect(body).toContain("event: run.status");
    expect(body).toContain("event: snapshot");
    expect(body).toContain("event: done");
    const createdIndex = body.indexOf("event: topic.created");
    const userMessageIndex = body.indexOf("\"type\":\"user.message\"");
    const runStatusIndex = body.indexOf("event: run.status");
    expect(createdIndex).toBeGreaterThanOrEqual(0);
    expect(userMessageIndex).toBeGreaterThan(createdIndex);
    expect(runStatusIndex).toBeGreaterThan(userMessageIndex);
  });

  it("keeps the initial main-agent prompt user-facing", () => {
    const prompt = buildInitialMainAgentPrompt("请更新 message.txt，让测试通过");

    expect(prompt).toContain("请更新 message.txt，让测试通过");
    expect(prompt).toContain("正常开发助理");
    expect(prompt).not.toContain("Harness gate");
    expect(prompt).not.toContain("canonical artifacts");
    expect(prompt).not.toContain("AC-001");
    expect(prompt).not.toContain("TBD");
    expect(prompt).not.toContain("Change id");
    expect(prompt).not.toContain("TaskRun");
    expect(prompt).not.toContain("WorkflowRun");
    expect(prompt).not.toContain("planning-agent");
  });

  it("requires project-scoped parent turns to use a real workflow-authoring child", () => {
    const prompt = buildProjectScopedMainAgentPrompt(
      "请让计划子 Agent 生成计划",
      undefined,
      "# Transient AHO System Skill Context\n\n## aho-workflow-authoring: SKILL.md\n\nfixed contract",
    );

    expect(prompt).toContain("MUST use the real spawn_agent collaboration tool");
    expect(prompt).toContain("$aho-workflow-authoring");
    expect(prompt).toContain("do not create one for every ordinary conversation");
    expect(prompt).toContain("call native update_goal(complete) only when the objective is actually satisfied");
    expect(prompt).toContain("Include that complete contract in the planner child prompt");
    expect(prompt).toContain("## aho-workflow-authoring: SKILL.md");
    expect(prompt).toContain("Only native runtime tool/Plan/question events count as child-Agent or planning-session work");
    expect(prompt).toContain("Do not fall back to Plan Mode, codex exec, or fabricated child output");
    expect(prompt).toContain("read project guidance, enabled skills, and docs");
    expect(prompt).toContain("use available tools according to the project rules");
    expect(prompt).toContain("Do not assume Workbench will create Harness records or execute the plan for you");
    expect(prompt).toContain("Do not invoke the aho CLI from the shell");
    expect(prompt).not.toContain("wait for the user or an explicit workflow action");
    expect(prompt).toContain("请让计划子 Agent 生成计划");
  });

  it("adds project-rule routing context for validated plan handoff turns", () => {
    const handoff = validatePlanHandoffIntent([{
      id: "assistant:conv:run-plan:planning-agent",
      type: "assistant.message",
      timestamp: "2026-07-07T00:00:00.000Z",
      conversationId: "conv-plan",
      changeId: "",
      runId: "run-plan",
      agentRoleId: "planning-agent",
      text: "1. 修改 UI\n2. 补测试",
      artifact: "conversation-runs/conv-plan/run-plan/planner-proposal.json",
    }], {
      sourceRunId: "run-plan",
      sourceAgentRoleId: "planning-agent",
      kind: "execute-plan",
    });
    const prompt = buildProjectScopedMainAgentPrompt("请主 Agent 基于当前计划继续判断执行路径。", handoff);

    expect(prompt).toContain("visible Plan handoff card");
    expect(prompt).toContain("AGENTS.md, docs/ECL.md");
    expect(prompt).toContain("harness/changes/active");
    expect(prompt).toContain("docs/STATUS.md");
    expect(prompt).toContain("not as execution authorization");
    expect(prompt).toContain("execute-plan");
    expect(prompt).toContain("1. 修改 UI");
  });

  it("rejects forged or unsupported plan handoff sources", () => {
    expect(() => validatePlanHandoffIntent([], {
      sourceRunId: "missing-run",
      sourceAgentRoleId: "planning-agent",
      kind: "execute-plan",
    })).toThrow(/stale or unavailable/);
    expect(() => validatePlanHandoffIntent([{
      id: "assistant:conv:run-plan:main",
      type: "assistant.message",
      timestamp: "2026-07-07T00:00:00.000Z",
      conversationId: "conv-plan",
      changeId: "",
      runId: "run-plan",
      agentRoleId: "main-agent",
      text: "not a plan session",
    }], {
      sourceRunId: "run-plan",
      sourceAgentRoleId: "planning-agent",
      kind: "execute-plan",
    })).toThrow(/stale or unavailable/);
  });

  it("rejects composer attachment uploads before project preparation", async () => {
    const memory = await resolveProjectMemory(project());
    await rm(memory.markerPath, { force: true });

    const attachment = await fetch(`${handle!.url}/api/projects/repo/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: "note.md",
        mediaType: "text/markdown",
        data: `data:text/markdown;base64,${Buffer.from("# Notes\n", "utf8").toString("base64")}`,
      }),
    });

    expect(attachment.status).toBe(400);
    expect(await attachment.text()).toContain("Project must be prepared before attaching files.");
  });

  it("serves safe file tree children and read-only previews for the right rail files tab", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await mkdir(join(tempDir, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(tempDir, "src", "pricing.ts"), "export const price = 1;\n", "utf8");
    await writeFile(join(tempDir, "node_modules", "pkg", "index.js"), "module.exports = 1;\n", "utf8");

    const rootTree = await getJson<{ entries: Array<{ relativePath: string; kind: string; name: string }> }>(
      `${handle!.url}/api/projects/repo/files/children`,
    );
    expect(rootTree.entries).toContainEqual(expect.objectContaining({ relativePath: "src", kind: "directory", name: "src" }));
    expect(rootTree.entries.some((entry) => entry.relativePath.includes("node_modules"))).toBe(false);

    const srcTree = await getJson<{ path: string; parentPath: string | null; entries: Array<{ relativePath: string; kind: string; name: string }> }>(
      `${handle!.url}/api/projects/repo/files/children?path=src`,
    );
    expect(srcTree.path).toBe("src");
    expect(srcTree.parentPath).toBe("");
    expect(srcTree.entries).toContainEqual(expect.objectContaining({ relativePath: "src/pricing.ts", kind: "file", name: "pricing.ts" }));

    const preview = await getJson<{ path: string; status: string; content?: string }>(
      `${handle!.url}/api/projects/repo/files/preview?path=src%2Fpricing.ts`,
    );
    expect(preview).toMatchObject({ path: "src/pricing.ts", status: "text", content: "export const price = 1;\n" });
  });

  it("serves read-only Git status and diff for the right rail Git tab", async () => {
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "src", "pricing.ts"), "export const price = 1;\n", "utf8");
    await runGit("init");
    await runGit("config", "user.email", "aho@example.test");
    await runGit("config", "user.name", "AHO Test");
    await runGit("add", "-A");
    await runGit("commit", "-m", "baseline");
    await writeFile(join(tempDir, "src", "pricing.ts"), "export const price = 2;\nexport const discount = true;\n", "utf8");
    await writeFile(join(tempDir, "src", "staged.ts"), "export const staged = true;\n", "utf8");
    await writeFile(join(tempDir, "src", "untracked.ts"), "export const untracked = true;\n", "utf8");
    await runGit("add", "src/staged.ts");

    const status = await getJson<{
      isGitRepository: boolean;
      branch: string | null;
      staged: Array<{ relativePath: string; statusLabel: string }>;
      unstaged: Array<{ relativePath: string; additions?: number }>;
      untracked: Array<{ relativePath: string }>;
    }>(`${handle!.url}/api/projects/repo/git/status`);
    expect(status.isGitRepository).toBe(true);
    expect(status.branch).toBeTruthy();
    expect(status.staged).toContainEqual(expect.objectContaining({ relativePath: "src/staged.ts", statusLabel: "新增" }));
    expect(status.unstaged).toContainEqual(expect.objectContaining({ relativePath: "src/pricing.ts" }));
    expect(status.untracked).toContainEqual(expect.objectContaining({ relativePath: "src/untracked.ts" }));

    const diff = await getJson<{ status: string; relativePath: string; sections: Array<{ patch: string }> }>(
      `${handle!.url}/api/projects/repo/git/diff?path=src%2Fpricing.ts`,
    );
    expect(diff).toMatchObject({ status: "text", relativePath: "src/pricing.ts" });
    expect(diff.sections[0]?.patch).toContain("export const price = 2;");

    const unsafe = await getJson<{ status: string; message: string }>(
      `${handle!.url}/api/projects/repo/git/diff?path=..%2Foutside.ts`,
    );
    expect(unsafe.status).toBe("not-found");
    expect(unsafe.message).toContain("安全范围");

    const history = await getJson<{
      status: string;
      commits: Array<{ sha: string; shortSha: string; summary: string; additions: number; deletions: number }>;
    }>(`${handle!.url}/api/projects/repo/git/history?limit=10&offset=0&query=baseline`);
    expect(history.status).toBe("ok");
    expect(history.commits[0]).toMatchObject({ summary: "baseline" });
    expect(history.commits[0]?.additions).toBeGreaterThan(0);

    const sha = history.commits[0]!.sha;
    const detail = await getJson<{
      status: string;
      sha: string;
      summary: string;
      files: Array<{ relativePath: string; status: string; additions: number; deletions: number }>;
    }>(`${handle!.url}/api/projects/repo/git/commit?sha=${encodeURIComponent(sha)}`);
    expect(detail).toMatchObject({ status: "ok", sha, summary: "baseline" });
    expect(detail.files).toContainEqual(expect.objectContaining({ relativePath: "src/pricing.ts", status: "A" }));

    const commitDiff = await getJson<{ status: string; relativePath: string; patch: string; additions: number }>(
      `${handle!.url}/api/projects/repo/git/commit-diff?sha=${encodeURIComponent(sha)}&path=src%2Fpricing.ts`,
    );
    expect(commitDiff).toMatchObject({ status: "text", relativePath: "src/pricing.ts" });
    expect(commitDiff.patch).toContain("+export const price = 1;");

    const badSha = await getJson<{ status: string; message: string }>(
      `${handle!.url}/api/projects/repo/git/commit?sha=not-a-sha`,
    );
    expect(badSha.status).toBe("not-found");
  });

  it("opens project-scoped terminal sessions through the TerminalRuntime owner", async () => {
    const fakePty = new FakePty();
    const terminalRuntime = new TerminalRuntime({
      loadPty: async () => ({
        spawn: (_shell: string, _args: string[], options: { cwd?: string; cols?: number; rows?: number }) => {
          fakePty.cwd = options.cwd ?? "";
          fakePty.cols = options.cols ?? 0;
          fakePty.rows = options.rows ?? 0;
          return fakePty;
        },
      }) as unknown as typeof import("node-pty"),
    });
    const appHandle = await startWorkbenchServer({ project: project(), path: tempDir }, { port: 0, staticRoot, terminalRuntime });
    try {
      const opened = await fetch(`${appHandle.url}/api/projects/repo/terminal/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "term-1", cols: 90, rows: 30 }),
      });
      expect(opened.ok).toBe(true);
      expect(fakePty.cwd).toBe(tempDir);
      expect(fakePty.cols).toBe(90);
      expect(fakePty.rows).toBe(30);

      const received: string[] = [];
      const unsubscribe = terminalRuntime.subscribe("repo", "term-1", (event) => {
        if (event.type === "output") received.push(event.data);
      });
      fakePty.emitData("hello terminal");
      unsubscribe();
      expect(received).toEqual(["hello terminal"]);

      const write = await fetch(`${appHandle.url}/api/projects/repo/terminal/sessions/term-1/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "pwd\r" }),
      });
      expect(write.ok).toBe(true);
      expect(fakePty.writes).toContain("pwd\r");

      const resized = await fetch(`${appHandle.url}/api/projects/repo/terminal/sessions/term-1/resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols: 120, rows: 40 }),
      });
      expect(resized.ok).toBe(true);
      expect(fakePty.resizeCalls).toContainEqual({ cols: 120, rows: 40 });

      const closed = await fetch(`${appHandle.url}/api/projects/repo/terminal/sessions/term-1`, { method: "DELETE" });
      expect(closed.ok).toBe(true);
      expect(fakePty.killed).toBe(true);
    } finally {
      await new Promise<void>((resolve) => appHandle.server.close(() => resolve()));
    }
  });

  it("returns a readable degraded response when PTY is unavailable", async () => {
    const terminalRuntime = new TerminalRuntime({
      loadPty: async () => {
        throw new Error("native module missing");
      },
    });
    const appHandle = await startWorkbenchServer({ project: project(), path: tempDir }, { port: 0, staticRoot, terminalRuntime });
    try {
      const opened = await fetch(`${appHandle.url}/api/projects/repo/terminal/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: "term-missing" }),
      });
      expect(opened.status).toBe(503);
      expect(await opened.text()).toContain("Terminal runtime is unavailable");
    } finally {
      await new Promise<void>((resolve) => appHandle.server.close(() => resolve()));
    }
  });

  it("returns HTTP diagnostics for unsupported API and action requests", async () => {
    const missing = await fetch(`${handle!.url}/api/not-found`);
    expect(missing.status).toBe(404);

    const unconfirmed = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
      }),
    });
    expect(unconfirmed.status).toBe(409);

    const unknown = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: { actionId: "unknown", label: "Unknown", command: "bad", args: [], mutates: true, requiresConfirmation: true },
        confirm: true,
      }),
    });
    expect(unknown.status).toBe(400);

    const invalidJson = await fetch(`${handle!.url}/api/workbench/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalidJson.status).toBe(400);
  });

  it("streams live endpoint errors as SSE without changing replay endpoints", async () => {
    const live = await fetch(`${handle!.url}/api/workbench/actions/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType: "validate.run", changeId: "server-topic", confirm: true }),
    });
    expect(live.ok).toBe(true);
    expect(live.headers.get("content-type")).toContain("text/event-stream");
    const body = await live.text();
    expect(body).toContain("event: error");
    expect(body).toContain("is not supported by the live endpoint");
    expect(body).toContain("event: done");
    const errorIndex = body.indexOf("event: error");
    const snapshotIndex = body.indexOf("event: snapshot");
    const doneIndex = body.indexOf("event: done");
    expect(errorIndex).toBeGreaterThanOrEqual(0);
    expect(snapshotIndex).toBeGreaterThan(errorIndex);
    expect(doneIndex).toBeGreaterThan(snapshotIndex);

    const snapshot = await getJson<SnapshotResponse>(`${handle!.url}/api/workbench/snapshot`);
    const replay = await fetch(`${handle!.url}/api/workbench/stream/${snapshot.center.agentLoop.runs[0].id}`);
    const replayBody = await replay.json() as { live: boolean };
    expect(replayBody.live).toBe(false);
  });

  it("forwards scoped workflow targets through the live endpoint", async () => {
    const live = await fetch(`${handle!.url}/api/workbench/actions/live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actionType: "post-merge.prepare",
        changeId: "server-topic",
        landingPackageId: "landing-server",
        remoteLandingResultId: "remote-landing-server",
        confirm: true,
      }),
    });
    expect(live.ok).toBe(true);
    const body = await live.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("requires landingPackageId");
    expect(body).not.toContain("requires remoteLandingResultId");
  });

  it("rejects unknown and unconfirmed actions", async () => {
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      action: { actionId: "unknown", label: "Unknown", command: "bad", args: [], mutates: true, requiresConfirmation: true },
      confirm: true,
    })).rejects.toThrow("Unknown");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      action: { actionId: "change.close", label: "Close", command: "change", args: ["close", "repo"], mutates: true, requiresConfirmation: true },
    })).rejects.toThrow("confirm");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      changeId: "server-topic",
    })).rejects.toThrow("confirm");
  });

  it("fails closed for missing demand scope and stale workflow targets", async () => {
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      confirm: true,
    })).rejects.toThrow("requires changeId");

    const missingTarget = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "validate.run",
      changeId: "server-topic",
      confirm: true,
    });
    expect(JSON.stringify(missingTarget.result)).toContain("requires worktreeId");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "landing-queue.merge-next",
      changeId: "server-topic",
      landingPackageId: "forged-landing-package",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

  });

  it("serves lazy Workbench projections separately from the snapshot shell", async () => {
    const snapshot = await getJson<SnapshotResponse & { center: { agentRunGraph: { nodes: unknown[] }; agentLoop: { runs: Array<{ id: string }> } } }>(`${handle!.url}/api/workbench/snapshot?topic=${serverConversationId}`);
    expect(snapshot.center.agentRunGraph.nodes).toEqual([]);

    const transcript = await getJson<{ cells: unknown[] }>(`${handle!.url}/api/workbench/projections/transcript/${serverConversationId}`);
    expect(Array.isArray(transcript.cells)).toBe(true);

    const pagedTranscript = await getJson<{ cells: unknown[]; paging?: { limit: number; totalCount: number; hasMoreBefore: boolean } }>(`${handle!.url}/api/workbench/projections/transcript/${serverConversationId}?limit=2`);
    expect(Array.isArray(pagedTranscript.cells)).toBe(true);
    expect(pagedTranscript.paging?.limit).toBe(2);
    expect(typeof pagedTranscript.paging?.totalCount).toBe("number");

    const graph = await getJson<{ nodes: Array<{ id: string }> }>(`${handle!.url}/api/workbench/projections/run-graph/${serverConversationId}`);
    expect(graph.nodes.some((node) => node.id === "main-agent")).toBe(true);
  });

  it("serves app-level project onboarding routes", async () => {
    const store = new ProjectRegistryStore(registryRoot);
    const appHandle = await startWorkbenchServer(null, {
      port: 0,
      staticRoot,
      store,
      initialMainAgentTurn: fakeInitialMainAgentTurn,
    });
    try {
      const status = await getJson<{ mode: string }>(`${appHandle.url}/api/app/status`);
      expect(status.mode).toBe("app");

      const unconfirmed = await fetch(`${appHandle.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tempDir }),
      });
      expect(unconfirmed.status).toBe(409);

      const added = await fetch(`${appHandle.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tempDir, name: "Server Repo", confirm: true }),
      });
      expect(added.ok).toBe(true);
      const addedBody = await added.json() as { project: { id: string } };

      const projectTopic = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/workbench/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Project scoped topic", body: "Keep route behavior", confirm: true }),
      });
      expect(projectTopic.ok).toBe(true);
      const projectTopicBody = await projectTopic.json() as { topic: { id: string; conversationId: string } };
      const projectTopicId = projectTopicBody.topic.conversationId ?? projectTopicBody.topic.id;
      const projectMessages = await getJson<{ messages: Array<{ type: string; status?: string; runId?: string; artifact?: string; text?: string }> }>(
        `${appHandle.url}/api/projects/${addedBody.project.id}/workbench/topics/${projectTopicId}/messages`,
      );
      expect(projectMessages.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "user.message",
          text: "Keep route behavior",
        }),
      ]));
      const projectTranscript = await getJson<{ cells: Array<{ kind: string; text?: string }> }>(
        `${appHandle.url}/api/projects/${addedBody.project.id}/workbench/projections/transcript/${projectTopicId}?limit=100`,
      );
      expect(Array.isArray(projectTranscript.cells)).toBe(true);
      await appendConversationThreadEntry({ ...project(), id: addedBody.project.id, name: "Server Repo" }, "server-topic", {
        type: "workflow.completed",
        actionRunId: "action-private-path",
        actionType: "code.run",
        status: "failed",
        error: `ENOENT: no such file or directory, open '${join(tempDir, ".agent-harness", "workbench", "private.json")}'`,
      });

      const directTopic = await fetch(`${handle!.url}/api/workbench/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Direct topic", body: "Direct route remains unsupported", confirm: true }),
      });
      expect(directTopic.status).toBe(404);

      const projects = await getJson<{ projects: Array<{ codexTrust: { trusted: boolean; projectKey: string } }> }>(`${appHandle.url}/api/projects`);
      expect(projects.projects).toHaveLength(1);
      expect(projects.projects[0].codexTrust.trusted).toBe(false);
      expect(projects.projects[0].codexTrust.projectKey).toContain("aho-server-");

      const diagnostics = await getJson<{ provider: string; configPath: string; projectTrust: { trusted: boolean }; errors: string[] }>(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/diagnostics`);
      expect(diagnostics.provider).toBe("codex");
      expect(diagnostics.configPath).toContain("codex-home");
      expect(diagnostics.projectTrust.trusted).toBe(false);
      expect(Array.isArray(diagnostics.errors)).toBe(true);
      expect(existsSync(diagnostics.configPath)).toBe(false);

      const modelSettings = await getJson<{ effectiveModel: string | null; effectiveModelSource: string; configPath: string; candidates: unknown[]; modelList: { candidates: unknown[] } }>(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/models`);
      expect(modelSettings.effectiveModelSource).toBe("codex-default");
      expect(modelSettings.configPath).toContain("codex-home");
      expect(Array.isArray(modelSettings.candidates)).toBe(true);
      expect(Array.isArray(modelSettings.modelList.candidates)).toBe(true);

      const capabilities = await getJson<{
        providers: Array<{ providerId: string; productMode: string; runnable: boolean; snapshotHash: string; snapshotVersion: number; capabilities: Array<{ key: string; spec: string; runtime: string }> }>;
        runtimeSummaries: Array<{ providerId: string; productMode: string; harnessExecutionModes: string[]; snapshot: { providerId: string; productMode: string } }>;
      }>(
        `${appHandle.url}/api/projects/${addedBody.project.id}/providers/capabilities`,
      );
      expect(capabilities.providers).toHaveLength(1);
      expect(capabilities.providers[0]).toMatchObject({ providerId: "codex", productMode: "harness" });
      expect(typeof capabilities.providers[0].runnable).toBe("boolean");
      expect(capabilities.providers[0].snapshotHash).toBeTruthy();
      expect(capabilities.providers[0].snapshotVersion).toBe(2);
      expect(capabilities.providers[0].capabilities).toContainEqual(expect.objectContaining({ key: "model.list", spec: "supported" }));
      expect(capabilities.providers[0].capabilities.some((item) => item.key === "skills")).toBe(true);
      expect(capabilities.runtimeSummaries).toHaveLength(1);
      expect(capabilities.runtimeSummaries[0]).toMatchObject({
        providerId: "codex",
        productMode: "harness",
        harnessExecutionModes: ["stepwise", "scoped-auto"],
        snapshot: { providerId: "codex", productMode: "harness" },
      });

      const runtimeActivity = await getJson<{
        projectId: string;
        limit: number;
        truncated: boolean;
        items: Array<{ type: string; title: string; summary: string; details?: string[]; refs: unknown[] }>;
      }>(
        `${appHandle.url}/api/projects/${addedBody.project.id}/runtime/activity?limit=20`,
      );
      const defaultRuntimeActivityText = runtimeActivity.items.map((item) => [item.title, item.summary, ...(item.details ?? [])].join("\n")).join("\n");
      expect(runtimeActivity.projectId).toBe(addedBody.project.id);
      expect(runtimeActivity.limit).toBe(20);
      expect(typeof runtimeActivity.truncated).toBe("boolean");
      expect(runtimeActivity.items.length).toBeGreaterThan(0);
      expect(runtimeActivity.items.some((item) => item.type === "provider" && item.title.includes("Codex"))).toBe(true);
      expect(JSON.stringify(runtimeActivity)).not.toContain("config.toml");
      expect(JSON.stringify(runtimeActivity)).not.toContain("stdout");
      expect(defaultRuntimeActivityText).not.toContain(tempDir);
      expect(defaultRuntimeActivityText).not.toContain(".agent-harness");
      expect(runtimeActivity.items.some((item) => item.type === "action-error" && item.summary.includes("路径已折叠"))).toBe(true);

      const unconfirmedTrust = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(unconfirmedTrust.status).toBe(409);

      const trusted = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/codex/trust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      expect(trusted.ok).toBe(true);
      const trustedBody = await trusted.json() as { codexTrust: { trusted: boolean; projectKey: string } };
      expect(trustedBody.codexTrust.trusted).toBe(true);
      const config = await readFile(join(tempDir, "codex-home", "config.toml"), "utf8");
      expect(config).toContain(`[projects.'${trustedBody.codexTrust.projectKey}']`);
      expect(config).toContain('trust_level = "trusted"');

      const init = await fetch(`${appHandle.url}/api/projects/${addedBody.project.id}/harness/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryMode: "external-local" }),
      });
      expect(init.status).toBe(409);

      const created = await fetch(`${appHandle.url}/api/projects/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath: registryRoot, name: "created-repo", git: false, readme: true, initialCommit: false, confirm: true }),
      });
      expect(created.ok).toBe(true);
      const createdBody = await created.json() as { createdPath: string };
      expect(createdBody.createdPath).toContain("created-repo");

      const dialog = await fetch(`${appHandle.url}/api/dialog/open-folder`, {
        method: "POST",
        headers: { Origin: "https://example.com" },
      });
      expect(dialog.status).toBe(403);
    } finally {
      await new Promise<void>((resolve) => appHandle.server.close(() => resolve()));
    }
  });

  it("restores an unregistered direct external-local project from marker and AHO_HOME", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-src-"));
    const ahoHome = await mkdtemp(join(tmpdir(), "aho-external-home-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-home"));
    const directProject: ManagedProject = {
      id: "external-repo",
      name: "External Repo",
      path: sourceRoot,
      addedAt: "2026-06-25T00:00:00.000Z",
      lastSeenAt: "2026-06-25T00:00:00.000Z",
    };
    process.env.AHO_HOME = ahoHome;
    await initHarness(directProject, { memoryMode: "external-local" });
    await createChange(directProject, { title: "Restored Topic" });

    const directHandle = await startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store });
    try {
      const status = await getJson<{ mode: string; directProjectId: string | null }>(`${directHandle.url}/api/app/status`);
      expect(status).toMatchObject({ mode: "project", directProjectId: "external-repo" });

      const projects = await getJson<{ projects: Array<{ project: { id: string; name: string } | null; memory: { registered: boolean; memoryMode: string; memoryAvailable: boolean; harnessReady: boolean } }> }>(`${directHandle.url}/api/projects`);
      expect(projects.projects).toHaveLength(1);
      expect(projects.projects[0]).toMatchObject({
        project: { id: "external-repo", name: basename(sourceRoot) },
        memory: { registered: false, memoryMode: "external-local", memoryAvailable: true, harnessReady: true },
      });
      expect(await store.listProjects()).toHaveLength(0);

      const saved = await fetch(`${directHandle.url}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sourceRoot, name: "External Repo", confirm: true }),
      });
      expect(saved.ok).toBe(true);
      expect(await store.listProjects()).toHaveLength(1);

      const snapshot = await getJson<SnapshotResponse>(`${directHandle.url}/api/projects/external-repo/workbench/snapshot`);
      expect(snapshot.left.topics[0]).toMatchObject({ id: "restored-topic" });
    } finally {
      await new Promise<void>((resolve) => directHandle.server.close(() => resolve()));
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(ahoHome, { recursive: true, force: true });
    }
  });

  it("reports missing external-local memory for a restored direct project", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-missing-src-"));
    const ahoHome = await mkdtemp(join(tmpdir(), "aho-external-missing-home-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-missing-home"));
    process.env.AHO_HOME = ahoHome;
    await writeMarker(sourceRoot, "missing-memory-repo", "Missing Memory Repo");

    const directHandle = await startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store });
    try {
      const projects = await getJson<{ projects: Array<{ project: { id: string } | null; memory: { memoryMode: string; memoryAvailable: boolean; harnessReady: boolean; roots: { memoryRoot: string } } }> }>(`${directHandle.url}/api/projects`);
      expect(projects.projects[0]).toMatchObject({
        project: { id: "missing-memory-repo" },
        memory: { memoryMode: "external-local", memoryAvailable: false, harnessReady: false },
      });
      expect(projects.projects[0].memory.roots.memoryRoot).toContain("missing-memory-repo");

      const snapshot = await getJson<{ warnings: string[]; left: { topics: unknown[] } }>(`${directHandle.url}/api/projects/missing-memory-repo/workbench/snapshot`);
      expect(snapshot.left.topics).toHaveLength(0);
      expect(snapshot.warnings).toContain("Durable memory is unavailable. AHO will not infer project history.");
    } finally {
      await new Promise<void>((resolve) => directHandle.server.close(() => resolve()));
      await rm(sourceRoot, { recursive: true, force: true });
      await rm(ahoHome, { recursive: true, force: true });
    }
  });

  it("fails closed when direct marker id is registered to another path", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "aho-external-src-"));
    const otherRoot = await mkdtemp(join(tmpdir(), "aho-external-other-"));
    const store = new ProjectRegistryStore(join(registryRoot, "restore-conflict-home"));
    await writeMarker(sourceRoot, "external-repo", "External Repo");
    await writeMarker(otherRoot, "external-repo", "External Repo");
    await store.addProject(otherRoot);

    await expect(startWorkbenchServer({ project: null, path: sourceRoot }, { port: 0, staticRoot, store }))
      .rejects.toThrow("Project marker id is already registered for a different path");

    await rm(sourceRoot, { recursive: true, force: true });
    await rm(otherRoot, { recursive: true, force: true });
  });

  it("builds native folder dialog commands with fixed argv", () => {
    const windows = buildNativeFolderDialogCommand("win32");
    expect(windows?.command).toBe("powershell.exe");
    expect(windows?.args).toContain("-Sta");
    expect(windows?.args.join(" ")).toContain("FolderBrowserDialog");

    const mac = buildNativeFolderDialogCommand("darwin");
    expect(mac).toMatchObject({ command: "osascript" });

    const linux = buildNativeFolderDialogCommand("linux");
    expect(linux).toMatchObject({ command: "zenity" });

    expect(buildNativeFolderDialogCommand("freebsd")).toBeNull();
  });
});

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return response.json() as Promise<T>;
}

class FakePty {
  cwd = "";
  cols = 0;
  rows = 0;
  writes: string[] = [];
  resizeCalls: Array<{ cols: number; rows: number }> = [];
  killed = false;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListeners.push(listener);
    return { dispose: () => { this.dataListeners = this.dataListeners.filter((item) => item !== listener); } };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose: () => void } {
    this.exitListeners.push(listener);
    return { dispose: () => { this.exitListeners = this.exitListeners.filter((item) => item !== listener); } };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows });
  }

  kill(): void {
    this.killed = true;
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }
}

async function runGit(...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: tempDir });
}

async function writeMarker(projectPath: string, id: string, name: string): Promise<void> {
  await mkdir(join(projectPath, ".agent-harness"), { recursive: true });
  await writeFile(join(projectPath, ".agent-harness", "project.json"), JSON.stringify({
    version: "1.0",
    id,
    name,
    managedBy: "agent-harness-orchestrator",
    memoryMode: "external-local",
    createdAt: "2026-06-25T00:00:00.000Z",
  }, null, 2), "utf8");
}
