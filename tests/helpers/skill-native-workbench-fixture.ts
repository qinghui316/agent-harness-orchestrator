import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { runSkillNativeIntegrationCheck } from "../../src/integration-check/service.js";
import type { IntegrationCheckRecord } from "../../src/integration-check/types.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../../src/project-runtime/context.js";
import {
  projectExecutionRuntimePort,
  projectHarnessExecutionPort,
  type ProjectCodeExecutionRuntimePort,
  type ProjectHarnessExecutionPort,
} from "../../src/project-runtime/execution-ports.js";
import { projectHarnessPlanningStartManifestHash, readProjectHarnessPlanningGate } from "../../src/project-harness/planning-gate-query.js";
import { publishProjectRuntimePlanningPackage } from "../../src/project-runtime/planning-publication.js";
import { withSkillNativeWorkflowStart } from "../../src/project-runtime/workflow-start.js";
import type { ManagedProject } from "../../src/types/index.js";
import type { AuditResult, RunMetadata, TaskQueueItem, TaskQueueRun, TaskRun, ValidationResult, WorkerLease } from "../../src/types/index.js";
import { writeTaskQueueItem, writeTaskQueueRun } from "../../src/task-queue/repository.js";
import { writeTaskRun, writeWorkerLease } from "../../src/task-run/repository.js";
import { writeWorkflowRun } from "../../src/workflow-run/repository.js";
import { hashWorkflowGraphPlan } from "../../src/workflow-artifacts/hashes.js";
import { issueLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { initializeSkillNativeSequentialWorkflow, type SkillNativeSequentialInitialization } from "../../src/workflow-runtime/skill-native-initialization.js";
import { createReadyProjectHarnessFixture } from "./project-harness-fixture.js";
import { createWorktreeWithRuntimePort } from "../../src/worktree/creation.js";

const execFileAsync = promisify(execFile);

export interface SkillNativeWorkbenchFixture {
  project: ManagedProject;
  ahoHome: string;
  skillRoot: string;
  resolution: ProjectRuntimeResolution;
  runtime: ProjectCodeExecutionRuntimePort;
  restoreEnvironment(): void;
}

export async function prepareSkillNativeWorkbenchFixture(input: {
  project: ManagedProject;
  ahoHome?: string;
}): Promise<SkillNativeWorkbenchFixture> {
  const projectRoot = input.project.path;
  const ahoHome = input.ahoHome ?? join(projectRoot, ".aho-home");
  const previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = ahoHome;
  try {
    await initializeGitSource(projectRoot);
    const harness = await createReadyProjectHarnessFixture({
      projectRoot,
      ahoHome,
      projectId: input.project.id,
      projectName: input.project.name,
    });
    const resolution = await resolveReadyProjectRuntime(input.project, ahoHome);
    return {
      project: input.project,
      ahoHome,
      skillRoot: harness.skillRoot,
      resolution,
      runtime: projectExecutionRuntimePort(input.project, resolution),
      restoreEnvironment() {
        if (previousAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = previousAhoHome;
      },
    };
  } catch (error) {
    if (previousAhoHome === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = previousAhoHome;
    throw error;
  }
}

export async function resolveSkillNativeWorkbenchRuntime(
  project: ManagedProject,
): Promise<ProjectCodeExecutionRuntimePort> {
  const resolution = await resolveReadyProjectRuntime(project, process.env.AHO_HOME);
  return projectExecutionRuntimePort(project, resolution);
}

export function skillNativeChangeRoot(fixture: SkillNativeWorkbenchFixture, changeId: string): string {
  return join(fixture.skillRoot, "state", "changes", "active", changeId);
}

export async function resolveSkillNativeWorkbenchHarness(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
): Promise<ProjectHarnessExecutionPort> {
  const conversationId = `conv-${changeId}`;
  const planning = await readProjectHarnessPlanningGate({
    projectId: fixture.project.id,
    projectRoot: fixture.project.path,
    skillRoot: fixture.skillRoot,
    conversationId,
    graphScopeId: `graph:${conversationId}`,
    changeId,
  });
  return projectHarnessExecutionPort(
    fixture.project,
    skillNativeChangeRoot(fixture, changeId),
    planning,
  );
}

export async function writeSkillNativeAcceptedSpecAndTasks(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  input: {
    tasks?: Array<{ id: string; text: string; done?: boolean; acId?: string }>;
    workflowOrder?: string[];
    sourceScopes?: string[];
  } = {},
): Promise<{
  resolution: ProjectRuntimeResolution;
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
}> {
  const conversationId = `conv-${changeId}`;
  const graphScopeId = `graph:${conversationId}`;
  const tasks = input.tasks ?? [{ id: "T-001", text: "Implement one task.", done: false, acId: "AC-001" }];
  const workflowOrder = input.workflowOrder ?? tasks.map((task) => task.id);
  const specMd = [
    "# Spec",
    "",
    "## Acceptance Criteria",
    "",
    ...tasks.map((task, index) => `- ${task.acId ?? `AC-${String(index + 1).padStart(3, "0")}`}: ${task.text}`),
    "",
  ].join("\n");
  const workflow = {
    version: "1.0" as const,
    mode: "sequential-v1" as const,
    nodes: workflowOrder.map((taskId, index) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) throw new Error(`Fixture Workflow order references unknown task: ${taskId}.`);
      const acId = task.acId ?? `AC-${String(tasks.indexOf(task) + 1).padStart(3, "0")}`;
      return {
        id: `fixture-task-${index + 1}`,
        title: task.text,
        taskIds: [task.id],
        acIds: [acId],
        prompt: `Objective: ${task.text} Required behavior: complete ${task.id}. Constraints: preserve the accepted scope. Expected evidence: validation and audit results.`,
        dependsOn: index === 0 ? [] : [`fixture-task-${index}`],
        sourceScopes: input.sourceScopes ?? [`src/${changeId}/**`],
      };
    }),
  };
  const planMd = `# Plan\n\nImplement this accepted task list.\n\n## Workflow\n\n\`\`\`json\n${JSON.stringify(workflow, null, 2)}\n\`\`\`\n`;
  const tasksMd = [
    "# Tasks",
    "",
    ...tasks.flatMap((task, index) => [
      `- [${task.done ? "x" : " "}] ${task.id}: ${task.text}`,
      `  - Covers: ${task.acId ?? `AC-${String(index + 1).padStart(3, "0")}`}`,
    ]),
    "",
  ].join("\n");
  const proposalHash = hashText(`${specMd}\n${planMd}\n${tasksMd}`);
  const commits = new Set<string>();
  await publishProjectRuntimePlanningPackage(fixture.resolution, {
    conversationId,
    conversationTitle: changeId,
    boundChangeId: changeId,
    currentGraphScopeId: graphScopeId,
    proposal: {
      id: `proposal-${changeId}`,
      hash: proposalHash,
      artifact: `planner-proposals/${changeId}/plan.md`,
      specMd,
      planMd,
      tasksMd,
    },
    acceptance: {
      version: "1.0",
      proposalHash,
      graphScopeId,
      contractRequired: false,
      contract: null,
      validation: ["Fixture Main accepted the exact Workbench plan."],
    },
  }, {
    hasCommit: (id) => commits.has(id),
    commit: ({ transactionId }) => { commits.add(transactionId); },
    deleteCommit: (id) => { commits.delete(id); },
  }, () => graphScopeId);
  const resolution = await resolveReadyProjectRuntime(fixture.project, fixture.ahoHome);
  fixture.resolution = resolution;
  fixture.runtime = projectExecutionRuntimePort(fixture.project, resolution);
  return {
    resolution,
    runtime: fixture.runtime,
    harness: await resolveSkillNativeWorkbenchHarness(fixture, changeId),
  };
}

export async function initializeSkillNativeSequentialFixture(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
): Promise<SkillNativeSequentialInitialization> {
  await authorizeSkillNativeWorkflowStartFixture(fixture, changeId);
  const conversationId = `conv-${changeId}`;
  const graphScopeId = `graph:${conversationId}`;
  const planning = await readProjectHarnessPlanningGate({
    projectId: fixture.project.id,
    projectRoot: fixture.project.path,
    skillRoot: fixture.skillRoot,
    conversationId,
    graphScopeId,
    changeId,
  });
  return withSkillNativeWorkflowStart(fixture.project, fixture.resolution, {
    changeId,
    graphScopeId,
    workflowGraphPlanId: planning.graph.id,
  }, initializeSkillNativeSequentialWorkflow);
}

export async function authorizeSkillNativeWorkflowStartFixture(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
): Promise<void> {
  const conversationId = `conv-${changeId}`;
  const graphScopeId = `graph:${conversationId}`;
  const planning = await readProjectHarnessPlanningGate({
    projectId: fixture.project.id,
    projectRoot: fixture.project.path,
    skillRoot: fixture.skillRoot,
    conversationId,
    graphScopeId,
    changeId,
  });
  const startManifestHash = projectHarnessPlanningStartManifestHash(
    planning,
    fixture.resolution.harness.contentFingerprint,
  );
  const [sourceHead, sourceStatus] = await Promise.all([
    getGitCommit(fixture.project.path),
    getGitStatusShort(fixture.project.path),
  ]);
  if (!sourceHead || sourceStatus.length > 0) {
    throw new Error(`Skill-native sequential fixture requires a clean Git source: ${sourceStatus.join(", ")}`);
  }
  const authorization = await issueLocalExecutionAuthorization(fixture.runtime, {
    projectId: fixture.project.id,
    changeId,
    conversationId,
    providerThreadId: `fixture-main-${conversationId}`,
    goalIdentityHash: hashText(`fixture-goal:${conversationId}`),
    mode: "stepwise",
    acceptedPlanId: planning.authorizationIntent.proposalId,
    acceptedPlanHash: planning.authorizationIntent.proposalHash,
    graphId: planning.graph.id,
    graphHash: hashWorkflowGraphPlan(planning.graph),
    artifactManifestHash: hashJson(planning.graph.sourceArtifactHashes),
    sourceHead,
    sourceStateHash: hashJson(sourceStatus),
    providerScopeHash: hashJson({ projectId: fixture.project.id, conversationId, providerId: "codex" }),
    permissionProfileHash: hashJson({ approvalPolicy: "never", sandbox: "runtime-owned-scoped-write", network: false }),
    policyHash: hashJson("local-execution-authorization-policy-v1"),
    targets: [{ transition: "workflow.run.start", targetId: planning.graph.id, manifestHash: startManifestHash }],
    budget: { maxCompletedOperations: 16, maxReworks: 1, maxChangedFiles: 100, maxChangedBytes: 10 * 1024 * 1024 },
    userDecision: { decisionId: `fixture-execute:${conversationId}`, actorId: "workbench-user", decidedAt: new Date().toISOString() },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  await writeJsonFile(join(skillNativeChangeRoot(fixture, changeId), "planning", "execution-authorization-intent.json"), {
    version: "1.0",
    status: "issued",
    changeId,
    conversationId,
    proposalId: planning.authorizationIntent.proposalId,
    proposalHash: planning.authorizationIntent.proposalHash,
    graphId: planning.graph.id,
    authorizationId: authorization.id,
    projectHarnessContentFingerprint: fixture.resolution.harness.contentFingerprint,
    startManifestHash,
    reason: null,
    updatedAt: new Date().toISOString(),
  });
}

export async function writeSkillNativeWorkflowRunRecord(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  status: "created" | "running" | "paused" | "blocked" | "failed" | "completed",
  overrides: { id?: string; currentNodeId?: "coder" | "validation" | "audit" | "rework-coder"; statusReason?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const id = overrides.id ?? `workflow-${changeId}`;
  await writeWorkflowRun(fixture.runtime, {
    version: "1.0",
    id,
    changeId,
    status,
    source: "default-code-change-workflow",
    templateId: "default-code-change-workflow",
    ...(overrides.currentNodeId ? { currentNodeId: overrides.currentNodeId } : {}),
    nodes: [{
      nodeId: "coder",
      status: status === "running" ? "running" : status === "completed" ? "completed" : status === "blocked" ? "blocked" : "queued",
      roleId: "coder-agent",
      attempt: 1,
      artifactRefs: [],
      updatedAt: now,
    }],
    maxReworkAttempts: 1,
    reworkAttempts: 0,
    recoveryKey: {
      version: "1.0",
      changeId,
      templateId: "default-code-change-workflow",
      sourceHash: hashText(`source:${changeId}`),
      policyHash: hashText(`policy:${changeId}`),
      capabilityHash: hashText(`capability:${changeId}`),
      createdAt: now,
    },
    ...(overrides.statusReason ? { statusReason: overrides.statusReason } : {}),
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
    startedAt: status === "created" ? null : now,
    finishedAt: ["completed", "failed", "blocked"].includes(status) ? now : null,
  });
}

export async function writeSkillNativeTaskQueueRecord(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  queueId: string,
  status: TaskQueueRun["status"],
  overrides: Partial<TaskQueueRun> = {},
): Promise<TaskQueueRun> {
  const now = new Date().toISOString();
  return writeTaskQueueRun(fixture.runtime, {
    version: "1.0",
    id: queueId,
    projectId: fixture.project.id,
    changeId,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" ? null : now,
    finishedAt: ["completed", "blocked", "failed"].includes(status) ? now : null,
    totalCount: 1,
    completedCount: status === "completed" ? 1 : 0,
    ...overrides,
  });
}

export async function writeSkillNativeTaskQueueItemRecord(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  queueRunId: string,
  itemId: string,
  taskId: string,
  order: number,
  status: TaskQueueItem["status"],
  overrides: Partial<TaskQueueItem> = {},
): Promise<TaskQueueItem> {
  const now = new Date().toISOString();
  return writeTaskQueueItem(fixture.runtime, {
    version: "1.0",
    id: itemId,
    projectId: fixture.project.id,
    changeId,
    queueRunId,
    taskId,
    order,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" || status === "skipped" ? null : now,
    finishedAt: ["completed", "blocked", "failed", "skipped"].includes(status) ? now : null,
    ...overrides,
  });
}

export async function writeSkillNativeTaskRunRecord(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  taskRunId: string,
  taskId: string,
  status: TaskRun["status"],
  attempt: number,
  overrides: Partial<TaskRun> = {},
): Promise<TaskRun> {
  const now = new Date().toISOString();
  return writeTaskRun(fixture.runtime, {
    version: "1.0",
    id: taskRunId,
    projectId: fixture.project.id,
    changeId,
    taskId,
    roleId: "coder",
    attempt,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: ["running", "claimed", "queued"].includes(status) ? null : now,
    ...overrides,
  });
}

export async function writeSkillNativeWorkerLeaseRecord(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  leaseId: string,
  taskRunId: string,
  taskId: string,
  status: WorkerLease["status"],
): Promise<WorkerLease> {
  const now = new Date().toISOString();
  return writeWorkerLease(fixture.runtime, {
    version: "1.0",
    id: leaseId,
    projectId: fixture.project.id,
    changeId,
    taskRunId,
    taskId,
    roleId: "coder",
    workerId: "local-test",
    status,
    claimedAt: now,
    updatedAt: now,
    releasedAt: status === "released" ? now : null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
}

export async function writeSkillNativeCoderRun(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  runId: string,
  taskIds: string[],
  worktreeId: string,
  status: RunMetadata["status"],
  taskRunId?: string,
): Promise<RunMetadata> {
  const runDir = join(fixture.runtime.runsRoot, runId);
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: fixture.project.path,
    runtime: "provider-code",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["codex"],
    status,
    exitCode: status === "failed" ? 1 : 0,
    signal: null,
    startedAt: now,
    finishedAt: status === "running" || status === "created" ? null : now,
    artifacts: {
      owner: "runtime-sidecar",
      directory: `runs/${runId}`,
      context: `runs/${runId}/context.md`,
      events: `runs/${runId}/events.jsonl`,
      stdout: `runs/${runId}/stdout.log`,
      stderr: `runs/${runId}/stderr.log`,
    },
    worktree: {
      worktreeId,
      branchName: `aho/${runId}`,
      baseRef: "HEAD",
      baseCommit: "abc123",
      checkoutPath: join(fixture.project.path, "fixture-worktrees", worktreeId),
      metadataPath: `worktrees/metadata/${worktreeId}.json`,
    },
    ...(taskIds.length ? { taskIds } : {}),
    ...(taskRunId ? { taskRunId } : {}),
    worktreeDiffHash: `fixture-diff:${worktreeId}`,
  };
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "run.completed", runId })}\n`, "utf8");
  return run;
}

export async function writeSkillNativeValidationResult(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  validationId: string,
  worktreeId: string,
  status: ValidationResult["status"],
  diffHash = `fixture-diff:${worktreeId}`,
): Promise<void> {
  const dir = join(fixture.runtime.runsRoot, validationId);
  const now = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "validation.json"), `${JSON.stringify({
    version: "1.0", id: validationId, runId: validationId, changeId, profile: "test", status,
    executionMode: "worktree", worktreeId, worktreeDiffHash: diffHash, startedAt: now, finishedAt: now, commands: [],
  }, null, 2)}\n`, "utf8");
}

export async function writeSkillNativeAuditResult(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  auditId: string,
  worktreeId: string,
  status: AuditResult["status"],
  diffHash = `fixture-diff:${worktreeId}`,
): Promise<void> {
  const dir = join(fixture.runtime.runsRoot, auditId);
  const now = new Date().toISOString();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "audit.json"), `${JSON.stringify({
    version: "1.0", id: auditId, runId: auditId, changeId, status, worktreeId,
    validationId: auditId.replace(/audit/i, "validation"), worktreeDiffHash: diffHash,
    startedAt: now, finishedAt: now, findings: [],
    artifacts: { audit: `${auditId}/audit.json`, auditMarkdown: `${auditId}/audit.md`, lastMessage: `${auditId}/last-message.md` },
  }, null, 2)}\n`, "utf8");
}

export async function createSkillNativeWorkbenchIntegrationCheck(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
): Promise<{ check: IntegrationCheckRecord; worktreeIds: [string, string] }> {
  const harness = await resolveSkillNativeWorkbenchHarness(fixture, changeId);
  const first = await createSkillNativeWorkbenchReadyCandidate(fixture, changeId, "candidate-a.txt", "candidate A\n");
  const second = await createSkillNativeWorkbenchReadyCandidate(fixture, changeId, "candidate-b.txt", "candidate B\n");
  const result = await runSkillNativeIntegrationCheck(fixture.project, fixture.runtime, [{
    changeId,
    worktreeId: first.worktreeId,
    diffHash: first.diffHash,
    diffStat: first.diffStat,
    sourceHead: await getGitCommit(fixture.project.path),
    validationRunId: first.validationId,
    auditRunId: first.auditId,
  }, {
    changeId,
    worktreeId: second.worktreeId,
    diffHash: second.diffHash,
    diffStat: second.diffStat,
    sourceHead: await getGitCommit(fixture.project.path),
    validationRunId: second.validationId,
    auditRunId: second.auditId,
  }], harness.changeStatus.change!.id);
  return { check: result.check, worktreeIds: [first.worktreeId, second.worktreeId] };
}

export async function createSkillNativeWorkbenchReadyCandidate(
  fixture: SkillNativeWorkbenchFixture,
  changeId: string,
  changedPath: string,
  changedContent: string,
): Promise<{ worktreeId: string; worktreePath: string; diffHash: string; diffStat: string; validationId: string; auditId: string }> {
  const worktree = await createWorktreeWithRuntimePort(fixture.project, fixture.runtime, changeId);
  await writeFile(join(worktree.metadata.checkoutPath, ...changedPath.split("/")), changedContent, "utf8");
  const diff = await collectWorktreeDiff(fixture.runtime, worktree.metadata.worktreeId, changeId);
  const validationId = `validation-${worktree.metadata.worktreeId}`;
  const auditId = `audit-${worktree.metadata.worktreeId}`;
  await writeSkillNativeValidationResult(fixture, changeId, validationId, worktree.metadata.worktreeId, "passed", diff.diffHash);
  await writeSkillNativeAuditResult(fixture, changeId, auditId, worktree.metadata.worktreeId, "approved", diff.diffHash);
  return {
    worktreeId: worktree.metadata.worktreeId,
    worktreePath: worktree.metadata.checkoutPath,
    diffHash: diff.diffHash,
    diffStat: diff.diffStat,
    validationId,
    auditId,
  };
}

async function resolveReadyProjectRuntime(
  project: ManagedProject,
  ahoHome?: string,
): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    ...(ahoHome ? { ahoHome } : {}),
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Skill-native Workbench fixture requires a ready project Runtime: ${state.state}.`);
  }
  return state.resolution;
}

async function initializeGitSource(projectRoot: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: projectRoot });
  await writeFile(join(projectRoot, ".gitignore"), [
    ".agents/",
    ".claude/",
    ".aho-home/",
    "fake-codex-bin/",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(projectRoot, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await execFileAsync("git", ["add", ".gitignore", "package.json"], { cwd: projectRoot });
  await execFileAsync("git", ["commit", "-m", "fixture source"], { cwd: projectRoot });
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}
