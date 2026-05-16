import { existsSync } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { previewWorktreeApply } from "../apply/manager.js";
import { listAuditResults, summarizeAudit } from "../audit/artifacts.js";
import { listPlanProposalSummaries, listSpecProposalSummaries } from "../change/proposals.js";
import { getChangeStatus } from "../change/manager.js";
import { buildChangeIndex, hasPendingEvolution } from "../ecl/index.js";
import { readRequiredJsonFile } from "../fs/json.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { getMemoryStatus } from "../memory/status.js";
import { resolveMemory } from "../memory/resolver.js";
import { readProjectMarker } from "../project/marker.js";
import { getProjectStatus } from "../project/status.js";
import { listRuns, readRun } from "../run/manager.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { getSpecTestStatus } from "../spec-test/manager.js";
import { listSpecTestProposalSummaries } from "../spec-test/proposal.js";
import { listValidationResults, summarizeValidation } from "../validation/artifacts.js";
import { listWorktreeStatuses, listWorktreesForChange } from "../worktree/manager.js";
import { listTopicMessages, type OrchestrationPlanCard } from "./chat.js";
import { WorkbenchStore, type StoredDecisionRecord } from "./store.js";
import type {
  ChangeIndexItem,
  ChangeMetadata,
  ManagedProject,
  MemoryStatus,
  ResolvedMemory,
  RunEvent,
  RunMetadata,
} from "../types/index.js";

export type WorkbenchTopicState = "active" | "parking" | "archive";
export type WorkbenchApprovalKind =
  | "spec-proposal"
  | "plan-proposal"
  | "spec-test-proposal"
  | "audit-proposal"
  | "worktree-apply"
  | "change-close"
  | "evolution"
  | "attention";
export type HarnessGapStatus = "missing" | "partial" | "available";
export type HarnessGapSeverity = "info" | "warning";

export interface WorkbenchProjectInput {
  project: ManagedProject | null;
  path: string;
}

export interface WorkbenchTopicSummary {
  id: string;
  name: string;
  title: string;
  state: WorkbenchTopicState;
  path: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
  archivePath?: string | null;
}

export interface WorkbenchThreadEvent {
  id: string;
  type: string;
  label: string;
  timestamp?: string;
  source: "change" | "run" | "proposal" | "validation" | "audit" | "worktree" | "spec-test" | "evolution" | "chat" | "workflow";
  artifact?: string;
  status?: string;
  runId?: string;
  planCard?: OrchestrationPlanCard;
}

export interface WorkbenchApprovalItem {
  id: string;
  kind: WorkbenchApprovalKind;
  label: string;
  changeId?: string;
  runId?: string;
  targetId?: string;
  severity: "info" | "warning" | "blocking";
  action?: WorkbenchApprovalAction;
  artifact?: string;
  reason?: string;
}

