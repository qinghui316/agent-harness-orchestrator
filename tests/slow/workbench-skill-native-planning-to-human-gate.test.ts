import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appServerTurn = vi.hoisted(() => vi.fn());
const projectHarnessAgentInput = vi.hoisted(() => ({
  identity: {
    projectId: "canonical-project-a1",
    skillName: "canonical-project-a1-harness",
    skillRevision: 1,
    contentFingerprint: "a".repeat(64),
  },
  providerSkillInput: {
    id: "canonical-project-a1-harness",
    path: "",
    contentHash: "b".repeat(64),
    source: "project-harness" as const,
    required: true,
  },
}));

vi.mock("../../src/project-harness/agent-input.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/project-harness/agent-input.js")>(),
  resolveProjectHarnessAgentInput: vi.fn(async () => projectHarnessAgentInput),
}));

vi.mock("../../src/codex/app-server.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/codex/app-server.js")>(),
  detectCodexAppServerCapability: vi.fn(async () => ({
    available: true,
    supportsStdio: true,
    supportsRequiredLifecycle: true,
    nativeCollab: { multiAgent: "enabled", multiAgentV2: "enabled", configPath: "test", errors: [] },
    help: "codex app server --listen stdio://",
    errors: [],
  })),
  runCodexAppServerTurn: appServerTurn,
  runCodexAppServerChildTurn: vi.fn(),
  runCodexAppServerChildClose: vi.fn(),
  isCodexAppServerChildAvailable: vi.fn(() => true),
  getActiveCodexAppServerTurn: vi.fn(() => null),
}));

vi.mock("../../src/codex/capabilities.js", () => ({
  detectCodexCapabilities: vi.fn(async () => readyCodexCapabilities()),
}));

vi.mock("../../src/codex/native-skills.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/codex/native-skills.js")>(),
  listCodexNativeSkills: vi.fn(async () => ({
    providerId: "codex",
    projectPath: root,
    skills: [{
      name: projectHarnessAgentInput.identity.skillName,
      description: "Test project Harness.",
      path: join(root, ".agents", "skills", projectHarnessAgentInput.identity.skillName, "SKILL.md"),
      scope: "repo",
      enabled: true,
      contentHash: projectHarnessAgentInput.providerSkillInput.contentHash,
    }],
    errors: [],
  })),
}));

import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import {
  listProjectHarnessChanges,
  loadProjectHarnessContract,
} from "../../src/project-harness/change.js";
import {
  projectHarnessConversationLane,
  readProjectHarnessLane,
  resolveProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { git } from "../../src/project/git.js";
import type { ManagedProject } from "../../src/types/index.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { readLatestWorkflowGraphPlanAt } from "../../src/workflow-artifacts/manager.js";
import { readExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import {
  createWorkbenchConversation,
  listConversationMessages,
  postConversationMessage,
} from "../../src/workbench/conversation-service.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

const SLOW_FLOW_TIMEOUT_MS = 120_000;
let root: string;
let originalAhoHome: string | undefined;
let runtimePaths: ProjectRuntimePaths;
let skillRoot: string;
let skillName: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-skill-native-human-gate-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, ".aho-home");
  appServerTurn.mockReset();
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "aho-test@example.invalid"]);
  await git(root, ["config", "user.name", "AHO Test"]);
  await writeFile(join(root, ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(root, "package.json"), "{\"name\":\"skill-native-human-gate\"}\n", "utf8");
  await git(root, ["add", ".gitignore", "package.json"]);
  await git(root, ["commit", "-m", "fixture baseline"]);
  const fixture = await createReadyProjectHarnessFixture({
    projectRoot: root,
    ahoHome: process.env.AHO_HOME,
    projectId: project().id,
    projectName: project().name,
  });
  runtimePaths = resolveProjectRuntimePaths(fixture.project.id, fixture.ahoHome);
  skillRoot = fixture.skillRoot;
  skillName = fixture.skillName;
  projectHarnessAgentInput.identity.skillName = skillName;
  projectHarnessAgentInput.identity.skillRevision = 1;
  projectHarnessAgentInput.providerSkillInput.id = skillName;
  projectHarnessAgentInput.providerSkillInput.path = join(skillRoot, "SKILL.md");
});

