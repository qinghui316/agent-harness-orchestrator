import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory, WorkflowRun, WorkflowRunEvent, WorkflowRunEventType } from "../types/index.js";
import { assertWorkflowRunEventScope, canonicalWorkflowRunEventInput } from "./guards.js";
import { workflowEventPath } from "./paths.js";
import { readWorkflowRun } from "./repository.js";
import type { WorkflowRunEventInput } from "./types.js";

export async function appendWorkflowTaskEvent(memory: ResolvedMemory, workflowRunId: string | undefined, changeId: string, type: WorkflowRunEventType, input: WorkflowRunEventInput & Partial<WorkflowRunEvent>): Promise<void> {
  if (!workflowRunId) return;
  const run = await readWorkflowRun(memory, changeId, workflowRunId).catch(() => null);
  if (!run) return;
  await appendWorkflowRunEvent(memory, run, type, input);
}

export async function readWorkflowRunEvents(memory: ResolvedMemory, changeId: string, workflowRunId: string): Promise<WorkflowRunEvent[]> {
  const run = await readWorkflowRun(memory, changeId, workflowRunId);
  const path = workflowEventPath(memory, run.changeId, run.id);
  if (!existsSync(path)) return [];
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const event = JSON.parse(line) as WorkflowRunEvent;
    assertWorkflowRunEventScope(event, run.changeId, run.id);
    return event;
  });
}

export async function appendWorkflowRunEvent(memory: ResolvedMemory, run: WorkflowRun, type: WorkflowRunEventType, input: WorkflowRunEventInput & Partial<WorkflowRunEvent> = {}): Promise<void> {
  const now = new Date().toISOString();
  const scopedInput = canonicalWorkflowRunEventInput(input);
  const event: WorkflowRunEvent = {
    version: "1.0",
    id: `workflow-event-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${run.id}:${type}:${now}:${Math.random()}`).slice(0, 8)}`,
    workflowRunId: run.id,
    changeId: run.changeId,
    type,
    timestamp: now,
    ...scopedInput,
  };
  const path = workflowEventPath(memory, run.changeId, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}