export interface WorkbenchDecisionItem {
  id: string;
  kind: string;
  label: string;
  status: "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";
  changeId?: string;
  runId?: string;
  targetId?: string;
  artifact?: string;
  summary: string;
  feedback?: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkbenchApprovalAction {
  actionId: string;
  label: string;
  command: string;
  args: string[];
  mutates: boolean;
  requiresConfirmation: boolean;
}

export interface WorkbenchArtifactPreview {
  key: string;
  path: string;
  kind: string;
  exists: boolean;
  sizeBytes?: number;
  preview?: string;
  tail?: string;
  truncated?: boolean;
  diagnostic?: string;
}

export interface WorkbenchStreamPacket {
  run: RunMetadata;
  live: false;
  events: WorkbenchThreadEvent[];
  artifacts: WorkbenchArtifactPreview[];
  diagnostics: string[];
  warnings: string[];
}

export interface WorkbenchRoleSummary {
  id: string;
  name: string;
  profilePath: string;
  writeCapability: "read-only" | "worktree-write" | "deterministic-writer";
  preferredRuntime: string;
  delegatable: boolean;
  humanConfirmation: string;
  sections: string[];
}

export interface HarnessGap {
  id: string;
  severity: HarnessGapSeverity;
  status: HarnessGapStatus;
  recommendedPhase: string;
  summary: string;
}

export interface WorkbenchTopicDetail extends WorkbenchTopicSummary {
  change: ChangeMetadata | null;
  reviewStatus?: string;
  closeGate?: {
    ready: boolean;
    warnings: string[];
    blockingIssues: string[];
  };
  acCount?: number;
  taskCount?: number;
  specTest?: unknown;
  drift?: unknown;
  runs: RunMetadata[];
  worktrees: unknown[];
  validations: unknown[];
  audits: unknown[];
  threadEvents: WorkbenchThreadEvent[];
}

export interface WorkbenchSnapshot {
  project: unknown;
  memory: MemoryStatus;
  left: {
    project: unknown;
    memory: MemoryStatus;
    topics: WorkbenchTopicSummary[];
    repo: {
      path: string;
      exists?: boolean;
      git?: boolean;
      branch?: string | null;
      dirty?: boolean | null;
    };
  };
  center: {
    selectedTopic: WorkbenchTopicDetail | null;
    thread: {
      events: WorkbenchThreadEvent[];
    };
    agentLoop: {
      runs: RunMetadata[];
    };
  };
  right: {
    approvals: WorkbenchApprovalItem[];
    decisions: WorkbenchDecisionItem[];
  };
  roles: WorkbenchRoleSummary[];
  harnessGaps: HarnessGap[];
  warnings: string[];
}

const changeMetadataSchema = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  title: z.string(),
  state: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  archivePath: z.string().nullable(),
});

export async function getWorkbenchSnapshot(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchSnapshot> {
  const memoryStatus = await getMemoryStatus(input.project, input.path);
  const projectStatus = await getProjectStatus(input.project, input.path);
  const memory = await resolveWorkbenchMemory(input);
  const roles = await listWorkbenchRoles();
  const gaps = buildHarnessGaps();
  const warnings: string[] = [];

  if (!input.project) warnings.push("Project is not registered; snapshot is diagnostic only.");
  if (!memoryStatus.managed) warnings.push("Project is not managed by AHO.");
  if (!memoryStatus.memoryAvailable || !memory.supported) {
    warnings.push("Durable memory is unavailable. AHO will not infer project history.");
    return {
      project: input.project,
      memory: memoryStatus,
      left: {
        project: input.project,
        memory: memoryStatus,
        topics: [],
        repo: buildRepoSummary(projectStatus),
      },
      center: { selectedTopic: null, thread: { events: [] }, agentLoop: { runs: [] } },
      right: { approvals: [], decisions: [] },
      roles,
      harnessGaps: gaps,
      warnings,
    };
  }

  const topics = await listWorkbenchTopicsFromMemory(memory);
  const selectedTopic = await selectTopicDetail(input.project, memory, topics, options.topicId);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, topics) : [];
  const decisions = input.project ? await listWorkbenchDecisions(memory, options.topicId) : [];
  return {
    project: input.project,
    memory: memoryStatus,
    left: {
      project: input.project,
      memory: memoryStatus,
      topics,
      repo: buildRepoSummary(projectStatus),
    },
    center: {
      selectedTopic,
      thread: { events: selectedTopic?.threadEvents ?? [] },
      agentLoop: { runs: selectedTopic?.runs ?? [] },
    },
    right: { approvals, decisions },
    roles,
    harnessGaps: gaps,
    warnings,
  };
}

export async function listWorkbenchTopics(input: WorkbenchProjectInput): Promise<WorkbenchTopicSummary[]> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  return listWorkbenchTopicsFromMemory(memory);
}

export async function getWorkbenchTopic(input: WorkbenchProjectInput, topicId: string): Promise<WorkbenchTopicDetail> {
  const memory = await resolveWorkbenchMemory(input);
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const detail = await selectTopicDetail(input.project, memory, topics, topicId);
  if (!detail) throw new Error(`Topic not found: ${topicId}.`);
  return detail;
}