afterEach(async () => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("workbench Skill-native planning-to-human-gate flow", () => {
  it("uses Main and Planning composition to publish one exact non-executing human gate", async () => {
    appServerTurn
      .mockImplementationOnce(async (options) => {
        await writePlannerFiles(options.writableRoots[0]);
        emitMainThreadStarted(options, "thread-main", "turn-plan");
        emitPlanningChildStarted(options, "thread-main", "thread-planner", "item-spawn-planner");
        options.onChildThreadResult?.({
          itemId: "item-spawn-planner",
          parentThreadId: "thread-main",
          threadId: "thread-planner",
          roleHint: "planning-agent",
          status: "running",
          prompt: "Draft the exact proposal.",
          initialUserItem: {
            turnId: "turn-planner",
            itemId: "item-child-input",
            text: "Draft the exact proposal.",
          },
          displayName: "Newton",
          finalText: "",
          changedFiles: [],
          snapshot: {},
        });
        for (const [method, params] of [
          ["turn/started", { turnId: "turn-planner" }],
          ["item/agentMessage/delta", { itemId: "message-plan", delta: plannerPlanText() }],
          ["turn/completed", { turnId: "turn-planner" }],
        ] as const) {
          for (const event of normalizeCodexAppServerNotification(method, params, {
            projectId: project().id,
            conversationId: options.conversationId,
            runId: options.runId,
            threadId: "thread-planner",
            parentThreadId: "thread-main",
            turnId: "turn-planner",
            roleId: "planning-agent",
            displayName: "Newton",
          })) options.onRealtimeEvent?.(event);
        }
        options.onChildThreadResult?.({
          itemId: "item-spawn-planner",
          parentThreadId: "thread-main",
          threadId: "thread-planner",
          roleHint: "planning-agent",
          status: "completed",
          displayName: "Newton",
          finalText: plannerPlanText(),
          changedFiles: ["spec.md", "plan.md", "tasks.md"]
            .map((name) => join(options.writableRoots[0], name)),
          snapshot: {},
        });
        emitCanonicalMainText(options, "Planning returned an exact proposal.", "thread-main", "turn-plan", "message-main-plan");
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-plan",
          lastMessage: "Planning returned an exact proposal.",
          goal: nativeGoal("active"),
          childThreads: [{
            itemId: "item-spawn-planner",
            parentThreadId: "thread-main",
            threadId: "thread-planner",
            roleHint: "planning-agent",
            status: "completed",
            displayName: "Newton",
            finalText: plannerPlanText(),
            changedFiles: ["spec.md", "plan.md", "tasks.md"]
              .map((name) => join(options.writableRoots[0], name)),
            snapshot: {},
          }],
        };
      })
      .mockImplementationOnce(async (options) => {
        const result = await options.onDynamicToolCall?.({
          requestId: "request-accept",
          threadId: "thread-main",
          turnId: "turn-accept",
          callId: "call-accept",
          tool: "aho_accept_current_plan",
          arguments: mainAcceptanceArguments(options),
        });
        expect(result).toMatchObject({ success: true });
        emitCanonicalMainText(options, "Plan accepted; human execution approval is pending.", "thread-main", "turn-accept", "message-main-accept");
        return {
          status: "completed",
          threadId: "thread-main",
          turnId: "turn-accept",
          lastMessage: "Plan accepted; human execution approval is pending.",
          goal: nativeGoal("paused"),
          childThreads: [],
        };
      });

    const conversation = await createWorkbenchConversation(project(), {
      body: "Add GET /healthz returning status ok and add a regression test.",
    });
    const messages = await listConversationMessages(project(), conversation.conversationId);
    const plan = messages.find((message) =>
      message.agentRoleId === "planning-agent" && message.document?.documentKind === "plan");
    expect(plan?.document).toMatchObject({
      proposalArtifact: expect.stringContaining("planner-proposal"),
      proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(existsSync(join(plan?.document?.proposalArtifact ?? "", "..", "registry-contract.json"))).toBe(false);

    await postConversationMessage(project(), conversation.conversationId, {
      mode: "chat",
      message: "执行当前计划",
      planHandoffIntent: {
        kind: "execute-plan",
        sourceRunId: plan?.runId ?? "",
        sourceAgentRoleId: "planning-agent",
        sourceArtifact: plan?.document?.proposalArtifact,
        sourceDocumentId: plan?.document?.documentId,
        sourceCanonicalItemId: plan?.document?.sourceCanonicalItemId,
        sourceProposalHash: plan?.document?.proposalHash,
        executionMode: "stepwise",
      },
    });

    const store = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
    let changeId: string;
    let graphScopeId: string;
    try {
      const current = store.conversations.readConversation(project().id, conversation.conversationId);
      changeId = current?.boundChangeId ?? "";
      graphScopeId = current?.currentGraphScopeId ?? "";
    } finally {
      store.close();
    }
    expect(changeId).not.toBe("");
    expect(graphScopeId).not.toBe("");

    const registry = await resolveProjectHarnessRegistryContext({
      projectId: project().id,
      projectRoot: root,
      skillRoot,
    });
    const [changes, lane, contract] = await Promise.all([
      listProjectHarnessChanges(skillRoot),
      readProjectHarnessLane({
        ...registry,
        lane: projectHarnessConversationLane(conversation.conversationId, graphScopeId),
      }),
      loadProjectHarnessContract(skillRoot, changeId),
    ]);
    expect(changes).toEqual([expect.objectContaining({ change_id: changeId, status: "active" })]);
    expect(lane).toMatchObject({
      active_change_id: changeId,
      conversation_id: conversation.conversationId,
      graph_scope_id: graphScopeId,
    });
    expect(contract).toMatchObject({
      change_id: changeId,
      kind: "api",
      subject: "health-endpoint",
      operation: "add-health-endpoint",
      owner_module: "http-service",
      affected_paths: ["src/**", "test/**"],
      consumers: ["operators"],
      compatibility: "GET / remains unchanged.",
    });

    const evidenceRoot = join(skillRoot, "state", "changes", "active", changeId);
    const graph = await readLatestWorkflowGraphPlanAt(evidenceRoot, changeId);
    const mainAcceptance = JSON.parse(await readFile(
      join(evidenceRoot, "planning", "main-acceptance.json"),
      "utf8",
    )) as Record<string, unknown>;
    expect(mainAcceptance).toMatchObject({
      acceptedBy: "main-agent",
      projectId: project().id,
      changeId,
      conversationId: conversation.conversationId,
      graphScopeId,
      proposalHash: plan?.document?.proposalHash,
      contractRequired: true,
      contract: healthEndpointContract(),
      validation: ["Main Agent verified the endpoint owner against the project Skill, source, and current Registry."],
    });
    const intent = JSON.parse(await readFile(
      join(evidenceRoot, "planning", "execution-authorization-intent.json"),
      "utf8",
    )) as { status: string; authorizationId: string };
    expect(intent).toMatchObject({ status: "issued", authorizationId: expect.stringMatching(/^auth-/) });
    await expect(readExecutionAuthorization(runtimePaths, intent.authorizationId)).resolves.toMatchObject({
      projectId: project().id,
      changeId,
      conversationId: conversation.conversationId,
      graphId: graph.id,
      status: "active",
    });

    const snapshot = await getWorkbenchSnapshot(
      { project: project(), path: root },
      { topicId: conversation.conversationId },
    );
    expect(snapshot.harness).toMatchObject({ kind: "project-skill", projectId: project().id });
    expect(snapshot.right.confirmationQueue.current).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      primary: true,
      status: "pending",
      conversationId: conversation.conversationId,
      changeId,
      graphScopeId,
      actions: [expect.objectContaining({
        actionType: "workflow.run.start",
        changeId,
        graphScopeId,
        workflowGraphPlanId: graph.id,
        requiresConfirmation: true,
      })],
    });
    expect(await listWorkflowRuns(runtimePaths, changeId)).toEqual([]);
    expect(await realpath(join(root, ".agents", "skills", skillName))).toBe(await realpath(skillRoot));
    expect(existsSync(join(root, ".claude", "skills", skillName))).toBe(false);
    expect(existsSync(join(root, ".agent-harness", "project.json"))).toBe(false);
    expect((await git(root, ["status", "--porcelain"])).trim()).toBe("");
  }, SLOW_FLOW_TIMEOUT_MS);
});

