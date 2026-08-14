import { describe, expect, it, vi } from "vitest";
import type { ProviderDescriptor } from "../../src/provider-runtime/contracts.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import { PROVIDER_OPERATION_CAPABILITIES, type ProviderCapabilitySnapshot } from "../../src/provider-runtime/types.js";
import type { ProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import type { ManagedProject } from "../../src/types/index.js";
import { ConversationTurnRouter } from "../../src/workbench/conversation-turn-router.js";

describe("Conversation Turn admission", () => {
  it("keeps Default independent from optional Plan capability", async () => {
    const fixture = admissionFixture(false);
    const admission = await fixture.router.admit({
      project: fixture.project,
      productMode: "agent",
      conversationId: "conversation-default",
      providerId: "provider",
      agentTurnMode: null,
      attachments: [],
    });

    expect(admission).toMatchObject({
      agentTurnMode: "default",
      sandboxPolicy: "workspace-write",
      writableRoots: [fixture.project.path],
    });
    await expect(fixture.router.admit({
      project: fixture.project,
      productMode: "agent",
      conversationId: "conversation-plan",
      providerId: "provider",
      agentTurnMode: "plan",
      attachments: [],
    })).rejects.toMatchObject({ name: "Conflict" });
    expect(fixture.capabilitySnapshot).toHaveBeenCalledTimes(2);
  });

  it("freezes one read-only Plan admission with no writable roots", async () => {
    const fixture = admissionFixture(true);
    const admission = await fixture.router.admit({
      project: fixture.project,
      productMode: "agent",
      conversationId: "conversation-plan",
      providerId: "provider",
      agentTurnMode: "plan",
      attachments: [],
    });

    expect(admission).toMatchObject({
      agentTurnMode: "plan",
      sandboxPolicy: "read-only",
      writableRoots: [],
      model: { providerId: "provider", modelId: "model-test" },
    });
    expect(Object.isFrozen(admission)).toBe(true);
    expect(Object.isFrozen(admission.writableRoots)).toBe(true);
    expect(Object.isFrozen(admission.model)).toBe(true);
    expect(Object.isFrozen(admission.capabilitySnapshot)).toBe(true);
    expect(Object.isFrozen(admission.capabilitySnapshot?.capabilities)).toBe(true);
    expect(Object.isFrozen(admission.capabilitySnapshot?.capabilities[0])).toBe(true);
    expect(Object.isFrozen(admission.capabilitySnapshot?.degradedReasons)).toBe(true);
    expect(fixture.capabilitySnapshot).toHaveBeenCalledOnce();
  });

  it("rejects an Agent Turn mode on Harness before Provider discovery", async () => {
    const fixture = admissionFixture(true);
    await expect(fixture.router.admit({
      project: fixture.project,
      productMode: "harness",
      conversationId: "conversation-harness",
      providerId: "provider",
      agentTurnMode: "plan",
      attachments: [],
    })).rejects.toMatchObject({ name: "Conflict" });
    expect(fixture.capabilitySnapshot).not.toHaveBeenCalled();
  });
});

function admissionFixture(planReady: boolean) {
  const project: ManagedProject = {
    id: "project",
    name: "Project",
    path: "C:\\project",
    addedAt: "2026-08-15T00:00:00.000Z",
    lastSeenAt: "2026-08-15T00:00:00.000Z",
    defaultProviderId: "provider",
  };
  const capabilitySnapshot = vi.fn(async (): Promise<ProviderCapabilitySnapshot> => ({
    providerId: "provider",
    displayName: "Provider",
    productMode: "agent",
    status: "ready",
    runnable: true,
    checkedAt: "2026-08-15T00:00:00.000Z",
    snapshotHash: "snapshot",
    snapshotVersion: 1,
    effectiveModel: "model-test",
    effectiveModelSource: "provider-default",
    degradedReasons: [],
    capabilities: [
      ...PROVIDER_OPERATION_CAPABILITIES.agent.map((key) => ({
        key,
        label: key,
        spec: "supported" as const,
        runtime: "ready" as const,
        summary: "ready",
      })),
      {
        key: "turn.plan" as const,
        label: "Plan",
        spec: "supported" as const,
        runtime: planReady ? "ready" as const : "unavailable" as const,
        summary: planReady ? "ready" : "unavailable",
      },
    ],
  }));
  const registry = new ProviderRegistry();
  registry.register({
    id: "provider",
    displayName: "Provider",
    capabilitySnapshot,
    conversation: {
      runTurn: vi.fn(), inspectChild: vi.fn(), continueChild: vi.fn(), closeChild: vi.fn(),
      getActiveTurn: vi.fn(() => null), listActiveTurns: vi.fn(() => []),
    },
    runtime: { shutdown: vi.fn(), shutdownProject: vi.fn() },
  } as unknown as ProviderDescriptor);
  const runtimeState = {
    state: "onboarding",
    project,
    projectRoot: project.path,
    paths: { projectId: project.id },
    reservedProjectId: project.id,
  } as unknown as ProjectRuntimeState;
  const router = new ConversationTurnRouter({
    agent: { productMode: "agent", execute: vi.fn() },
    harness: { productMode: "harness", execute: vi.fn() },
  }, {
    skillContext: { resolve: vi.fn(async () => ({ skillInputs: [], diagnostics: [] })) },
  }, {
    projectRuntimeCoordinator: { resolve: vi.fn(async () => runtimeState) } as never,
    providerRegistry: registry,
  });
  return { router, project, capabilitySnapshot };
}
