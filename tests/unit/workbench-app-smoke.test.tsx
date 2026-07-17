// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";
import { emptyWorkbenchSnapshot } from "../../src/web/src/controllers/useProjectConversationSession.js";
import type {
  CanonicalTimelinePage,
  ConversationInteraction,
  Snapshot,
} from "../../src/web/src/types.js";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    loadAddon(): void {}
    open(): void {}
    onData(): { dispose: () => void } { return { dispose: () => undefined }; }
    write(): void {}
    dispose(): void {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class { fit(): void {} },
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readonly url: string;

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  close(): void {}
}

describe("Workbench App owner composition", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/?project=repo&topic=conv-1");
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, String(value)); },
        removeItem: (key: string) => { storage.delete(key); },
        clear: () => { storage.clear(); },
      },
    });
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the canonical Main Timeline and Composer through the shell", async () => {
    installApiFixture(createSnapshot());
    render(<App />);

    expect(await screen.findByText("Canonical Main reply")).toBeTruthy();
    expect(screen.getByPlaceholderText("输入问题或下一步需求")).toBeTruthy();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/projects/repo/workbench/events/live");
  });

  it("keeps the graph as a pure center view and opens a canonical child surface", async () => {
    installApiFixture(createSnapshot());
    render(<App />);
    await screen.findByText("Canonical Main reply");

    fireEvent.click(screen.getByTestId("orchestration-overlay-toggle"));
    expect(await screen.findByTestId("agent-graph-center-view")).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入问题或下一步需求")).toBeNull();

    fireEvent.click(await screen.findByTestId("agent-relation-node-planning-agent"));
    expect(await screen.findByTestId("agent-workspace-panel")).toBeTruthy();
    expect(await screen.findByText("Canonical child reply")).toBeTruthy();
    expect(screen.getByTestId("agent-graph-center-view")).toBeTruthy();
  });

  it("mounts the active Interaction Dock in the Composer slot only", async () => {
    const interaction = createInteraction();
    installApiFixture(createSnapshot(interaction));
    render(<App />);

    expect(await screen.findByText("Choose execution mode")).toBeTruthy();
    expect(screen.getAllByText("Safe mode")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("输入问题或下一步需求")).toBeNull();
  });
});

function createSnapshot(interaction?: ConversationInteraction): Snapshot {
  const project = { id: "repo", name: "Repo", path: "E:/repo" };
  const topic = {
    id: "conv-1",
    title: "Owner convergence",
    state: "active",
    kind: "conversation" as const,
    boundChangeId: null,
    selectedProviderId: "codex",
  };
  return {
    ...emptyWorkbenchSnapshot,
    project,
    memory: { harnessReady: true },
    left: { topics: [topic], workpads: [] },
    center: {
      ...emptyWorkbenchSnapshot.center,
      selectedTopic: topic,
      workpad: {
        ...emptyWorkbenchSnapshot.center.workpad,
        title: topic.title,
        subtitle: project.name,
        state: "active",
        conversationLifecycle: "active",
      },
      conversationInteractions: { conversationId: topic.id, items: interaction ? [interaction] : [] },
      agentRelationGraph: {
        graphScopeId: "scope-1",
        title: "Agent relation",
        summary: "Canonical server projection",
        nodes: [
          {
            id: "main-agent",
            kind: "main-agent",
            label: "Main Agent",
            roleId: "main-agent",
            status: "running",
            summary: "Main thread",
            target: { projectId: project.id, conversationId: topic.id, agentSurfaceId: "main-agent" },
            evidenceRefs: [],
            attempts: [],
          },
          {
            id: "agent:codex:thread:child-1",
            kind: "agent",
            label: "Plan Agent",
            roleId: "planning-agent",
            parentAgentId: "main-agent",
            status: "running",
            summary: "Planning",
            target: { projectId: project.id, conversationId: topic.id, agentSurfaceId: "agent:codex:thread:child-1" },
            evidenceRefs: [],
            attempts: [],
          },
        ],
        edges: [{ id: "edge-1", from: "main-agent", to: "agent:codex:thread:child-1", kind: "delegates", label: "plans" }],
      },
    },
    right: {
      ...emptyWorkbenchSnapshot.right,
      agentWorkspace: {
        selectedAgentId: "agent:codex:thread:child-1",
        agents: [{
          id: "agent:codex:thread:child-1",
          label: "Plan Agent",
          roleId: "planning-agent",
          status: "running",
          summary: "Planning",
          agentSurfaceId: "agent:codex:thread:child-1",
        }],
      },
    },
  };
}

function createInteraction(): ConversationInteraction {
  return {
    interactionId: "interaction-1",
    conversationId: "conv-1",
    graphScopeId: "scope-1",
    canonicalSequence: 1,
    kind: "provider-input",
    status: "pending",
    canSkip: true,
    questions: [{
      questionId: "mode",
      title: "Choose execution mode",
      inputMode: "single",
      allowCustom: true,
      options: [{ value: "safe", label: "Safe mode", description: "Use bounded execution" }],
    }],
  } as ConversationInteraction;
}

function timelinePage(agentSurfaceId: string): CanonicalTimelinePage {
  const text = agentSurfaceId === "main-agent" ? "Canonical Main reply" : "Canonical child reply";
  return {
    conversationId: "conv-1",
    agentSurfaceId,
    watermark: 1,
    pinned: [],
    entries: [{
      conversationId: "conv-1",
      agentSurfaceId,
      messageId: `message:${agentSurfaceId}`,
      position: 1,
      revision: 1,
      orderClass: "sequence",
      cells: [{
        id: `cell:${agentSurfaceId}`,
        kind: "assistant-message",
        source: "provider-runtime",
        timestamp: "2026-07-17T00:00:00.000Z",
        text,
      }],
    }],
    paging: { limit: 100, totalCount: 1, hasMoreBefore: false },
  };
}

function installApiFixture(snapshot: Snapshot): void {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/app/status") return json({ mode: "project", directProjectId: "repo" });
    if (url === "/api/projects") {
      return json({ projects: [{
        project: snapshot.project,
        path: snapshot.project?.path,
        pathExists: true,
        isGitRepo: true,
        managed: true,
        memory: { registered: true, memoryAvailable: true, harnessReady: true },
      }] });
    }
    if (url.includes("/workbench/snapshot")) return json(snapshot);
    if (url.includes("/workbench/projections/agent-graph/")) return json(snapshot.center.agentRelationGraph);
    if (url.includes("/workbench/conversations/") && url.includes("/timeline?")) {
      const parsed = new URL(url, "http://localhost");
      return json(timelinePage(parsed.searchParams.get("agentSurfaceId") ?? "main-agent"));
    }
    if (url.endsWith("/providers/capabilities")) {
      return json({ providers: [{ providerId: "codex", displayName: "Codex", capabilities: {} }] });
    }
    if (url.endsWith("/providers/codex/diagnostics")) return json({ providerId: "codex", displayName: "Codex", models: {} });
    if (url.endsWith("/providers/codex/model-settings")) return json({ providerId: "codex" });
    if (url.endsWith("/skills")) return json({ skills: [] });
    return json({});
  }));
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}
