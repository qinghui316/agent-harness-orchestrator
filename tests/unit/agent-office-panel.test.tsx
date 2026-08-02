// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentOfficePanel } from "../../src/web/src/panels/workbench/ConversationPanel.js";
import { OfficeExperienceComposer } from "../../src/web/src/office/officeExperienceComposer.js";
import type { AgentSurfaceProjection } from "../../src/web/src/types.js";

const calibration = readFileSync("src/web/public/agent-office/config/office-calibration.json", "utf8");

describe("Agent Office committed projection reconciliation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not consume projection events from an abandoned render", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(calibration, { status: 200, headers: { "content-type": "application/json" } })));
    const first = projection("first");
    const abandoned = projection("abandoned", "running");
    const committed = projection("committed", "completed");
    const reconcile = vi.spyOn(OfficeExperienceComposer.prototype, "reconcile");
    const never = new Promise<void>(() => undefined);
    const view = (value: AgentSurfaceProjection, blocked: boolean) => (
      <Suspense fallback={<div>Suspended</div>}>
        <AgentOfficePanel projectId="project-1" projection={value} onOpenSurface={async () => "opened"} />
        <RenderGate blocked={blocked} promise={never} />
      </Suspense>
    );
    const rendered = render(view(first, false));
    await waitFor(() => expect(OfficeExperienceComposer.prototype.hydrate).toBeDefined());
    await waitFor(() => expect(rendered.getByTestId("agent-office")).toBeTruthy());

    rendered.rerender(view(abandoned, true));
    rendered.rerender(view(committed, false));

    expect(reconcile).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: first.projectionHash }),
      expect.objectContaining({ revision: committed.projectionHash }),
    );
    expect(reconcile.mock.calls.some(([previous, next]) => (
      previous.revision === first.projectionHash && next.revision === abandoned.projectionHash
    ))).toBe(false);
  });

  it("opens a resident-only capability card without adding residents to the active Agent menu", async () => {
    const catalog = {
      version: "1.0",
      catalogHash: "catalog-hash",
      roles: [
        { roleId: "memory-maintenance-agent", displayName: "Memory Maintenance Agent", description: "Maintains canonical project memory.", skills: ["aho-harness-engineering"] },
        { roleId: "harness-evolution-agent", displayName: "Harness Evolution Agent", description: "Evolves the project harness.", skills: ["aho-harness-engineering"] },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => new Response(
      String(input).includes("agent-catalog") ? JSON.stringify(catalog) : calibration,
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const openSurface = vi.fn(async () => "opened" as const);
    const emptyProjection = projection("empty");
    const rendered = render(<AgentOfficePanel projectId="project-1" projection={emptyProjection} onOpenSurface={openSurface} />);

    const fallback = await rendered.findByRole("group", { name: "Agent 办公室列表" });
    const resident = within(fallback).getByTestId("agent-office-memory-maintenance-agent");
    fireEvent.click(resident);
    const card = await rendered.findByTestId("office-resident-profile-card");
    expect(card.textContent).toContain("Memory Maintenance Agent");
    expect(card.textContent).toContain("当前未执行任务");
    expect(card.textContent).toContain("aho-harness-engineering");
    expect(card.textContent).not.toContain("打开 Agent 对话");

    rendered.rerender(<AgentOfficePanel projectId="project-1" projection={emptyProjection} onOpenSurface={openSurface} />);
    expect(rendered.getByTestId("office-resident-profile-card")).toBeTruthy();

    fireEvent.click(rendered.getByRole("button", { name: /Agent 列表/ }));
    expect(rendered.getByText("暂无 Agent")).toBeTruthy();
    expect(openSurface).not.toHaveBeenCalled();

    rendered.rerender(<AgentOfficePanel projectId="project-1" projection={projectionWithMemoryAgent()} onOpenSurface={openSurface} />);
    await waitFor(() => expect(rendered.queryByTestId("office-resident-profile-card")).toBeNull());
  });
});

function RenderGate({ blocked, promise }: { blocked: boolean; promise: Promise<void> }) {
  if (blocked) throw promise;
  return null;
}

function projection(hash: string, status: "idle" | "running" | "completed" = "idle"): AgentSurfaceProjection {
  return {
    conversationId: "conversation-1",
    graphScopeId: "scope-1",
    scopeStatus: "active",
    projectionHash: hash,
    surfaces: [{
      agentSurfaceId: "main-agent",
      kind: "main-agent",
      roleId: "main-agent",
      roleDisplayName: "Main Agent",
      label: "Main Agent",
      description: "Coordinates the conversation.",
      skills: [],
      parentAgentSurfaceId: null,
      graphScopeId: "scope-1",
      scopeRange: "current",
      status,
      readOnly: false,
      createdAt: "2026-07-25T00:00:00.000Z",
    }],
  };
}

function projectionWithMemoryAgent(): AgentSurfaceProjection {
  const base = projection("memory-real");
  return {
    ...base,
    surfaces: [...base.surfaces, {
      agentSurfaceId: "agent:codex:thread:memory-real",
      kind: "agent",
      roleId: "memory-maintenance-agent",
      roleDisplayName: "Memory Maintenance Agent",
      label: "Memory Maintenance Agent",
      description: "Maintains canonical project memory.",
      skills: ["aho-harness-engineering"],
      parentAgentSurfaceId: "main-agent",
      graphScopeId: "scope-1",
      scopeRange: "current",
      status: "running",
      readOnly: false,
      createdAt: "2026-07-25T00:00:01.000Z",
    }],
  };
}
