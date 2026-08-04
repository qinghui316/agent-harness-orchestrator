import { createHash } from "node:crypto";
import { appendFile, readFile, realpath, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchSnapshot } from "../../src/workbench/read-model-types.js";

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
    projectPath: managedProject().path,
    skills: [{
      name: projectHarnessAgentInput.identity.skillName,
      description: "Test project Harness.",
      path: projectHarnessAgentInput.providerSkillInput.path,
      scope: "repo",
      enabled: true,
      contentHash: projectHarnessAgentInput.providerSkillInput.contentHash,
    }],
    errors: [],
  })),
}));

import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import {
  createProjectHarnessChange,
  listProjectHarnessChanges,
  loadProjectHarnessContract,
  publishProjectHarnessChange,
} from "../../src/project-harness/change.js";
import {
  projectHarnessConversationLane,
  readProjectHarnessLane,
  resolveProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { withSkillNativeWorkflowStart } from "../../src/project-runtime/workflow-start.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import {
  projectHarnessPlanningStartManifestHash,
  readProjectHarnessPlanningGate,
} from "../../src/project-harness/planning-gate-query.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import type { ManagedProject } from "../../src/types/index.js";
import { listTaskQueueItems, listTaskQueues } from "../../src/task-queue/manager.js";
import { persistTaskQueueRunFromGraph } from "../../src/task-queue/queue-creation.js";
import { listTaskRuns, listWorkerLeases } from "../../src/task-run/manager.js";
import {
  createWorkbenchConversation,
  listConversationMessages,
  postConversationMessage,
} from "../../src/workbench/conversation-service.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import type { WorkbenchDecisionAction } from "../../src/workbench/read-model-types.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import {
  hashWorkflowGraphPlan,
  readLatestWorkflowGraphPlanAt,
  workflowGraphPlanSchema,
} from "../../src/workflow-artifacts/manager.js";
import {
  deterministicTransitionOperationId,
  readExecutionAuthorization,
  readTransitionExecution,
  revokeLocalExecutionAuthorization,
} from "../../src/workflow-runtime/execution-authorization.js";
import { initializeSkillNativeSequentialWorkflow } from "../../src/workflow-runtime/skill-native-initialization.js";
import {
  listSkillNativeSchedulerRuns,
  readSkillNativeReadySetInitialization,
} from "../../src/workflow-runtime/skill-native-ready-set.js";
import { persistWorkflowRunForGraph } from "../../src/workflow-run/manager.js";
import { listWorktreeMetadata } from "../../src/worktree/manager.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";
import { getTempDir, git, initGitRepository } from "../unit/workbench/fixtures.js";

const SLOW_FLOW_TIMEOUT_MS = 120_000;
let originalAhoHome: string | undefined;
let runtimePaths: ProjectRuntimePaths;
let skillRoot: string;
let skillName: string;

beforeEach(async () => {
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
  appServerTurn.mockReset();
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "README.md"), "# Pricing fixture\n", "utf8");
  await writeFile(
    join(getTempDir(), "package.json"),
    "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n",
    "utf8",
  );
  await git(getTempDir(), ["add", ".gitignore", "README.md", "package.json"]);
  await git(getTempDir(), ["commit", "-m", "fixture baseline"]);
  const fixture = await createReadyProjectHarnessFixture({
    projectRoot: getTempDir(),
    ahoHome: process.env.AHO_HOME,
    projectId: managedProject().id,
    projectName: managedProject().name,
  });
  runtimePaths = resolveProjectRuntimePaths(fixture.project.id, fixture.ahoHome);
  skillRoot = fixture.skillRoot;
  skillName = fixture.skillName;
  projectHarnessAgentInput.identity.skillName = skillName;
  projectHarnessAgentInput.identity.skillRevision = 1;
  projectHarnessAgentInput.providerSkillInput.id = skillName;
  projectHarnessAgentInput.providerSkillInput.path = join(skillRoot, "SKILL.md");
});

