// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentOfficePanel } from "../../src/web/src/panels/workbench/ConversationPanel.js";
import { HarnessOfficeAdapter } from "../../src/web/src/office/harnessOfficeAdapter.js";
import type { AgentSurfaceProjection } from "../../src/web/src/types.js";

describe("Agent Office committed projection reconciliation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not consume projection events from an abandoned render", () => {
    const first = projection("first");
    const abandoned = projection("abandoned", "running");
    const committed = projection("committed", "completed");
    const reconcile = vi.spyOn(HarnessOfficeAdapter.prototype, "reconcile");
    const never = new Promise<void>(() => undefined);
    const view = (value: AgentSurfaceProjection, blocked: boolean) => (
      <Suspense fallback={<div>Suspended</div>}>
        <AgentOfficePanel projectId="project-1" projection={value} onOpenSurface={async () => "opened"} />
        <RenderGate blocked={blocked} promise={never} />
      </Suspense>
    );
    const rendered = render(view(first, false));

    rendered.rerender(view(abandoned, true));
    rendered.rerender(view(committed, false));

    expect(reconcile).toHaveBeenLastCalledWith(first, committed);
    expect(reconcile.mock.calls.some(([previous, next]) => previous === first && next === abandoned)).toBe(false);
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