export async function getWorkbenchStream(input: WorkbenchProjectInput, runId: string): Promise<WorkbenchStreamPacket> {
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.runsRoot)) {
    throw new Error("Durable memory is unavailable; cannot replay run stream.");
  }
  const run = await readRun(memory, runId);
  const events = await readRunEvents(memory, run);
  const { artifacts, diagnostics, warnings } = await summarizeRunArtifacts(memory, run);
  return {
    run,
    live: false,
    events,
    artifacts,
    diagnostics,
    warnings,
  };
}

export async function listWorkbenchApprovals(input: WorkbenchProjectInput, options: { topicId?: string } = {}): Promise<WorkbenchApprovalItem[]> {
  if (!input.project) return [];
  const memory = await resolveWorkbenchMemory(input);
  if (!memory.supported || !existsSync(memory.memoryRoot)) return [];
  const topics = await listWorkbenchTopicsFromMemory(memory);
  const approvals = await buildApprovalInbox(input.project, memory, topics);
  if (!options.topicId) return approvals;
  return approvals.filter((item) => !item.changeId || item.changeId === options.topicId);
}

export async function listWorkbenchRoles(): Promise<WorkbenchRoleSummary[]> {
  const profileRoot = join(dirname(getTemplateRoot()), "agent-profiles");
  if (!existsSync(profileRoot)) return [];
  const entries = await readdir(profileRoot, { withFileTypes: true });
  const roles = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => summarizeRoleProfile(profileRoot, entry.name)));
  return roles.sort((a, b) => a.id.localeCompare(b.id));
}

async function listWorkbenchDecisions(memory: ResolvedMemory, topicId?: string): Promise<WorkbenchDecisionItem[]> {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listDecisions(memory.projectId, topicId).slice(0, 20).map(mapDecisionRecord);
  } finally {
    store.close();
  }
}

function mapDecisionRecord(record: StoredDecisionRecord): WorkbenchDecisionItem {
  return {
    id: record.id,
    kind: record.decisionType,
    label: record.label,
    status: record.status,
    changeId: record.changeId ?? undefined,
    runId: record.runId ?? undefined,
    targetId: record.targetId ?? undefined,
    artifact: record.artifact ?? undefined,
    summary: record.summary,
    feedback: record.feedback ?? undefined,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? undefined,
  };
}

async function listWorkbenchTopicsFromMemory(memory: ResolvedMemory): Promise<WorkbenchTopicSummary[]> {
  const index = await buildChangeIndex(memory);
  const groups: Array<[WorkbenchTopicState, ChangeIndexItem[]]> = [
    ["active", index.active],
    ["parking", index.parking],
    ["archive", index.archive],
  ];
  const topics: WorkbenchTopicSummary[] = [];
  for (const [state, items] of groups) {
    for (const item of items) topics.push(await topicSummaryFromItem(memory, state, item));
  }
  return topics.sort((a, b) => stateRank(a.state) - stateRank(b.state) || (b.updatedAt ?? b.name).localeCompare(a.updatedAt ?? a.name));
}

async function topicSummaryFromItem(memory: ResolvedMemory, state: WorkbenchTopicState, item: ChangeIndexItem): Promise<WorkbenchTopicSummary> {
  const metadata = await readChangeMetadataAt(memory, item.path);
  return {
    id: metadata?.id ?? item.name,
    name: item.name,
    title: metadata?.title ?? item.name,
    state,
    path: item.path,
    createdAt: metadata?.createdAt,
    updatedAt: metadata?.updatedAt,
    closedAt: metadata?.closedAt,
    archivePath: metadata?.archivePath,
  };
}

