import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ResolvedMemory, TaskQueueItem, TaskQueueRun } from "../types/index.js";
import { taskQueueItemSchema, taskQueueRunSchema } from "./schemas.js";
import { taskQueueDir, taskQueueItemDir, taskQueueItemPath, taskQueuePath } from "./paths.js";

export async function listTaskQueues(memory: ResolvedMemory, changeId: string): Promise<TaskQueueRun[]> {
  const dir = taskQueueDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const queues = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskQueueRunSchema)));
  return queues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTaskQueueItems(memory: ResolvedMemory, changeId: string, queueRunId?: string): Promise<TaskQueueItem[]> {
  const dir = taskQueueItemDir(memory, changeId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const items = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRequiredJsonFile(join(dir, entry.name), taskQueueItemSchema)));
  return items
    .filter((item) => !queueRunId || item.queueRunId === queueRunId)
    .sort((a, b) => a.order - b.order);
}

export async function getLatestTaskQueue(memory: ResolvedMemory, changeId: string): Promise<{ queue: TaskQueueRun; items: TaskQueueItem[] } | null> {
  const queue = (await listTaskQueues(memory, changeId))[0];
  if (!queue) return null;
  return { queue, items: await listTaskQueueItems(memory, changeId, queue.id) };
}

export async function readTaskQueueRun(memory: ResolvedMemory, changeId: string, queueRunId: string): Promise<TaskQueueRun> {
  return readRequiredJsonFile(taskQueuePath(memory, changeId, queueRunId), taskQueueRunSchema);
}

export async function writeTaskQueueRun(memory: ResolvedMemory, queue: TaskQueueRun): Promise<TaskQueueRun> {
  await writeJsonFile(taskQueuePath(memory, queue.changeId, queue.id), queue);
  return queue;
}

export async function writeTaskQueueItem(memory: ResolvedMemory, item: TaskQueueItem): Promise<TaskQueueItem> {
  await writeJsonFile(taskQueueItemPath(memory, item.changeId, item.id), item);
  return item;
}