afterEach(() => {
  if (originalAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = originalAhoHome;
});

describe("workbench Skill-native demand-to-execution golden flow", () => {
  it("carries Main-owned planning through Coder, Validation, Audit, and the exact source apply gate", async () => {
    appServerTurn
      .mockImplementationOnce(async (options) => planningTurn(options))
      .mockImplementationOnce(async (options) => acceptanceTurn(options))
      .mockImplementation(async (options) => executionRoleTurn(options));

    const conversation = await createWorkbenchConversation(managedProject(), {
      body: "会员订单满 100 元打九折，非会员不打折，需要测试。",
    });
    const messages = await listConversationMessages(managedProject(), conversation.conversationId);
    const plan = messages.find((message) =>
      message.agentRoleId === "planning-agent" && message.document?.documentKind === "plan");
    expect(plan?.document).toMatchObject({
      proposalArtifact: expect.stringContaining("planner-proposal"),
      proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(existsSync(join(plan?.document?.proposalArtifact ?? "", "..", "registry-contract.json"))).toBe(false);

    await postConversationMessage(managedProject(), conversation.conversationId, {
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
    let changeId = "";
    let graphScopeId = "";
    try {
      const current = store.conversations.readConversation(managedProject().id, conversation.conversationId);
      changeId = current?.boundChangeId ?? "";
      graphScopeId = current?.currentGraphScopeId ?? "";
    } finally {
      store.close();
    }
    expect(changeId).not.toBe("");
    expect(graphScopeId).not.toBe("");

    const registry = await resolveProjectHarnessRegistryContext({
      projectId: managedProject().id,
      projectRoot: getTempDir(),
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
      subject: "pricing-rule",
      owner_module: "pricing-domain",
      affected_paths: ["README.md", "tests/**"],
    });

    const evidenceRoot = join(skillRoot, "state", "changes", "active", changeId);
    const graph = await readLatestWorkflowGraphPlanAt(evidenceRoot, changeId);
    let snapshot = await getWorkbenchSnapshot(
      { project: managedProject(), path: getTempDir() },
      { topicId: conversation.conversationId },
    );
    expect(snapshot.memory).toMatchObject({ kind: "project-skill", projectId: managedProject().id });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    const runAction = primaryWorkflowAction(snapshot, "workflow.run.start");
    expect(runAction).toMatchObject({
      changeId,
      graphScopeId,
      workflowGraphPlanId: graph.id,
      requiresConfirmation: true,
    });
    expect(await listWorkflowRuns(runtimePaths, changeId)).toEqual([]);
    expect(await realpath(join(getTempDir(), ".agents", "skills", skillName))).toBe(await realpath(skillRoot));
    expect(existsSync(join(getTempDir(), ".claude", "skills", skillName))).toBe(false);
    expect(existsSync(join(getTempDir(), ".agent-harness", "project.json"))).toBe(false);
    expect(await getGitStatusShort(getTempDir())).toEqual([]);

    const intent = JSON.parse(await readFile(
      join(evidenceRoot, "planning", "execution-authorization-intent.json"),
      "utf8",
    )) as { authorizationId: string; projectHarnessContentFingerprint: string; startManifestHash: string };
    const runtimeState = await resolveProjectRuntimeState(managedProject(), {
      ahoHome: process.env.AHO_HOME,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (runtimeState.state !== "ready") throw new Error(`Expected ready Project Runtime, received ${runtimeState.state}.`);
    const gateEvidence = await readProjectHarnessPlanningGate({
      projectId: managedProject().id,
      projectRoot: getTempDir(),
      skillRoot,
      conversationId: conversation.conversationId,
      graphScopeId,
      changeId,
    });
    const authorization = await readExecutionAuthorization(runtimePaths, intent.authorizationId);
    const currentStartManifestHash = projectHarnessPlanningStartManifestHash(
      gateEvidence,
      runtimeState.resolution.harness.contentFingerprint,
    );
    const startTarget = authorization.targets.find((target) => target.transition === "workflow.run.start");
    expect({
      intentFingerprint: intent.projectHarnessContentFingerprint,
      runtimeFingerprint: runtimeState.resolution.harness.contentFingerprint,
      intentStartManifestHash: intent.startManifestHash,
      authorizationStartManifestHash: startTarget?.manifestHash,
      currentStartManifestHash,
    }).toEqual({
      intentFingerprint: runtimeState.resolution.harness.contentFingerprint,
      runtimeFingerprint: runtimeState.resolution.harness.contentFingerprint,
      intentStartManifestHash: currentStartManifestHash,
      authorizationStartManifestHash: currentStartManifestHash,
      currentStartManifestHash,
    });
    const [sourceHead, sourceStatus] = await Promise.all([
      getGitCommit(getTempDir()),
      getGitStatusShort(getTempDir()),
    ]);
    const rawGraph = workflowGraphPlanSchema.parse(JSON.parse(await readFile(
      join(evidenceRoot, "planning", "workflow-graph-plan.json"),
      "utf8",
    )));
    expect(gateEvidence.graph).toEqual(rawGraph);
    const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    expect({
      sourceHeadPresent: Boolean(sourceHead),
      authorizationActive: authorization.status === "active",
      projectMatches: authorization.projectId === managedProject().id,
      changeMatches: authorization.changeId === gateEvidence.change.change_id,
      conversationMatches: authorization.conversationId === intent.conversationId,
      acceptedPlanIdMatches: authorization.acceptedPlanId === intent.proposalId,
      acceptedPlanHashMatches: authorization.acceptedPlanHash === intent.proposalHash,
      graphIdMatches: authorization.graphId === gateEvidence.graph.id,
      rawGraphHashMatches: authorization.graphHash === hashWorkflowGraphPlan(rawGraph),
      graphHashMatches: authorization.graphHash === hashWorkflowGraphPlan(gateEvidence.graph),
      artifactManifestHashMatches: authorization.artifactManifestHash === hashJson(gateEvidence.graph.sourceArtifactHashes),
      sourceHeadMatches: authorization.sourceHead === sourceHead,
      sourceStateHashMatches: authorization.sourceStateHash === hashJson(sourceStatus),
      targetMatches: startTarget?.targetId === gateEvidence.graph.id
        && startTarget.manifestHash === currentStartManifestHash,
    }).toEqual({
      sourceHeadPresent: true,
      authorizationActive: true,
      projectMatches: true,
      changeMatches: true,
      conversationMatches: true,
      acceptedPlanIdMatches: true,
      acceptedPlanHashMatches: true,
      graphIdMatches: true,
      rawGraphHashMatches: true,
      graphHashMatches: true,
      artifactManifestHashMatches: true,
      sourceHeadMatches: true,
      sourceStateHashMatches: true,
      targetMatches: true,
    });

    const startResult = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...runAction, confirm: true },
    );
    const workflowResult = unwrapWorkflowActionResult(startResult.result);
    expect(workflowResult).toMatchObject({ status: "completed" });
    expect(await getGitStatusShort(getTempDir())).toEqual([]);
    expect(await listWorkflowRuns(runtimePaths, changeId)).toEqual([
      expect.objectContaining({ changeId, status: "completed", workflowGraphPlanId: graph.id }),
    ]);
    expect(await listTaskRuns(runtimePaths, changeId)).toEqual([
      expect.objectContaining({ changeId, taskId: "T-001", status: "completed" }),
    ]);

    snapshot = await getWorkbenchSnapshot(
      { project: managedProject(), path: getTempDir() },
      { topicId: conversation.conversationId },
    );
    expect(snapshot.center.workpad.resultReview).toMatchObject({
      status: "not-ready",
      validation: expect.objectContaining({ status: "passed" }),
      audit: expect.objectContaining({ status: expect.stringMatching(/approved/) }),
      applyReadiness: expect.objectContaining({ kind: "not-approved" }),
    });
    const auditAccept = primaryApprovalAction(snapshot, "audit.accept");
    await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { action: auditAccept.action, confirm: true },
    );

    snapshot = await getWorkbenchSnapshot(
      { project: managedProject(), path: getTempDir() },
      { topicId: conversation.conversationId },
    );
    expect(snapshot.center.workpad.resultReview).toMatchObject({
      status: "ready-to-apply",
      validation: expect.objectContaining({ status: "passed" }),
      audit: expect.objectContaining({ status: expect.stringMatching(/approved/) }),
    });
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "single-result-apply",
      changeId,
      primary: true,
    });
    const taskRunsBeforeDuplicate = await listTaskRuns(runtimePaths, changeId);
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...runAction, confirm: true },
    )).rejects.toThrow(/stale|already|no longer available/i);
    expect(await listWorkflowRuns(runtimePaths, changeId)).toHaveLength(1);
    expect(await listTaskRuns(runtimePaths, changeId)).toEqual(taskRunsBeforeDuplicate);

    const applyAction = primaryApprovalAction(snapshot, "result.apply");
    const sourceBeforeApply = await readFile(join(getTempDir(), "README.md"), "utf8");
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { action: applyAction.action },
    )).rejects.toThrow(/confirm/i);
    expect(await readFile(join(getTempDir(), "README.md"), "utf8")).toBe(sourceBeforeApply);
    expect(await getGitStatusShort(getTempDir())).toEqual([]);

    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      {
        action: {
          ...applyAction.action,
          scope: { ...applyAction.action.scope!, conversationId: "forged-conversation" },
        },
        confirm: true,
      },
    )).rejects.toThrow(/stale|available|current project Conversation/i);
    expect(await readFile(join(getTempDir(), "README.md"), "utf8")).toBe(sourceBeforeApply);
    expect(await getGitStatusShort(getTempDir())).toEqual([]);

    const concurrent = await Promise.allSettled([
      executeWorkbenchAction(
        { project: managedProject(), path: getTempDir() },
        { action: applyAction.action, confirm: true },
      ),
      executeWorkbenchAction(
        { project: managedProject(), path: getTempDir() },
        { action: applyAction.action, confirm: true },
      ),
    ]);
    const applied = concurrent.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof executeWorkbenchAction>>> => result.status === "fulfilled");
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(applied?.value.result).toMatchObject({ apply: { status: "applied", changeId } });
    const postApplySnapshot = applied?.value.snapshot as WorkbenchSnapshot;
    expect(postApplySnapshot.center.workpad.resultReview).toBeUndefined();
    expect(postApplySnapshot.center.workpad.nextAction).toMatchObject({
      id: "result-terminal",
      kind: "none",
      enabled: false,
    });
    expect(postApplySnapshot.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "result.apply", status: "accepted", changeId }),
    ]));
    expect(JSON.stringify(postApplySnapshot.right.confirmationQueue)).not.toContain('"actionId":"result.apply"');
    expect(JSON.stringify(postApplySnapshot.right.confirmationQueue)).not.toContain('"actionId":"audit.accept"');
    expect(await readFile(join(getTempDir(), "README.md"), "utf8")).not.toBe(sourceBeforeApply);
    expect(await getGitStatusShort(getTempDir())).not.toEqual([]);
    const decisionStore = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
    try {
      expect(decisionStore.decisions.listDecisions(managedProject().id, changeId)
        .filter((decision) => decision.actionId === "result.apply"))
        .toEqual([expect.objectContaining({ status: "accepted", targetId: expect.any(String) })]);
    } finally {
      decisionStore.close();
    }
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { action: applyAction.action, confirm: true },
    )).rejects.toThrow(/stale|already|available|completed/i);
  }, SLOW_FLOW_TIMEOUT_MS);

  it("rejects stale project and Change actions before execution state is created", async () => {
    const prepared = await prepareAcceptedExecution();
    await expect(executeWorkbenchAction(
      { project: { ...managedProject(), id: "wrong-project" }, path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    )).rejects.toThrow(/project|stale|ready|available/i);
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, changeId: "wrong-change", confirm: true },
    )).rejects.toThrow(/change|stale|available/i);
    await expectNoExecutionResidue(prepared.changeId);
  }, SLOW_FLOW_TIMEOUT_MS);

  it("initializes accepted ready-set execution and exposes only the exact first worker confirmation", async () => {
    const prepared = await prepareAcceptedExecution(executionRoleTurn, "ready-set-v1");
    const planningRoot = join(prepared.evidenceRoot, "planning");
    for (const name of [
      "scheduler-contract.json",
      "scheduler-dispatch-dry-run.json",
      "scheduler-worker-session-plan.json",
      "scheduler-claim-reconcile-plan.json",
      "scheduler-launch-preflight.json",
    ]) expect(existsSync(join(planningRoot, name))).toBe(true);
    expect(await listSkillNativeSchedulerRuns(runtimePaths, prepared.changeId)).toEqual([]);

    const started = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    );
    expect(unwrapWorkflowActionResult(started.result)).toMatchObject({
      schedulerRun: { status: "prepared", workflowGraphPlanId: prepared.graph.id },
      runtimeState: { status: "initialized" },
      reconcileSnapshot: { status: "generated" },
      claimReservation: { status: "reserved" },
      currentTransition: { kind: "start-first-worker", actionType: "planning.scheduler.worker.start-first" },
      executionStarted: false,
    });
    const [schedulerRun] = await listSkillNativeSchedulerRuns(runtimePaths, prepared.changeId);
    const initialized = await readSkillNativeReadySetInitialization(runtimePaths, prepared.changeId, schedulerRun.id, prepared.graph as Extract<typeof prepared.graph, { graphMode: "ready-set-v1" }>);
    expect(initialized.currentTransition).toMatchObject({ kind: "start-first-worker" });
    await expect(readSkillNativeReadySetInitialization(
      runtimePaths,
      prepared.changeId,
      schedulerRun.id,
      { ...prepared.graph, id: "stale-ready-set-graph" } as Extract<typeof prepared.graph, { graphMode: "ready-set-v1" }>,
    )).rejects.toThrow(/lineage/i);
    await expectNoSequentialExecutionState(prepared.changeId);
    expect(await listRuns(runtimePaths)).toEqual([]);
    expect(await listWorktreeMetadata({ worktreeMetadataRoot: runtimePaths.worktreeMetadataRoot })).toEqual([]);

    const snapshot = await getWorkbenchSnapshot(
      { project: managedProject(), path: getTempDir() },
      { topicId: prepared.conversation.conversationId },
    );
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      kind: "workflow-action",
      actionType: "planning.scheduler.worker.start-first",
      schedulerRunId: schedulerRun.id,
      schedulerClaimReservationId: initialized.claimReservation.id,
      enabled: true,
    });
    expect(snapshot.right.confirmationQueue.current).toHaveLength(1);
    expect(snapshot.right.confirmationQueue.current[0]?.actions).toEqual([
      expect.objectContaining({
        actionType: "planning.scheduler.worker.start-first",
        schedulerRunId: schedulerRun.id,
        schedulerClaimReservationId: initialized.claimReservation.id,
        graphScopeId: prepared.graphScopeId,
        enabled: true,
      }),
    ]);
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    )).rejects.toThrow(/stale|already|no longer available/i);
    expect(await listSkillNativeSchedulerRuns(runtimePaths, prepared.changeId)).toHaveLength(1);
  }, SLOW_FLOW_TIMEOUT_MS);

  it("rejects drifted ready-set planning evidence before Scheduler state is created", async () => {
    const prepared = await prepareAcceptedExecution(executionRoleTurn, "ready-set-v1");
    const contractPath = join(prepared.evidenceRoot, "planning", "scheduler-contract.json");
    const contract = JSON.parse(await readFile(contractPath, "utf8")) as Record<string, unknown>;
    await writeFile(contractPath, `${JSON.stringify({ ...contract, updatedAt: "2026-08-03T00:00:00.000Z" }, null, 2)}\n`, "utf8");
    const result = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    );
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/drift|stale|manifest|authorization/i),
    });
    await expectNoExecutionResidue(prepared.changeId);
  }, SLOW_FLOW_TIMEOUT_MS);

  it("rejects Skill fingerprint and Registry drift before execution state is created", async () => {
    const prepared = await prepareAcceptedExecution();
    const skillPath = join(skillRoot, "SKILL.md");
    const originalSkill = await readFile(skillPath, "utf8");
    await writeFile(skillPath, `${originalSkill}\n# Drift\n`, "utf8");
    const fingerprintDrift = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    );
    expect(fingerprintDrift.result).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/fingerprint|drift|stale|incomplete/i),
    });
    await expectNoExecutionResidue(prepared.changeId);
    await writeFile(skillPath, originalSkill, "utf8");

    const driftContext = await resolveProjectHarnessRegistryContext({
      projectId: managedProject().id,
      projectRoot: getTempDir(),
      skillRoot,
    });
    driftContext.lane = projectHarnessConversationLane("drift-conversation", "graph:drift-conversation:initial");
    await createProjectHarnessChange(driftContext, { changeId: "conflicting-pricing-owner" });
    await publishProjectHarnessChange(driftContext, {
      changeId: "conflicting-pricing-owner",
      scope: "Conflicting pricing owner",
      paths: ["conflicting/**"],
      status: "active",
      validation: ["Registry drift fixture."],
      contract: {
        kind: "module_boundary",
        subject: "pricing-rule",
        operation: "own-conflicting-pricing-rule",
        owner_module: "conflicting-pricing-domain",
        affected_paths: ["conflicting/**"],
        consumers: [],
        depends_on: [],
        depends_on_changes: [],
        compatibility: "Conflict fixture.",
        status: "active",
      },
    });
    const registryDrift = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    );
    expect(registryDrift.result).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/preflight|Registry|drift|stale|incomplete/i),
    });
    await expectNoExecutionResidue(prepared.changeId);
  }, SLOW_FLOW_TIMEOUT_MS);

  it("rejects revoked execution authorization without consuming or initializing it", async () => {
    const prepared = await prepareAcceptedExecution();
    await revokeLocalExecutionAuthorization(runtimePaths, prepared.authorizationId, "negative start fixture");
    await expect(executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    )).rejects.toThrow(/authorization|revoked|stale|available/i);
    await expectNoExecutionResidue(prepared.changeId);
    await expect(readExecutionAuthorization(runtimePaths, prepared.authorizationId)).resolves.toMatchObject({
      status: "revoked",
    });
  }, SLOW_FLOW_TIMEOUT_MS);

  it("rolls back WorkflowRun, TaskQueue, and TaskRun state when initialization fails", async () => {
    const prepared = await prepareAcceptedExecution();
    const runtimeState = await resolveProjectRuntimeState(managedProject(), {
      ahoHome: process.env.AHO_HOME,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (runtimeState.state !== "ready") throw new Error(`Expected ready Project Runtime, received ${runtimeState.state}.`);
    await expect(withSkillNativeWorkflowStart(managedProject(), runtimeState.resolution, {
      changeId: prepared.changeId,
      graphScopeId: prepared.graphScopeId,
      workflowGraphPlanId: prepared.graph.id,
    }, async (gate) => initializeSkillNativeSequentialWorkflow(gate, {
      async persistWorkflow(currentGate, workflow) {
        await persistWorkflowRunForGraph(currentGate.runs, currentGate.project.id, workflow);
      },
      async persistQueue(currentGate, workflow, created) {
        await persistTaskQueueRunFromGraph(currentGate.runs, workflow, created);
        throw new Error("injected queue initialization failure");
      },
    }))).rejects.toThrow("injected queue initialization failure");
    await expectNoExecutionResidue(prepared.changeId);
    const authorization = await readExecutionAuthorization(runtimePaths, prepared.authorizationId);
    expect(authorization).toMatchObject({
      status: "active",
    });
    const evidence = await readProjectHarnessPlanningGate({
      projectId: managedProject().id,
      projectRoot: getTempDir(),
      skillRoot,
      conversationId: prepared.conversation.conversationId,
      graphScopeId: prepared.graphScopeId,
      changeId: prepared.changeId,
    });
    const manifestHash = projectHarnessPlanningStartManifestHash(
      evidence,
      runtimeState.resolution.harness.contentFingerprint,
    );
    const operationId = deterministicTransitionOperationId({
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "workflow.run.start",
      targetId: prepared.graph.id,
      manifestHash,
    });
    await expect(readTransitionExecution(runtimePaths, operationId)).resolves.toMatchObject({
      status: "retryable-failed",
      commitPointReservedAt: null,
      receipt: {
        outcome: "retryable-failed",
        consumesAuthorization: false,
        error: "injected queue initialization failure",
      },
    });
  }, SLOW_FLOW_TIMEOUT_MS);

  it("runs one bounded Audit rework through Rework, Validation, and Audit again", async () => {
    const providerRoles: string[] = [];
    let auditAttempt = 0;
    const prepared = await prepareAcceptedExecution(async (options) => {
      providerRoles.push(options.roleId);
      if (options.roleId === "coder-agent" || options.roleId === "rework-coder") {
        await appendFile(join(options.cwd, "README.md"), `\n${options.roleId} pricing change.\n`, "utf8");
        return completedRoleTurn(options, `${options.roleId} completed.`, [join(options.cwd, "README.md")]);
      }
      if (options.roleId === "auditor-agent") {
        auditAttempt += 1;
        return completedRoleTurn(options, auditAttempt === 1
          ? "Status: blocked\n\nFinding: Rework is required before acceptance."
          : "Status: approved\n\nFinding: Reworked pricing evidence is acceptable.");
      }
      return executionRoleTurn(options);
    });
    const started = await executeWorkbenchAction(
      { project: managedProject(), path: getTempDir() },
      { ...prepared.runAction, confirm: true },
    );
    expect(unwrapWorkflowActionResult(started.result)).toMatchObject({ status: "completed" });
    expect(providerRoles).toEqual([
      "coder-agent",
      "auditor-agent",
      "rework-coder",
      "auditor-agent",
      "main-agent",
    ]);
    expect(await listTaskRuns(runtimePaths, prepared.changeId)).toEqual([
      expect.objectContaining({ roleId: "rework-coder", attempt: 2, status: "completed" }),
      expect.objectContaining({ roleId: "coder", attempt: 1, status: "blocked", blockedReason: "Audit blocked." }),
    ]);
    expect(await listWorkflowRuns(runtimePaths, prepared.changeId)).toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
  }, SLOW_FLOW_TIMEOUT_MS);
});

