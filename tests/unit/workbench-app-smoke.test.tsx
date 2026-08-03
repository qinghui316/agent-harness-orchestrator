// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/web/src/App.js";
import { emptyWorkbenchSnapshot } from "../../src/web/src/controllers/useProjectConversationSession.js";
import type {
  CanonicalTimelinePage,
  ConversationInteraction,
  Snapshot,
} from "../../src/web/src/types.js";

const officeCalibration = JSON.parse(readFileSync("src/web/public/agent-office/config/office-calibration.json", "utf8"));

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
    installMatchMedia(false);
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

  it("keeps the office as a pure center view and opens a canonical child surface", async () => {
    installApiFixture(createSnapshot());
    render(<App />);
    await screen.findByText("Canonical Main reply");

    fireEvent.click(screen.getByTestId("orchestration-overlay-toggle"));
    expect(await screen.findByTestId("agent-office-center-view")).toBeTruthy();
    expect(screen.queryByPlaceholderText("输入问题或下一步需求")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: /Agent 列表，共 1 个/ }));
    fireEvent.click(screen.getByRole("menuitem"));
    expect(await screen.findByTestId("agent-workspace-panel")).toBeTruthy();
    expect(await screen.findByText("Canonical child reply")).toBeTruthy();
    expect(screen.getByTestId("agent-office-center-view")).toBeTruthy();
  });

  it("closes the mobile office after exact Agent navigation so the workspace is visible", async () => {
    installMatchMedia(true);
    installApiFixture(createSnapshot());
    render(<App />);
    await screen.findByText("Canonical Main reply");

    fireEvent.click(screen.getByTestId("orchestration-overlay-toggle"));
    fireEvent.click(await screen.findByRole("button", { name: /Agent 列表，共 1 个/ }));
    fireEvent.click(screen.getByRole("menuitem"));

    expect(await screen.findByTestId("agent-workspace-panel")).toBeTruthy();
    expect(await screen.findByText("Canonical child reply")).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("agent-office-center-view")).toBeNull());
  });

  it("uses token-bound destructive project removal while preserving source owners in the warning", async () => {
    installApiFixture(createSnapshot());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByText("Canonical Main reply");

    fireEvent.click(await screen.findByRole("button", { name: "更多项目操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /移出项目/ }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    const warning = String(confirm.mock.calls[0]?.[0] ?? "");
    expect(warning).toContain("永久删除 AHO 中的对话、运行记录、日志和运行 sidecar");
    expect(warning).toContain("物理项目 Harness Skill、Git worktree 和 Git 历史会保留");
    await waitFor(() => {
      const removalCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith("/api/projects/repo/remove"));
      expect(removalCall).toBeDefined();
      expect(JSON.parse(String(removalCall?.[1]?.body))).toEqual({
        confirm: true,
        confirmationToken: "remove-token-repo",
      });
    });
    const confirmationCall = vi.mocked(fetch).mock.calls.find(([input]) => (
      String(input).endsWith("/api/projects/repo/removal-confirmation")
    ));
    expect(confirmationCall).toBeDefined();
  });

  it("mounts the active Interaction Dock in the Composer slot only", async () => {
    const interaction = createInteraction();
    installApiFixture(createSnapshot(interaction));
    render(<App />);

    expect(await screen.findByText("Choose execution mode")).toBeTruthy();
    expect(screen.getAllByText("Safe mode")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("输入问题或下一步需求")).toBeNull();
  });

  it("owns the complete rail toggle cycle and keyboard column resizing", async () => {
    installApiFixture(createSnapshot());
    const view = render(<App />);
    await screen.findByText("Canonical Main reply");
    const shell = view.container.querySelector(".app-shell") as HTMLElement;
    const leftSeparator = screen.getByRole("separator", { name: "调整左侧项目栏宽度" });
    expect(leftSeparator.getAttribute("tabindex")).toBe("0");
    expect(leftSeparator.getAttribute("aria-valuenow")).toBe("280");
    fireEvent.keyDown(leftSeparator, { key: "ArrowRight" });
    expect(shell.style.getPropertyValue("--left-sidebar-width")).toBe("296px");
    fireEvent.keyDown(leftSeparator, { key: "Home" });
    expect(shell.style.getPropertyValue("--left-sidebar-width")).toBe("220px");

    fireEvent.click(screen.getByRole("button", { name: "打开右侧工具" }));
    expect(screen.getByTestId("right-tool-launcher")).toBeTruthy();
    const rightSeparator = screen.getByRole("separator", { name: "调整右侧工具栏宽度" });
    expect(rightSeparator.getAttribute("aria-valuemin")).toBe("280");
    expect(rightSeparator.getAttribute("aria-valuemax")).toBe("560");
    fireEvent.keyDown(rightSeparator, { key: "ArrowLeft" });
    expect(shell.style.getPropertyValue("--right-rail-width")).toBe("336px");
    fireEvent.click(screen.getByTestId("right-tool-launcher-diagnostics"));
    expect(screen.queryByTestId("right-tool-launcher")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭右侧工具" }));
    expect(screen.queryByTestId("decision-pane-shell")).toBeNull();
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
    },
    right: { ...emptyWorkbenchSnapshot.right },
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
    if (url === "/agent-office/config/office-calibration.json") return json(officeCalibration);
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
    if (url.includes("/workbench/projections/agent-surfaces/")) return json({
      conversationId: "conv-1",
      graphScopeId: "scope-1",
      scopeStatus: "active",
      projectionHash: "surface-hash-1",
      surfaces: [
        {
          agentSurfaceId: "main-agent",
          kind: "main-agent",
          roleId: "main-agent",
          roleDisplayName: "Main Agent",
          label: "Main Agent",
          description: "Coordinates the current conversation.",
          skills: [],
          parentAgentSurfaceId: null,
          graphScopeId: "scope-1",
          scopeRange: "current",
          status: "running",
          readOnly: false,
          createdAt: "2026-07-17T00:00:00.000Z",
        },
        {
          agentSurfaceId: "agent:codex:thread:child-1",
          kind: "agent",
          roleId: "planning-agent",
          roleDisplayName: "Planning Agent",
          label: "Plan Agent",
          description: "Produces the implementation plan.",
          skills: ["planning"],
          parentAgentSurfaceId: "main-agent",
          graphScopeId: "scope-1",
          scopeRange: "current",
          status: "running",
          readOnly: false,
          createdAt: "2026-07-17T00:00:01.000Z",
        },
      ],
    });
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
    if (url.endsWith("/removal-confirmation")) return json({
      token: "remove-token-repo",
      projectId: "repo",
      projectName: "Repo",
      expiresAt: "2026-08-03T12:00:00.000Z",
    });
    if (url.endsWith("/remove")) return json({ removal: { projectId: "repo" } });
    return json({});
  }));
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function installMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })));
}