async function selectTopicDetail(project: ManagedProject | null, memory: ResolvedMemory, topics: WorkbenchTopicSummary[], topicId?: string): Promise<WorkbenchTopicDetail | null> {
  const topic = topicId
    ? topics.find((item) => item.id === topicId || item.name === topicId)
    : topics.find((item) => item.state === "active") ?? topics[0];
  if (!topic) return null;

  const change = await readChangeMetadataAt(memory, topic.path);
  const allRuns = await listRuns(memory);
  const runs = allRuns.filter((run) => run.changeId === topic.id || run.changeId === topic.name);
  const [worktrees, validations, audits] = await Promise.all([
    listWorktreesForChange(memory, topic.id).catch(() => []),
    listValidationResults(memory, topic.id).then((items) => items.map(summarizeValidation)).catch(() => []),
    listAuditResults(memory, topic.id).then((items) => items.map(summarizeAudit)).catch(() => []),
  ]);

  let statusDetail: Awaited<ReturnType<typeof getChangeStatus>> | null = null;
  let specTest: unknown = null;
  let drift: unknown = null;
  if (project && topic.state === "active") {
    statusDetail = await getChangeStatus(project).catch(() => null);
    specTest = await getSpecTestStatus(memory).catch(() => null);
    drift = await getSpecTestDriftReport(memory).catch(() => null);
  }

  const threadEvents = await buildThreadEvents(project, memory, topic, runs, validations, audits);
  return {
    ...topic,
    change,
    reviewStatus: statusDetail?.reviewStatus,
    closeGate: statusDetail?.closeGate,
    acCount: statusDetail?.acMap?.acceptanceCriteria.length,
    taskCount: statusDetail?.acMap?.tasks.length,
    specTest,
    drift,
    runs,
    worktrees,
    validations,
    audits,
    threadEvents,
  };
}

async function buildThreadEvents(
  project: ManagedProject | null,
  memory: ResolvedMemory,
  topic: WorkbenchTopicSummary,
  runs: RunMetadata[],
  validations: unknown[],
  audits: unknown[],
): Promise<WorkbenchThreadEvent[]> {
  const events: WorkbenchThreadEvent[] = [
    {
      id: `${topic.id}:change`,
      type: `change.${topic.state}`,
      label: topic.state === "archive" ? `Archived: ${topic.title}` : `Topic: ${topic.title}`,
      timestamp: topic.updatedAt ?? topic.createdAt,
      source: "change",
      artifact: topic.path,
      status: topic.state,
    },
  ];
  if (project && topic.state === "active") {
    const messages = await listTopicMessages(project, topic.id).catch(() => []);
    for (const message of messages) {
      events.push({
        id: message.id,
        type: message.type,
        label: message.text ?? message.actionType ?? message.status ?? message.type,
        timestamp: message.timestamp,
        source: message.type.startsWith("workflow.") ? "workflow" : "chat",
        artifact: message.artifact,
        status: message.status,
        runId: message.runId,
        planCard: message.planCard,
      });
    }
  }
  for (const run of runs) {
    events.push({
      id: run.id,
      type: `run.${run.runtime}`,
      label: `${run.runtime}: ${run.status}`,
      timestamp: run.finishedAt ?? run.startedAt,
      source: "run",
      artifact: run.artifacts.directory,
      status: run.status,
      runId: run.id,
    });
    events.push(...await readRunEvents(memory, run));
  }
  for (const validation of validations as Array<{ id: string; status: string; finishedAt?: string; runId?: string }>) {
    events.push({ id: validation.id, type: "validation", label: `Validation: ${validation.status}`, timestamp: validation.finishedAt, source: "validation", status: validation.status, runId: validation.runId });
  }
  for (const audit of audits as Array<{ id: string; status: string; finishedAt?: string; runId?: string }>) {
    events.push({ id: audit.id, type: "audit", label: `Audit: ${audit.status}`, timestamp: audit.finishedAt, source: "audit", status: audit.status, runId: audit.runId });
  }
  return events.sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""));
}