async function prepareAcceptedExecution(
  executionTurn: (options: AppServerTurnOptions) => Promise<ReturnType<typeof completedRoleTurn>> = executionRoleTurn,
  graphMode: "sequential-v1" | "ready-set-v1" = "sequential-v1",
) {
  appServerTurn.mockReset();
  appServerTurn
    .mockImplementationOnce(async (options) => planningTurn(options, graphMode))
    .mockImplementationOnce(async (options) => acceptanceTurn(options))
    .mockImplementation(async (options) => executionTurn(options));
  const conversation = await createWorkbenchConversation(managedProject(), {
    body: "会员订单满 100 元打九折，非会员不打折，需要测试。",
  });
  const messages = await listConversationMessages(managedProject(), conversation.conversationId);
  const plan = messages.find((message) =>
    message.agentRoleId === "planning-agent" && message.document?.documentKind === "plan");
  if (!plan?.document?.proposalArtifact || !plan.document.proposalHash) {
    throw new Error("Accepted execution fixture did not produce a Planning proposal.");
  }
  await postConversationMessage(managedProject(), conversation.conversationId, {
    mode: "chat",
    message: "执行当前计划",
    planHandoffIntent: {
      kind: "execute-plan",
      sourceRunId: plan.runId ?? "",
      sourceAgentRoleId: "planning-agent",
      sourceArtifact: plan.document.proposalArtifact,
      sourceDocumentId: plan.document.documentId,
      sourceCanonicalItemId: plan.document.sourceCanonicalItemId,
      sourceProposalHash: plan.document.proposalHash,
      executionMode: "stepwise",
    },
  });
  const store = await openProjectRuntimeWorkbenchDatabase(runtimePaths);
  let changeId = "";
  let graphScopeId = "";
  try {
    const current = store.conversations.readConversation(managedProject().id, conversation.conversationId);
    changeId = current?.boundChangeId ?? "";
    graphScopeId = current?.currentGraphScopeId ?? "";
  } finally {
    store.close();
  }
  if (!changeId || !graphScopeId) throw new Error("Accepted execution fixture has incomplete Change lineage.");
  const evidenceRoot = join(skillRoot, "state", "changes", "active", changeId);
  const graph = await readLatestWorkflowGraphPlanAt(evidenceRoot, changeId);
  const snapshot = await getWorkbenchSnapshot(
    { project: managedProject(), path: getTempDir() },
    { topicId: conversation.conversationId },
  );
  const runAction = primaryWorkflowAction(snapshot, "workflow.run.start");
  const intent = JSON.parse(await readFile(
    join(evidenceRoot, "planning", "execution-authorization-intent.json"),
    "utf8",
  )) as { authorizationId?: string };
  if (!intent.authorizationId) throw new Error("Accepted execution fixture has no execution authorization.");
  return {
    conversation,
    changeId,
    graphScopeId,
    evidenceRoot,
    graph,
    runAction,
    authorizationId: intent.authorizationId,
  };
}

