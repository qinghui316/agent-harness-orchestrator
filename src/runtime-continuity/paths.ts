import { join } from "node:path";

export interface RuntimeContinuityPaths {
  workerSession: string;
  runtimeWorkspace: string;
  eventSource: string;
  agentEvents: string;
}

export function runtimeContinuityPaths(runDirectory: string): RuntimeContinuityPaths {
  return {
    workerSession: join(runDirectory, "worker-session.json"),
    runtimeWorkspace: join(runDirectory, "runtime-workspace.json"),
    eventSource: join(runDirectory, "event-source.json"),
    agentEvents: join(runDirectory, "agent-events.jsonl"),
  };
}