async function readRunEvents(memory: ResolvedMemory, run: RunMetadata): Promise<WorkbenchThreadEvent[]> {
  const eventsPath = join(memory.runsRoot, run.id, "events.jsonl");
  if (!existsSync(eventsPath)) return [];
  const content = await readFile(eventsPath, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => parseRunEventLine(line, index, run))
    .filter((item): item is WorkbenchThreadEvent => item !== null);
}

function parseRunEventLine(line: string, index: number, run: RunMetadata): WorkbenchThreadEvent | null {
  try {
    const event = JSON.parse(line) as RunEvent;
    return {
      id: `${run.id}:event:${index}`,
      type: event.type,
      label: event.type,
      timestamp: event.timestamp,
      source: sourceForEvent(event.type),
      artifact: run.artifacts.directory,
      status: typeof event.data?.status === "string" ? event.data.status : undefined,
      runId: run.id,
    };
  } catch {
    return null;
  }
}

async function buildApprovalInbox(project: ManagedProject, memory: ResolvedMemory, topics: WorkbenchTopicSummary[]): Promise<WorkbenchApprovalItem[]> {
  const approvals: WorkbenchApprovalItem[] = [];
  const activeTopic = topics.find((item) => item.state === "active") ?? null;
  const [specProposals, planProposals, specTestProposals] = await Promise.all([
    listSpecProposalSummaries(project).catch(() => []),
    listPlanProposalSummaries(project).catch(() => []),
    listSpecTestProposalSummaries(project).catch(() => []),
  ]);

  for (const proposal of specProposals.filter((item) => item.status === "proposed")) {
    if (await runHasEvent(memory, proposal.runId, "change.spec.proposal.accepted")) continue;
    approvals.push({
      id: `spec:${proposal.id}`,
      kind: "spec-proposal",
      label: `Spec proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("change.spec.accept", "Accept spec proposal", "change", ["spec", "accept", project.id, proposal.id], true),
    });
  }
  for (const proposal of planProposals.filter((item) => item.status === "proposed")) {
    if (await runHasEvent(memory, proposal.runId, "change.plan.proposal.accepted")) continue;
    approvals.push({
      id: `plan:${proposal.id}`,
      kind: "plan-proposal",
      label: `Plan proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("change.plan.accept", "Accept plan proposal", "change", ["plan", "accept", project.id, proposal.id], true),
    });
  }
  for (const proposal of specTestProposals.filter((item) => item.status === "proposed" && item.acceptedSourceRootCount === 0)) {
    approvals.push({
      id: `spec-test:${proposal.id}`,
      kind: "spec-test-proposal",
      label: `Spec-test evidence proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: approvalAction("spec-test.proposal.accept-all-existing", "Accept source-root spec-test evidence", "spec-test", ["proposal", "accept", project.id, proposal.id, "--all-existing"], true),
    });
  }

  if (activeTopic) {
    const audits = await listAuditResults(memory, activeTopic.id).catch(() => []);
    for (const audit of audits.filter((item) => item.status === "approved" || item.status === "approved-with-notes").slice(0, 3)) {
      if (await auditAlreadyAccepted(memory, activeTopic.path, audit.id)) continue;
      approvals.push({
        id: `audit:${audit.id}`,
        kind: "audit-proposal",
        label: `Audit proposal can be accepted: ${audit.id}`,
        changeId: audit.changeId,
        runId: audit.runId,
        targetId: audit.id,
        severity: "info",
        action: approvalAction("audit.accept", "Accept audit", "audit", ["accept", project.id, audit.id], true),
        artifact: audit.artifacts.audit,
      });
    }
    const worktrees = await listWorktreeStatuses(memory).catch(() => []);
    for (const worktree of worktrees.filter((item) => item.changeId === activeTopic.id && item.status !== "applied")) {
      const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
      if (preview?.gate.ready) {
        approvals.push({
          id: `apply:${worktree.worktreeId}`,
          kind: "worktree-apply",
          label: `Worktree ready to apply: ${worktree.worktreeId}`,
          changeId: worktree.changeId,
          targetId: worktree.worktreeId,
          severity: "info",
          action: approvalAction("worktree.apply", "Apply worktree", "worktree", ["apply", project.id, worktree.worktreeId], true),
        });
      }
    }
    const status = await getChangeStatus(project).catch(() => null);
    if (status?.closeGate.ready) {
      approvals.push({
        id: `close:${activeTopic.id}`,
        kind: "change-close",
        label: `Change ready to close: ${activeTopic.id}`,
        changeId: activeTopic.id,
        targetId: activeTopic.id,
        severity: "info",
        action: approvalAction("change.close", "Close change", "change", ["close", project.id], true),
      });
    }
    if (status?.latestValidation?.status === "failed") {
      approvals.push({
        id: `attention:validation:${status.latestValidation.id}`,
        kind: "attention",
        label: `Latest validation failed: ${status.latestValidation.id}`,
        changeId: activeTopic.id,
        targetId: status.latestValidation.id,
        severity: "blocking",
        reason: "Failed validation blocks close.",
      });
    }
    if (status?.latestAudit?.status === "blocked") {
      approvals.push({
        id: `attention:audit:${status.latestAudit.id}`,
        kind: "attention",
        label: `Latest audit blocked: ${status.latestAudit.id}`,
        changeId: activeTopic.id,
        targetId: status.latestAudit.id,
        severity: "blocking",
        reason: "Blocked audit prevents safe close.",
      });
    }
  }

  if (hasPendingEvolution(memory)) {
    approvals.push({
      id: "evolution:pending",
      kind: "evolution",
      label: "Harness evolution pending",
      severity: "warning",
      action: approvalAction("evolution.handle", "Handle Harness evolution", "harness-evolve", ["status"], false),
      artifact: "harness/evolution/pending.md",
      reason: "Handle through proposal, independent review, validation, results.tsv, and mark-complete.",
    });
  }
  return approvals;
}

async function runHasEvent(memory: ResolvedMemory, runId: string, eventType: string): Promise<boolean> {
  try {
    const run = await readRun(memory, runId);
    const events = await readRunEvents(memory, run);
    return events.some((event) => event.type === eventType);
  } catch {
    return false;
  }
}

async function auditAlreadyAccepted(memory: ResolvedMemory, changePath: string, auditId: string): Promise<boolean> {
  const reviewPath = join(memory.memoryRoot, changePath, "reviews", "review.md");
  if (!existsSync(reviewPath)) return false;
  try {
    const content = await readFile(reviewPath, "utf8");
    return content.includes(`- Audit ID: ${auditId}`) || content.includes(`Audit ID: ${auditId}`);
  } catch {
    return false;
  }
}

async function summarizeRunArtifacts(memory: ResolvedMemory, run: RunMetadata): Promise<{ artifacts: WorkbenchArtifactPreview[]; diagnostics: string[]; warnings: string[] }> {
  const diagnostics: string[] = [];
  const warnings: string[] = [];
  const artifacts: WorkbenchArtifactPreview[] = [];
  const baseRoot = run.artifacts.base === "memory-root" ? memory.memoryRoot : memory.projectRoot;
  const runDirectory = resolve(baseRoot, run.artifacts.directory);
  const known = Object.entries(run.artifacts)
    .filter(([key, value]) => key !== "base" && key !== "directory" && typeof value === "string") as Array<[string, string]>;
  const extraKnown = ["codex-events.jsonl", "last-message.md", "diff.patch", "diff-stat.txt", "validation.json", "audit.json", "audit.md", "implementation.md"];

  for (const [key, artifactPath] of known) {
    artifacts.push(await summarizeArtifact(key, artifactPath, baseRoot, runDirectory, diagnostics));
  }
  for (const fileName of extraKnown) {
    const artifactPath = `${run.artifacts.directory}/${fileName}`;
    if (known.some(([, existing]) => existing === artifactPath)) continue;
    const key = keyForKnownArtifact(fileName);
    const summary = await summarizeArtifact(key, artifactPath, baseRoot, runDirectory, diagnostics, false);
    if (summary.exists) artifacts.push(summary);
  }
  if (!artifacts.some((item) => item.key === "events" && item.exists)) {
    diagnostics.push("Run events artifact is missing.");
  }
  return { artifacts, diagnostics, warnings };
}

async function summarizeArtifact(key: string, artifactPath: string, baseRoot: string, runDirectory: string, diagnostics: string[], includeMissing = true): Promise<WorkbenchArtifactPreview> {
  const absolutePath = resolve(baseRoot, artifactPath);
  const base: WorkbenchArtifactPreview = {
    key,
    path: artifactPath,
    kind: artifactKind(key, artifactPath),
    exists: false,
  };
  if (!isWithinDirectory(absolutePath, runDirectory)) {
    const diagnostic = `Artifact ${key} is outside the run directory and was not read.`;
    diagnostics.push(diagnostic);
    return { ...base, diagnostic };
  }
  if (!existsSync(absolutePath)) {
    if (includeMissing) diagnostics.push(`Artifact ${key} is missing: ${artifactPath}`);
    return base;
  }
  const stats = await stat(absolutePath);
  if (!stats.isFile()) return { ...base, exists: true, sizeBytes: stats.size, diagnostic: "Artifact path is not a file." };
  const preview = await readTextPreview(absolutePath, stats.size);
  return {
    ...base,
    exists: true,
    sizeBytes: stats.size,
    ...preview,
  };
}

async function readTextPreview(path: string, sizeBytes: number): Promise<Pick<WorkbenchArtifactPreview, "preview" | "tail" | "truncated">> {
  const maxChars = 4000;
  if (sizeBytes > 1024 * 1024) {
    const chunkBytes = 16 * 1024;
    const file = await open(path, "r");
    try {
      const firstBuffer = Buffer.alloc(chunkBytes);
      const lastBuffer = Buffer.alloc(chunkBytes);
      const firstRead = await file.read(firstBuffer, 0, chunkBytes, 0);
      const lastRead = await file.read(lastBuffer, 0, chunkBytes, Math.max(0, sizeBytes - chunkBytes));
      const firstText = firstBuffer.subarray(0, firstRead.bytesRead).toString("utf8");
      const lastText = lastBuffer.subarray(0, lastRead.bytesRead).toString("utf8");
      return {
        preview: firstText.slice(0, maxChars),
        tail: lastText.slice(-maxChars),
        truncated: true,
      };
    } finally {
      await file.close();
    }
  }
  const content = await readFile(path, "utf8");
  return {
    preview: content.slice(0, maxChars),
    tail: content.length > maxChars ? content.slice(-maxChars) : content,
    truncated: content.length > maxChars,
  };
}

function isWithinDirectory(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(":"));
}

function keyForKnownArtifact(fileName: string): string {
  if (fileName === "codex-events.jsonl") return "codexEvents";
  if (fileName === "last-message.md") return "lastMessage";
  if (fileName === "diff.patch") return "diff";
  if (fileName === "diff-stat.txt") return "diffStat";
  if (fileName === "audit.md") return "auditMarkdown";
  return fileName.replace(/\.[^.]+$/, "");
}

function artifactKind(key: string, path: string): string {
  if (key === "stdout" || key === "stderr") return "log";
  if (key === "events" || key === "codexEvents") return "jsonl";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".patch")) return "patch";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

function approvalAction(actionId: string, label: string, command: string, args: string[], mutates: boolean): WorkbenchApprovalAction {
  return {
    actionId,
    label,
    command,
    args,
    mutates,
    requiresConfirmation: mutates,
  };
}

async function summarizeRoleProfile(profileRoot: string, fileName: string): Promise<WorkbenchRoleSummary> {
  const profilePath = join(profileRoot, fileName);
  const content = await readFile(profilePath, "utf8");
  const id = fileName.replace(/\.md$/, "");
  const title = /^#\s+(.+)\s*$/m.exec(content)?.[1] ?? id;
  const sections = [...content.matchAll(/^##\s+(.+)\s*$/gm)].map((match) => match[1]);
  return {
    id,
    name: title,
    profilePath: relative(dirname(getTemplateRoot()), profilePath).replace(/\\/g, "/"),
    writeCapability: writeCapabilityForRole(id),
    preferredRuntime: preferredRuntimeForRole(id),
    delegatable: id !== "validator",
    humanConfirmation: humanConfirmationForRole(id),
    sections,
  };
}

function buildHarnessGaps(): HarnessGap[] {
  return [
    {
      id: "roleCatalog",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5A",
      summary: "Bundled role profiles exist and are readable, but there is no declarative project role registry yet.",
    },
    {
      id: "runStreamIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "Run stream replay packets are available after Phase 5B, but live transport and cancel/interrupt remain future work.",
    },
    {
      id: "approvalIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5B",
      summary: "Approvals are derived from canonical state; no materialized approval queue exists.",
    },
    {
      id: "sessionModel",
      severity: "info",
      status: "missing",
      recommendedPhase: "Future",
      summary: "Run is the current execution source of truth. Session remains a future runtime auxiliary.",
    },
    {
      id: "workspaceIndex",
      severity: "info",
      status: "partial",
      recommendedPhase: "Phase 5C",
      summary: "Memory Resolver provides roots, but there is no workspace-wide index comparable to AgentScope workspace indexes.",
    },
    {
      id: "subagentSpec",
      severity: "info",
      status: "missing",
      recommendedPhase: "Phase 5C",
      summary: "No declarative subagent registry exists. Current roles are bundled profiles selected by commands.",
    },
    {
      id: "backgroundEvolutionQueue",
      severity: "warning",
      status: "partial",
      recommendedPhase: "Future",
      summary: "Evolution is explicit and controlled. There is no asynchronous background evolution queue.",
    },
  ];
}

async function resolveWorkbenchMemory(input: WorkbenchProjectInput): Promise<ResolvedMemory> {
  const marker = await readProjectMarker(input.path);
  return resolveMemory(input.project ? { ...input.project, marker } : { path: input.path, marker });
}

async function readChangeMetadataAt(memory: ResolvedMemory, relativePath: string): Promise<ChangeMetadata | null> {
  const path = join(memory.memoryRoot, relativePath, "change.json");
  if (!existsSync(path)) return null;
  try {
    return await readRequiredJsonFile(path, changeMetadataSchema);
  } catch {
    return null;
  }
}

function stateRank(state: WorkbenchTopicState): number {
  if (state === "active") return 0;
  if (state === "parking") return 1;
  return 2;
}

function buildRepoSummary(status: Awaited<ReturnType<typeof getProjectStatus>>): WorkbenchSnapshot["left"]["repo"] {
  return {
    path: status.path,
    exists: status.pathExists,
    git: status.isGitRepo,
    branch: status.branch,
    dirty: status.dirty,
  };
}

function sourceForEvent(type: string): WorkbenchThreadEvent["source"] {
  if (type.startsWith("validation.")) return "validation";
  if (type.startsWith("audit.")) return "audit";
  if (type.startsWith("worktree.")) return "worktree";
  if (type.startsWith("spec-test.")) return "spec-test";
  return "run";
}

function writeCapabilityForRole(id: string): WorkbenchRoleSummary["writeCapability"] {
  if (id === "coder" || id === "spec-test-generator") return "worktree-write";
  if (id === "validator") return "deterministic-writer";
  return "read-only";
}

function preferredRuntimeForRole(id: string): string {
  if (id === "validator") return "local-command";
  return "codex";
}

function humanConfirmationForRole(id: string): string {
  if (id === "validator") return "Validation is mechanical evidence; failed validation blocks close.";
  if (id === "coder" || id === "spec-test-generator") return "Requires validation, audit, and explicit worktree apply.";
  if (id === "auditor") return "Requires explicit audit accept before writing review.md.";
  return "Requires explicit accept command before canonical state changes.";
}