async function expectNoExecutionResidue(changeId: string): Promise<void> {
  const [workflowRuns, queues, queueItems, taskRuns, workerLeases, schedulerRuns] = await Promise.all([
    listWorkflowRuns(runtimePaths, changeId),
    listTaskQueues(runtimePaths, changeId),
    listTaskQueueItems(runtimePaths, changeId),
    listTaskRuns(runtimePaths, changeId),
    listWorkerLeases(runtimePaths, changeId),
    listSkillNativeSchedulerRuns(runtimePaths, changeId),
  ]);
  expect({ workflowRuns, queues, queueItems, taskRuns, workerLeases, schedulerRuns }).toEqual({
    workflowRuns: [],
    queues: [],
    queueItems: [],
    taskRuns: [],
    workerLeases: [],
    schedulerRuns: [],
  });
}

async function expectNoSequentialExecutionState(changeId: string): Promise<void> {
  const [workflowRuns, queues, queueItems, taskRuns, workerLeases] = await Promise.all([
    listWorkflowRuns(runtimePaths, changeId),
    listTaskQueues(runtimePaths, changeId),
    listTaskQueueItems(runtimePaths, changeId),
    listTaskRuns(runtimePaths, changeId),
    listWorkerLeases(runtimePaths, changeId),
  ]);
  expect({ workflowRuns, queues, queueItems, taskRuns, workerLeases }).toEqual({
    workflowRuns: [],
    queues: [],
    queueItems: [],
    taskRuns: [],
    workerLeases: [],
  });
}

