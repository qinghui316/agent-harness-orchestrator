import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getChangeStatusForChange } from "../../../change/manager.js";
import { listAuditResults } from "../../../audit/artifacts.js";
import { summarizeAudit } from "../../../audit/artifacts.js";
import { buildAcMap } from "../../../ecl/anchors.js";
import { buildChangeIndex } from "../../../ecl/index.js";
import { listRuns } from "../../../run/manager.js";
import { getSpecTestDriftReport } from "../../../spec-test/drift.js";
import { getSpecTestStatus } from "../../../spec-test/manager.js";
import { listTaskQueueItems, listTaskQueues } from "../../../task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../../../task-run/manager.js";
import { listValidationResults } from "../../../validation/artifacts.js";
import { summarizeValidation } from "../../../validation/artifacts.js";
import { listWorktreesForChange } from "../../../worktree/manager.js";
import type { AcMap, ChangeIndexItem, ManagedProject, ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchTopicDetail, WorkbenchTopicState, WorkbenchTopicSummary } from "../../read-model-types.js";
import { WorkbenchStore } from "../../store.js";
import { readTopicThreadLogPage } from "../../thread-log.js";
import { buildThreadStream, buildThreadStreamFromMessages } from "./thread-stream.js";
import { listWorkbenchDecisions } from "./decision-store.js";
import { readChangeMetadataAt, stateRank } from "./support.js";

export type TopicThreadDetailMode = "full" | "latest" | "none";

export interface ListWorkbenchTopicsOptions {
  includeDeleted?: boolean;
}

export async function listWorkbenchTopicsFromMemory(memory: ResolvedMemory, options: ListWorkbenchTopicsOptions = {}): Promise<WorkbenchTopicSummary[]> {
  const index = await buildChangeIndex(memory);
  const hiddenIds = options.includeDeleted ? new Set<string>() : await listHiddenTopicIds(memory).catch(() => new Set<string>());
  const deletedIds = options.includeDeleted ? new Set<string>() : await listDeletedTopicIds(memory).catch(() => new Set<string>());
  const groups: Array<[WorkbenchTopicState, ChangeIndexItem[]]> = [
    ["active", index.active],
    ["archive", index.archive],
  ];
  const topics: WorkbenchTopicSummary[] = [];
  for (const [state, items] of groups) {
    for (const item of items) {
      const topic = await topicSummaryFromItem(memory, state, item);
      if (
        !hiddenIds.has(topic.id)
        && !hiddenIds.has(topic.name)
        && !deletedIds.has(topic.id)
        && !deletedIds.has(topic.name)
      ) {
        topics.push(topic);
      }
    }
  }
  return topics.sort((a, b) => stateRank(a.state) - stateRank(b.state) || (b.updatedAt ?? b.name).localeCompare(a.updatedAt ?? a.name));
}

export async function deleteWorkbenchTopicConversation(memory: ResolvedMemory, changeId: string): Promise<void> {
  const topics = await listWorkbenchTopicsFromMemoryIncludingHidden(memory);
  const topic = topics.find((item) => item.id === changeId || item.name === changeId);
  if (!topic) {
    const error = new Error(`Topic not found: ${changeId}.`);
    error.name = "NotFound";
    throw error;
  }
  if (!memory.projectId) {
    const error = new Error("Project id is required to delete a conversation.");
    error.name = "Conflict";
    throw error;
  }
  const store = await WorkbenchStore.open(memory);
  try {
    store.deleteTopicConversation({ projectId: memory.projectId, changeId: topic.id, deletedAt: new Date().toISOString() });
  } finally {
    store.close();
  }
}

export async function hideWorkbenchTopicFromSidebar(memory: ResolvedMemory, changeId: string): Promise<void> {
  const topics = await listWorkbenchTopicsFromMemoryIncludingHidden(memory);
  const topic = topics.find((item) => item.id === changeId || item.name === changeId);
  if (!topic) {
    const error = new Error(`Topic not found: ${changeId}.`);
    error.name = "NotFound";
    throw error;
  }
  if (topic.state !== "archive") {
    const error = new Error("Only archived or completed conversations can be removed from the sidebar.");
    error.name = "Conflict";
    throw error;
  }
  const store = await WorkbenchStore.open(memory);
  try {
    if (!memory.projectId) {
      const error = new Error("Project id is required to hide a conversation.");
      error.name = "Conflict";
      throw error;
    }
    store.hideTopic({ projectId: memory.projectId, changeId: topic.id, hiddenAt: new Date().toISOString() });
  } finally {
    store.close();
  }
}

