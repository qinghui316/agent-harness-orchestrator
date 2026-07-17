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
import { openWorkbenchDatabase } from "../../persistence/open-workbench-database.js";
import { type StoredConversation } from "../../persistence/contracts.js";
import { fromStoredThreadMessage, readRecentConversationThread } from "../../conversation-thread-log.js";
import { buildThreadStream, buildThreadStreamFromMessages } from "./thread-stream.js";
import { listWorkbenchDecisions } from "./decision-store.js";
import { readChangeMetadataAt, stateRank } from "./support.js";

export type TopicThreadDetailMode = "full" | "latest" | "none";

export interface ListWorkbenchTopicsOptions {
  includeDeleted?: boolean;
}

export async function listWorkbenchTopicsFromMemory(memory: ResolvedMemory, options: ListWorkbenchTopicsOptions = {}): Promise<WorkbenchTopicSummary[]> {
  const index = await buildChangeIndex(memory);
  const rawConversationTopics = await listConversationTopics(memory, options);
  const groups: Array<[WorkbenchTopicState, ChangeIndexItem[]]> = [
    ["active", index.active],
    ["archive", index.archive],
  ];
  const changePathById = new Map([...index.active, ...index.archive].map((item) => [item.name, item.path]));
  const conversationTopics = rawConversationTopics.map((topic) => topic.boundChangeId && changePathById.has(topic.boundChangeId)
    ? { ...topic, path: changePathById.get(topic.boundChangeId)! }
    : topic);
  const topics: WorkbenchTopicSummary[] = [...conversationTopics];
  const existingConversationIds = new Set(conversationTopics.map((item) => item.boundChangeId ?? item.id));
  for (const [state, items] of groups) {
    for (const item of items) {
      const topic = await topicSummaryFromItem(memory, state, item);
      if (existingConversationIds.has(topic.id) || existingConversationIds.has(topic.name)) continue;
      topics.push(topic);
    }
  }
  return topics.sort((a, b) => stateRank(a.state) - stateRank(b.state) || (b.updatedAt ?? b.name).localeCompare(a.updatedAt ?? a.name));
}

async function listConversationTopics(memory: ResolvedMemory, options: ListWorkbenchTopicsOptions): Promise<WorkbenchTopicSummary[]> {
  if (!memory.projectId) return [];
  const store = await openWorkbenchDatabase(memory);
  try {
    return store.conversations.listConversations(memory.projectId, options).map(conversationSummaryFromStore);
  } finally {
    store.close();
  }
}

function conversationSummaryFromStore(conversation: StoredConversation): WorkbenchTopicSummary {
  return {
    id: conversation.conversationId,
    kind: "conversation",
    name: conversation.conversationId,
    title: conversation.title,
    state: conversation.state,
    path: `workbench/conversations/${conversation.conversationId}`,
    boundChangeId: conversation.boundChangeId,
    selectedProviderId: conversation.selectedProviderId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export async function topicSummaryFromItem(memory: ResolvedMemory, state: WorkbenchTopicState, item: ChangeIndexItem): Promise<WorkbenchTopicSummary> {
  const metadata = await readChangeMetadataAt(memory, item.path);
  return {
    id: metadata?.id ?? item.name,
    kind: "change",
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
    ? topics.find((item) => item.id === topicId || item.name === topicId || item.boundChangeId === topicId)
    : topics.find((item) => item.state === "active") ?? topics[0];
  if (!topic) return null;

  if (topic.kind === "conversation") {
    const threadMode = options.threadMode ?? "full";
    const messages = threadMode === "none" || !memory.projectId
      ? []
      : await readConversationMessages(memory, topic.id, options.threadLimit ?? 100);
    let threadItems = await buildThreadStreamFromMessages(memory, topic, messages, { includeChangeState: false });
    if (topic.boundChangeId) {
      const boundTopic = await findChangeTopic(memory, topic.boundChangeId);
      const boundDetail = boundTopic
        ? await selectTopicDetail(project, memory, [boundTopic], boundTopic.id, { threadMode: "none" })
        : null;
      if (boundDetail) {
        threadItems = await buildThreadStream(
          memory,
          topic,
          boundDetail.runs,
          boundDetail.validations,
          boundDetail.audits,
          project ? await listWorkbenchDecisions(memory, topic.boundChangeId) : [],
          { messages, includeChangeState: false },
        );
        return {
          ...boundDetail,
          id: topic.id,
          kind: "conversation",
          name: topic.name,
          title: topic.title,
          boundChangeId: topic.boundChangeId,
          createdAt: topic.createdAt,
          updatedAt: topic.updatedAt,
          threadItems,
        };
      }
    }
    return {
      ...topic,
      change: null,
      acMap: null,
      runs: [],
      taskQueues: [],
      taskQueueItems: [],
      taskRuns: [],
      workerLeases: [],
      worktrees: [],
      validations: [],
      audits: [],
      threadItems,
    };
  }

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
      ? await readRecentConversationThread(memory, topic.path, options.threadLimit ?? 100)
        .then((entries) => buildThreadStreamFromMessages(memory, topic, entries, { includeChangeState: true }))
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

async function findChangeTopic(memory: ResolvedMemory, changeId: string): Promise<WorkbenchTopicSummary | null> {
  const index = await buildChangeIndex(memory);
  for (const [state, items] of [["active", index.active], ["archive", index.archive]] as Array<[WorkbenchTopicState, ChangeIndexItem[]]>) {
    for (const item of items) {
      const topic = await topicSummaryFromItem(memory, state, item);
      if (topic.id === changeId || topic.name === changeId) return topic;
    }
  }
  return null;
}

async function readConversationMessages(memory: ResolvedMemory, conversationId: string, limit: number): Promise<import("../../types.js").TopicThreadEntry[]> {
  if (!memory.projectId) return [];
  const store = await openWorkbenchDatabase(memory);
  try {
    return store.timeline.listRecentSemanticMessages(memory.projectId, conversationId, Math.max(1, Math.min(500, limit))).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
}