async function planningTurn(
  options: AppServerTurnOptions,
  graphMode: "sequential-v1" | "ready-set-v1" = "sequential-v1",
) {
  await writePlannerFiles(options.writableRoots?.[0] ?? "", graphMode);
  emitMainThreadStarted(options, "thread-main", "turn-plan");
  emitPlanningChildStarted(options, "thread-main", "thread-planner", "item-spawn-planner");
  for (const [method, params] of [
    ["turn/started", { turnId: "turn-planner" }],
    ["item/agentMessage/delta", { itemId: "message-plan", delta: plannerPlanText(graphMode) }],
    ["turn/completed", { turnId: "turn-planner" }],
  ] as const) {
    for (const event of normalizeCodexAppServerNotification(method, params, {
      projectId: managedProject().id,
      conversationId: options.conversationId,
      runId: options.runId,
      threadId: "thread-planner",
      parentThreadId: "thread-main",
      turnId: "turn-planner",
      roleId: "planning-agent",
      displayName: "Newton",
    })) options.onRealtimeEvent?.(event);
  }
  const changedFiles = ["spec.md", "plan.md", "tasks.md"]
    .map((name) => join(options.writableRoots?.[0] ?? "", name));
  options.onChildThreadResult?.({
    itemId: "item-spawn-planner",
    parentThreadId: "thread-main",
    threadId: "thread-planner",
    roleHint: "planning-agent",
    status: "completed",
    displayName: "Newton",
    finalText: plannerPlanText(graphMode),
    changedFiles,
    snapshot: {},
  });
  emitCanonicalMainText(options, "Planning returned an exact proposal.", "thread-main", "turn-plan", "message-main-plan");
  return {
    status: "completed" as const,
    threadId: "thread-main",
    turnId: "turn-plan",
    lastMessage: "Planning returned an exact proposal.",
    goal: nativeGoal("active"),
    childThreads: [{
      itemId: "item-spawn-planner",
      parentThreadId: "thread-main",
      threadId: "thread-planner",
      roleHint: "planning-agent",
      status: "completed" as const,
      displayName: "Newton",
      finalText: plannerPlanText(graphMode),
      changedFiles,
      snapshot: {},
    }],
    changedFiles: [],
  };
}