function emitCanonicalMainText(
  options: {
    runId: string;
    conversationId?: string;
    onRealtimeEvent?: (event: ReturnType<typeof normalizeCodexAppServerNotification>[number]) => void;
  },
  text: string,
  threadId: string,
  turnId: string,
  itemId: string,
): void {
  for (const event of normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId, delta: text }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    itemId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

function emitMainThreadStarted(
  options: {
    runId: string;
    conversationId?: string;
    onRealtimeEvent?: (event: ReturnType<typeof normalizeCodexAppServerNotification>[number]) => void;
  },
  threadId: string,
  turnId: string,
): void {
  for (const event of normalizeCodexAppServerNotification("turn/started", { turnId }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

function emitPlanningChildStarted(
  options: {
    onChildLifecycleEvent?: (event: {
      kind: "started" | "continued" | "closed";
      activityId: string;
      parentThreadId: string;
      childThreadId: string;
      roleHint?: string;
    }) => void;
  },
  parentThreadId: string,
  childThreadId: string,
  activityId: string,
): void {
  options.onChildLifecycleEvent?.({
    kind: "started",
    activityId,
    parentThreadId,
    childThreadId,
    roleHint: "planning-agent",
  });
}

async function writePlannerFiles(directory: string): Promise<void> {
  await writeFile(join(directory, "spec.md"),
    "# Spec\n\n## Acceptance Criteria\n\n- AC-001: GET /healthz returns HTTP 200 and status ok without changing GET /.\n",
    "utf8");
  await writeFile(join(directory, "plan.md"), plannerPlanText(), "utf8");
  await writeFile(join(directory, "tasks.md"),
    "# Tasks\n\n- [ ] T-001: Add GET /healthz and its regression test.\n  - Covers: AC-001\n",
    "utf8");
}

function mainAcceptanceArguments(options: {
  additionalContext?: Record<string, { value: string }>;
}): Record<string, unknown> {
  const context = JSON.parse(options.additionalContext?.["aho.plan-handoff"]?.value ?? "{}") as {
    sourceProposalHash?: string;
    graphScopeId?: string;
  };
  return {
    proposalHash: context.sourceProposalHash,
    graphScopeId: context.graphScopeId,
    contractRequired: true,
    contract: healthEndpointContract(),
    validation: ["Main Agent verified the endpoint owner against the project Skill, source, and current Registry."],
  };
}

function healthEndpointContract() {
  return {
    kind: "api",
    subject: "health-endpoint",
    operation: "add-health-endpoint",
    owner_module: "http-service",
    affected_paths: ["src/**", "test/**"],
    consumers: ["operators"],
    depends_on: [],
    depends_on_changes: [],
    compatibility: "GET / remains unchanged.",
    status: "active",
  };
}

function plannerPlanText(): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "Add the route and regression coverage.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{
        id: "health-endpoint",
        title: "Add health endpoint",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: "Objective: Add GET /healthz. Required behavior: Add regression coverage while preserving GET /. Constraints: Stay within src and test scopes. Expected evidence: Report changed files and test results.",
        dependsOn: [],
        sourceScopes: ["src/**", "test/**"],
      }],
    }, null, 2),
    "```",
    "",
  ].join("\n");
}

function nativeGoal(status: "active" | "paused") {
  return {
    threadId: "thread-main",
    objective: "Add a health endpoint with regression coverage",
    status,
    tokenBudget: null,
    tokensUsed: 10,
    timeUsedSeconds: 1,
    createdAt: 100,
    updatedAt: 101,
  };
}

function readyCodexCapabilities() {
  return {
    available: true,
    version: "test",
    approvalFlagPlacement: "exec" as const,
    supportsJson: true,
    supportsSandbox: true,
    supportsCd: true,
    supportsAddDir: true,
    supportsColor: true,
    supportsOutputLastMessage: true,
    supportsSafeResume: true,
    supportsResumeAddDir: true,
    errors: [],
  };
}

function project(): ManagedProject {
  return {
    id: "canonical-project-a1",
    name: "Repo",
    path: root,
    addedAt: "2026-08-03T00:00:00.000Z",
    lastSeenAt: "2026-08-03T00:00:00.000Z",
  };
}
