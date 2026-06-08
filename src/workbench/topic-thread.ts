import { assertWritableMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { appendTopicThreadLogEntry } from "./thread-log.js";
import { resolveTopic } from "./topic-resolver.js";
import type { TopicThreadEntry } from "./types.js";

export async function appendTopicThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  assertWritableMemory(memory, "Topic thread update");
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changeId,
    ...input,
  };
  await appendTopicThreadLogEntry(memory, changePath, entry);
  return entry;
}