async function acceptanceTurn(options: AppServerTurnOptions) {
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
    status: "completed" as const,
    threadId: "thread-main",
    turnId: "turn-accept",
    lastMessage: "Plan accepted; human execution approval is pending.",
    goal: nativeGoal("paused"),
    childThreads: [],
    changedFiles: [],
  };
}

async function executionRoleTurn(options: AppServerTurnOptions) {
  if (options.roleId === "coder-agent" || options.roleId === "rework-coder") {
    await appendFile(join(options.cwd, "README.md"), "\nImplemented pricing discount rule.\n", "utf8");
    return completedRoleTurn(options, "Coder completed the accepted pricing task.", [join(options.cwd, "README.md")]);
  }
  if (options.roleId === "auditor-agent") {
    return completedRoleTurn(options, "Status: approved\n\nFinding: Pricing implementation and validation evidence are acceptable.");
  }
  if (options.roleId === "main-agent") {
    return {
      ...completedRoleTurn(options, "Execution completed; audit acceptance remains at the human gate."),
      goal: nativeGoal("paused"),
    };
  }
  return completedRoleTurn(options, `${options.roleId} completed.`);
}

function completedRoleTurn(options: AppServerTurnOptions, message: string, changedFiles: string[] = []) {
  return {
    status: "completed" as const,
    threadId: options.existingThreadId ?? `thread-${options.roleId}-${options.runId}`,
    turnId: `turn-${options.roleId}-${options.runId}`,
    lastMessageItemId: `message-${options.roleId}-${options.runId}`,
    lastMessage: message,
    childThreads: [],
    changedFiles,
  };
}

