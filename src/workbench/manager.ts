import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
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
import { listRuns } from "../run/manager.js";
import { getSpecTestDriftReport } from "../spec-test/drift.js";
import { getSpecTestStatus } from "../spec-test/manager.js";
import { listSpecTestProposalSummaries } from "../spec-test/proposal.js";
import { listValidationResults, summarizeValidation } from "../validation/artifacts.js";
import { listWorktreeStatuses, listWorktreesForChange } from "../worktree/manager.js";
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
  source: "change" | "run" | "proposal" | "validation" | "audit" | "worktree" | "spec-test" | "evolution";
  artifact?: string;
  status?: string;
  runId?: string;
}

export interface WorkbenchApprovalItem {
  id: string;
  kind: WorkbenchApprovalKind;
  label: string;
  changeId?: string;
  runId?: string;
  targetId?: string;
  severity: "info" | "warning" | "blocking";
  action?: string;
  artifact?: string;
  reason?: string;
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
      right: { approvals: [] },
      roles,
      harnessGaps: gaps,
      warnings,
    };
  }

  const topics = await listWorkbenchTopicsFromMemory(memory);
  const selectedTopic = await selectTopicDetail(input.project, memory, topics, options.topicId);
  const approvals = input.project ? await buildApprovalInbox(input.project, memory, selectedTopic) : [];
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
    right: { approvals },
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

export async function listWorkbenchRoles(): Promise<WorkbenchRoleSummary[]> {
  const profileRoot = join(dirname(getTemplateRoot()), "agent-profiles");
  if (!existsSync(profileRoot)) return [];
  const entries = await readdir(profileRoot, { withFileTypes: true });
  const roles = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(async (entry) => summarizeRoleProfile(profileRoot, entry.name)));
  return roles.sort((a, b) => a.id.localeCompare(b.id));
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

  const threadEvents = await buildThreadEvents(memory, topic, runs, validations, audits);
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

async function buildApprovalInbox(project: ManagedProject, memory: ResolvedMemory, selectedTopic: WorkbenchTopicDetail | null): Promise<WorkbenchApprovalItem[]> {
  const approvals: WorkbenchApprovalItem[] = [];
  const [specProposals, planProposals, specTestProposals] = await Promise.all([
    listSpecProposalSummaries(project).catch(() => []),
    listPlanProposalSummaries(project).catch(() => []),
    listSpecTestProposalSummaries(project).catch(() => []),
  ]);

  for (const proposal of specProposals.filter((item) => item.status === "proposed")) {
    approvals.push({
      id: `spec:${proposal.id}`,
      kind: "spec-proposal",
      label: `Spec proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: `aho change spec accept <project> ${proposal.id}`,
    });
  }
  for (const proposal of planProposals.filter((item) => item.status === "proposed")) {
    approvals.push({
      id: `plan:${proposal.id}`,
      kind: "plan-proposal",
      label: `Plan proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: `aho change plan accept <project> ${proposal.id}`,
    });
  }
  for (const proposal of specTestProposals.filter((item) => item.status === "proposed")) {
    approvals.push({
      id: `spec-test:${proposal.id}`,
      kind: "spec-test-proposal",
      label: `Spec-test evidence proposal ready: ${proposal.id}`,
      changeId: proposal.changeId,
      runId: proposal.runId,
      targetId: proposal.id,
      severity: "info",
      action: `aho spec-test proposal accept <project> ${proposal.id} --all-existing`,
    });
  }

  if (selectedTopic?.change && selectedTopic.state === "active") {
    const audits = await listAuditResults(memory, selectedTopic.id).catch(() => []);
    for (const audit of audits.filter((item) => item.status === "approved" || item.status === "approved-with-notes").slice(0, 3)) {
      approvals.push({
        id: `audit:${audit.id}`,
        kind: "audit-proposal",
        label: `Audit proposal can be accepted: ${audit.id}`,
        changeId: audit.changeId,
        runId: audit.runId,
        targetId: audit.id,
        severity: "info",
        action: `aho audit accept <project> ${audit.id}`,
        artifact: audit.artifacts.audit,
      });
    }
    const worktrees = await listWorktreeStatuses(memory).catch(() => []);
    for (const worktree of worktrees.filter((item) => item.changeId === selectedTopic.id && item.status !== "applied")) {
      const preview = await previewWorktreeApply(project, worktree.worktreeId).catch(() => null);
      if (preview?.gate.ready) {
        approvals.push({
          id: `apply:${worktree.worktreeId}`,
          kind: "worktree-apply",
          label: `Worktree ready to apply: ${worktree.worktreeId}`,
          changeId: worktree.changeId,
          targetId: worktree.worktreeId,
          severity: "info",
          action: `aho worktree apply <project> ${worktree.worktreeId}`,
        });
      }
    }
    const status = await getChangeStatus(project).catch(() => null);
    if (status?.closeGate.ready) {
      approvals.push({
        id: `close:${selectedTopic.id}`,
        kind: "change-close",
        label: `Change ready to close: ${selectedTopic.id}`,
        changeId: selectedTopic.id,
        targetId: selectedTopic.id,
        severity: "info",
        action: "aho change close <project>",
      });
    }
    if (status?.latestValidation?.status === "failed") {
      approvals.push({
        id: `attention:validation:${status.latestValidation.id}`,
        kind: "attention",
        label: `Latest validation failed: ${status.latestValidation.id}`,
        changeId: selectedTopic.id,
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
        changeId: selectedTopic.id,
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
      action: "Handle through proposal, independent review, validation, results.tsv, and mark-complete.",
      artifact: "harness/evolution/pending.md",
    });
  }
  return approvals;
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
      summary: "Run events and logs exist, but there is no GUI-specific stream index or live transport yet.",
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