async function listWorkbenchTopicsFromMemoryIncludingHidden(memory: ResolvedMemory): Promise<WorkbenchTopicSummary[]> {
  const index = await buildChangeIndex(memory);
  const topics: WorkbenchTopicSummary[] = [];
  for (const [state, items] of [["active", index.active], ["archive", index.archive]] as Array<[WorkbenchTopicState, ChangeIndexItem[]]>) {
    for (const item of items) topics.push(await topicSummaryFromItem(memory, state, item));
  }
  return topics;
}

async function listHiddenTopicIds(memory: ResolvedMemory): Promise<Set<string>> {
  if (!memory.projectId) return new Set();
  const store = await WorkbenchStore.open(memory);
  try {
    return new Set(store.listHiddenTopicIds(memory.projectId));
  } finally {
    store.close();
  }
}

async function listDeletedTopicIds(memory: ResolvedMemory): Promise<Set<string>> {
  if (!memory.projectId) return new Set();
  const store = await WorkbenchStore.open(memory);
  try {
    return new Set(store.listDeletedTopicIds(memory.projectId));
  } finally {
    store.close();
  }
}

export async function topicSummaryFromItem(memory: ResolvedMemory, state: WorkbenchTopicState, item: ChangeIndexItem): Promise<WorkbenchTopicSummary> {
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

export async function buildTopicAcMap(memory: ResolvedMemory, topic: WorkbenchTopicSummary): Promise<AcMap | null> {
  const specPath = join(memory.memoryRoot, topic.path, "spec.md");
  const tasksPath = join(memory.memoryRoot, topic.path, "tasks.md");
  if (!existsSync(specPath) || !existsSync(tasksPath)) return null;
  const [specContent, tasksContent] = await Promise.all([
    readFile(specPath, "utf8"),
    readFile(tasksPath, "utf8"),
  ]);
  return buildAcMap({
    changeId: topic.id,
    specContent,
    tasksContent,
    placeholderFiles: [
      { path: "spec.md", content: specContent },
      { path: "tasks.md", content: tasksContent },
    ],
  });
}

export async function selectTopicDetail(
  project: ManagedProject | null,
  memory: ResolvedMemory,
  topics: WorkbenchTopicSummary[],
  topicId?: string,
  options: { threadMode?: TopicThreadDetailMode; threadLimit?: number } = {},
): Promise<WorkbenchTopicDetail | null> {
  const topic = topicId
    ? topics.find((item) => item.id === topicId || item.name === topicId)
    : topics.find((item) => item.state === "active") ?? topics[0];
  if (!topic) return null;

  const change = await readChangeMetadataAt(memory, topic.path);
  const allRuns = await listRuns(memory);
  const runs = allRuns.filter((run) => run.changeId === topic.id || run.changeId === topic.name);
  const [worktrees, validations, audits, taskRuns, workerLeases, taskQueues, taskQueueItems] = await Promise.all([
    listWorktreesForChange(memory, topic.id).catch(() => []),
    listValidationResults(memory, topic.id).then((items) => items.map(summarizeValidation)).catch(() => []),
    listAuditResults(memory, topic.id).then((items) => items.map(summarizeAudit)).catch(() => []),
    listTaskRuns(memory, topic.id).catch(() => []),
    listWorkerLeases(memory, topic.id).catch(() => []),
    listTaskQueues(memory, topic.id).catch(() => []),
    listTaskQueueItems(memory, topic.id).catch(() => []),
  ]);

  let statusDetail: Awaited<ReturnType<typeof getChangeStatusForChange>> | null = null;
  let specTest: unknown = null;
  let drift: unknown = null;
  if (project && topic.state === "active") {
    statusDetail = await getChangeStatusForChange(project, topic.id).catch(() => null);
    specTest = await getSpecTestStatus(memory, { changeId: topic.id }).catch(() => null);
    drift = await getSpecTestDriftReport(memory, { changeId: topic.id }).catch(() => null);
  }
  const acMap = statusDetail?.acMap ?? await buildTopicAcMap(memory, topic);

  const decisions = project ? await listWorkbenchDecisions(memory, topic.id) : [];
  const threadMode = options.threadMode ?? "full";
  const threadItems = threadMode === "none"
    ? []
    : threadMode === "latest"
      ? await readTopicThreadLogPage(memory, topic.path, { limit: options.threadLimit ?? 100 })
        .then((page) => buildThreadStreamFromMessages(memory, topic, page.entries, { includeChangeState: true }))
        .catch(() => [])
      : await buildThreadStream(memory, topic, runs, validations, audits, decisions);
  return {
    ...topic,
    change,
    reviewStatus: statusDetail?.reviewStatus,
    closeGate: statusDetail?.closeGate,
    acMap,
    acCount: acMap?.acceptanceCriteria.length,
    taskCount: acMap?.tasks.length,
    specTest,
    drift,
    runs,
    taskQueues,
    taskQueueItems,
    taskRuns,
    workerLeases,
    worktrees,
    validations,
    audits,
    threadItems,
  };
}
