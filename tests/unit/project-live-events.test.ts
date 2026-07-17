import { describe, expect, it, vi } from "vitest";
import { buildInitialProjectAgentEvents } from "../../src/server/workbench/project-live-events.js";
import { createLiveSink } from "../../src/server/workbench/live.js";
import { publishProjectLiveEvent, subscribeProjectLiveEvents } from "../../src/workbench/project-live-events.js";
import type { AgentTask } from "../../src/types/index.js";
import type { WorkbenchAgentWorkspaceAgent } from "../../src/workbench/read-model-types.js";
import type { WorkbenchLiveEvent } from "../../src/workbench/types.js";

describe("project live Agent events", () => {
  it("fans out background events by project without persisting a second event truth", () => {
    const repoA = vi.fn();
    const repoB = vi.fn();
    const unsubscribeA = subscribeProjectLiveEvents("repo-a", repoA);
    const unsubscribeB = subscribeProjectLiveEvents("repo-b", repoB);
    const event = {
      event: "assistant.delta" as const,
      data: {
        projectId: "repo-a",
        runId: "maintenance-run-1",
        threadId: "maintenance-thread-1",
        agentRoleId: "memory-maintenance-agent",
        delta: "正在更新项目说明",
      },
    };

    publishProjectLiveEvent("repo-a", event);
    expect(repoA).toHaveBeenCalledWith(event);
    expect(repoB).not.toHaveBeenCalled();

    unsubscribeA();
    unsubscribeB();
    publishProjectLiveEvent("repo-a", event);
    expect(repoA).toHaveBeenCalledTimes(1);
  });

  it("reuses the durable background surface instead of announcing a task duplicate", () => {
    const task = {
      id: "maintenance-5",
      conversationId: "conversation-1",
      changeId: "change-1",
      roleId: "memory-maintenance-agent",
      kind: "background",
      status: "running",
    } as AgentTask;
    const agent = {
      id: "run:maintenance-run-5",
      roleId: "memory-maintenance-agent",
      runId: "maintenance-run-5",
      agentTaskId: "maintenance-5",
      providerDisplayName: "Sagan",
      label: "Maintenance Agent · Sagan",
      status: "running",
      summary: "",
      evidenceRefs: [],
      actions: [],
    } as WorkbenchAgentWorkspaceAgent;

    const events = buildInitialProjectAgentEvents("repo", [agent], [task]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "run.status",
      data: {
        agentSurfaceId: "run:maintenance-run-5",
        runId: "maintenance-run-5",
        agentRoleId: "memory-maintenance-agent",
        agentDisplayName: "Sagan",
      },
    });
  });

  it("publishes the same canonical envelope after the request SSE disconnects", () => {
    const projectSubscriber = vi.fn();
    const unsubscribe = subscribeProjectLiveEvents("repo", projectSubscriber);
    const requestSend = vi.fn();
    const sink = createLiveSink({ closed: true, send: requestSend } as never, "repo");
    const patch = {
      event: "timeline.patch",
      data: {
        conversationId: "conversation-1",
        agentSurfaceId: "main-agent",
        messageId: "message-1",
        position: 1,
        revision: 2,
        orderClass: "sequence",
        cells: [],
      },
    } satisfies WorkbenchLiveEvent;

    sink.emit(patch);
    sink.emit({ event: "done", data: { status: "completed" } });

    expect(projectSubscriber).toHaveBeenCalledTimes(1);
    expect(projectSubscriber).toHaveBeenCalledWith(patch);
    expect(requestSend).not.toHaveBeenCalled();
    unsubscribe();
  });
});