function emitCanonicalMainText(
  options: AppServerTurnOptions,
  text: string,
  threadId: string,
  turnId: string,
  itemId: string,
): void {
  for (const event of normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId, delta: text }, {
    projectId: managedProject().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    itemId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

function emitMainThreadStarted(options: AppServerTurnOptions, threadId: string, turnId: string): void {
  for (const event of normalizeCodexAppServerNotification("turn/started", { turnId }, {
    projectId: managedProject().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

function emitPlanningChildStarted(
  options: AppServerTurnOptions,
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

async function writePlannerFiles(
  directory: string,
  graphMode: "sequential-v1" | "ready-set-v1" = "sequential-v1",
): Promise<void> {
  await writeFile(
    join(directory, "spec.md"),
    "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Member orders of at least 100 receive a ten percent discount; non-members do not.\n",
    "utf8",
  );
  await writeFile(join(directory, "plan.md"), plannerPlanText(graphMode), "utf8");
  await writeFile(
    join(directory, "tasks.md"),
    "# Tasks\n\n- [ ] T-001: Implement and test the pricing rule.\n  - Covers: AC-001\n",
    "utf8",
  );
}

function mainAcceptanceArguments(options: AppServerTurnOptions): Record<string, unknown> {
  const context = JSON.parse(options.additionalContext?.["aho.plan-handoff"]?.value ?? "{}") as {
    sourceProposalHash?: string;
    graphScopeId?: string;
  };
  return {
    proposalHash: context.sourceProposalHash,
    graphScopeId: context.graphScopeId,
    contractRequired: true,
    contract: {
      kind: "module_boundary",
      subject: "pricing-rule",
      operation: "implement-member-discount",
      owner_module: "pricing-domain",
      affected_paths: ["README.md", "tests/**"],
      consumers: ["checkout"],
      depends_on: [],
      depends_on_changes: [],
      compatibility: "Non-member pricing remains unchanged.",
      status: "active",
    },
    validation: ["Main Agent verified the pricing owner and source scope against the project Skill and Registry."],
  };
}

function plannerPlanText(graphMode: "sequential-v1" | "ready-set-v1" = "sequential-v1"): string {
  return [
    "# Plan",
    "",
    "## Approach",
    "Implement the pricing rule and regression coverage.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify({
      version: "1.0",
      mode: graphMode,
      nodes: [{
        id: "pricing-rule",
        title: "Implement pricing rule",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: "Objective: Implement the accepted pricing rule. Required behavior: Update the rule and its tests. Constraints: Stay within accepted source scopes. Expected evidence: Report changed files and passing tests.",
        dependsOn: [],
        sourceScopes: ["README.md", "tests/**"],
      }],
    }, null, 2),
    "```",
    "",
  ].join("\n");
}

function primaryWorkflowAction(
  snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>,
  actionType: string,
): WorkbenchDecisionAction {
  const action = snapshot.right.confirmationQueue.primary?.actions
    .find((candidate) => candidate.actionType === actionType);
  if (!action) throw new Error(`Missing primary ${actionType} action.`);
  return action;
}

function primaryApprovalAction(
  snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>,
  actionId: string,
): WorkbenchDecisionAction {
  const action = snapshot.right.confirmationQueue.primary?.actions
    .find((candidate) => candidate.action?.actionId === actionId);
  if (!action) throw new Error(`Missing primary ${actionId} approval action.`);
  return action;
}

function unwrapWorkflowActionResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return record.result ?? value;
}

function nativeGoal(status: "active" | "paused") {
  return {
    threadId: "thread-main",
    objective: "Implement the accepted pricing rule with regression coverage",
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

function managedProject(): ManagedProject {
  return {
    id: "canonical-project-a1",
    name: "Pricing Project",
    path: getTempDir(),
    addedAt: "2026-08-03T00:00:00.000Z",
    lastSeenAt: "2026-08-03T00:00:00.000Z",
    defaultProviderId: "codex",
  };
}

type AppServerTurnOptions = Parameters<typeof appServerTurn>[0];
