import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OfficeBehaviorPolicy } from "../../src/web/src/office/officeBehaviorPolicy.js";
import { OfficeCalibrationResolver } from "../../src/web/src/office/officeCalibrationResolver.js";
import { parseOfficeCalibrationJson } from "../../src/web/src/office/officeCalibrationDocument.js";
import { HarnessOfficeAdapter, mapHarnessState } from "../../src/web/src/office/harnessOfficeAdapter.js";
import { OfficePresencePolicy } from "../../src/web/src/office/officePresencePolicy.js";
import { OfficeStationAssignmentStore } from "../../src/web/src/office/officeStationAssignmentStore.js";
import type { AgentSurfaceProjection, AgentSurfaceStatus } from "../../src/web/src/types.js";

const calibration = parseOfficeCalibrationJson(readFileSync("src/web/public/agent-office/config/office-calibration.json", "utf8"));
const resolver = new OfficeCalibrationResolver(calibration);

describe("Office experience boundary", () => {
  it("maps every canonical Agent status at the sole adapter boundary", () => {
    expect(["idle", "queued", "running", "waiting-user", "needs-change", "failed", "completed", "interrupted", "terminated"].map((status) => mapHarnessState(status as AgentSurfaceStatus)))
      .toEqual(["idle", "queued", "working", "attention", "blocked", "failed", "completed", "interrupted", "idle"]);
  });

  it("keeps nine spatial stations and creates participants only for current non-terminated surfaces", () => {
    const snapshot = adapter().hydrate(projection([
      child("historical", "coder-agent", "completed", 1, { scopeRange: "historical", graphScopeId: "scope-old", readOnly: true }),
      child("closed", "auditor-agent", "terminated", 2, { readOnly: true }),
    ]));
    expect(snapshot.stations).toHaveLength(9);
    expect(snapshot.participants.map((participant) => participant.participantId)).toEqual(["main-agent"]);
  });

  it("keeps role-owned ambient preferences independent of the selected station", () => {
    const snapshot = adapter().hydrate(projection([child("child-1", "coder-agent", "completed", 1)]));
    const coder = snapshot.participants.find((participant) => participant.participantId === "child-1")!;
    expect(coder.ambientPreferences.map((preference) => preference.action)).toEqual([
      "peek", "desk-coffee", "entertainment-1", "entertainment-2", "coffee", "treadmill", "toilet",
    ]);
    expect(coder.ambientPreferences.find((preference) => preference.action === "entertainment-1")?.weight).toBe(3);
    expect(coder.ambientPreferences.find((preference) => preference.action === "treadmill")?.weight).toBe(3);
    expect(coder.ambientPreferences.find((preference) => preference.action === "toilet")?.weight).toBe(1);
  });

  it("gives one duplicate role its preferred station and keeps the other on roster fallback", () => {
    const office = adapter();
    const first = projection([
      child("planning-1", "planning-agent", "running", 1),
      child("planning-2", "planning-agent", "running", 2),
    ]);
    const before = office.hydrate(first);
    const firstStation = before.participants.find((participant) => participant.participantId === "planning-1")!.stationId;
    const secondStation = before.participants.find((participant) => participant.participantId === "planning-2")!.stationId;
    expect(firstStation).toBe("planning");
    expect(secondStation).not.toBe("planning");

    const after = office.reconcile(first, projection([child("planning-2", "planning-agent", "running", 2)])).snapshot;
    expect(after.participants.find((participant) => participant.participantId === "planning-2")?.stationId).toBe(secondStation);
  });

  it("persists assignments across adapter refresh without reading any legacy key", () => {
    const storage = new MemoryStorage();
    storage.setItem("aho:agent-office:station-assignments", JSON.stringify({ assignments: { "planning-2": "planning" } }));
    const firstProjection = projection([
      child("planning-1", "planning-agent", "running", 1),
      child("planning-2", "planning-agent", "running", 2),
    ]);
    const first = adapter(storage).hydrate(firstProjection);
    const assignment = new Map(first.participants.map((participant) => [participant.participantId, participant.stationId]));
    const refreshed = adapter(storage).hydrate({ ...firstProjection, surfaces: [firstProjection.surfaces[0]!, ...firstProjection.surfaces.slice(1).reverse()] });
    expect(new Map(refreshed.participants.map((participant) => [participant.participantId, participant.stationId]))).toEqual(assignment);
    expect(assignment.get("planning-1")).toBe("planning");
  });

  it("yields a completed station to active overflow without moving active occupants", () => {
    const office = adapter();
    const firstChildren = ROLE_IDS.map((roleId, index) => child(`agent-${index}`, roleId, index === 0 ? "completed" : "running", index));
    const first = projection(firstChildren);
    const firstSnapshot = office.hydrate(first);
    const stationByActive = new Map(firstSnapshot.participants.map((participant) => [participant.participantId, participant.stationId]));
    const overflow = projection([...firstChildren, child("agent-new", "custom-role", "running", 20)]);
    const result = office.reconcile(first, overflow).snapshot;
    expect(result.participants).toHaveLength(9);
    expect(result.participants.some((participant) => participant.participantId === "agent-0")).toBe(false);
    expect(result.participants.some((participant) => participant.participantId === "agent-new")).toBe(true);
    for (const participant of result.participants.filter((candidate) => candidate.participantId !== "agent-new" && candidate.kind === "child")) {
      expect(participant.stationId).toBe(stationByActive.get(participant.participantId));
    }
    expect(result.diagnostics[0]).toContain("agent-0");
  });

  it("emits live creation while scope replacement only resets", () => {
    const office = adapter();
    const empty = projection([]);
    office.hydrate(empty);
    const added = projection([child("child-1", ROLE_IDS[0]!, "queued", 1)]);
    expect(office.reconcile(empty, added).events).toEqual([{ kind: "participant-added", participantId: "child-1", parentParticipantId: "main-agent" }]);
    const nextScope = projection([child("child-1", ROLE_IDS[0]!, "queued", 1, { graphScopeId: "scope-2" })], "scope-2");
    expect(office.reconcile(added, nextScope).events).toEqual([{ kind: "scope-reset", previousContextId: "scope-1" }]);
  });

  it("binds semantic states without letting role choice affect coordinates", () => {
    const policy = new OfficeBehaviorPolicy();
    const participant = adapter().hydrate(projection([child("child-1", ROLE_IDS[1]!, "running", 1)])).participants[1]!;
    const command = policy.semantic(participant);
    expect(command).toMatchObject({ kind: "parallel" });
    expect(command.kind === "parallel" ? command.commands.slice(0, 2) : []).toMatchObject([
      { kind: "playAction", actionId: "working" },
      { kind: "setScreen", stationId: participant.stationId, profile: "orchestration" },
    ]);
  });

  it("uses station-owned anchors, actor offsets, handoffs, and facility routes", () => {
    const stations = resolver.stations();
    expect(calibration.schemaVersion).toBe(4);
    expect(calibration.actionVisualAlignments.working.offset).toEqual({ x: -7.881743332435346, y: -1.9704132831742616 });
    for (const station of stations) {
      expect(station.anchors.seat).toEqual(resolver.station(station.stationId).actorAnchor);
      expect(Object.keys(station.facilityRoutes)).toEqual(["coffee", "treadmill", "toilet"]);
      for (const route of Object.values(station.facilityRoutes)) {
        expect(route[0]?.id).toBe("off-chair-out");
        expect(route.at(-1)?.id).toBe("off-chair-return");
      }
    }
    const main = stations.find((station) => station.stationId === "main")!;
    expect(Object.keys(main.handoffRoutes)).toHaveLength(8);
  });

  it("keeps world coordinates out of role presentation and action switching", async () => {
    const sharedOwners = ["officeExperience.ts", "officePresencePolicy.ts", "officeBehaviorPolicy.ts", "officeCalibrationResolver.ts", "choreographyEngine.ts", "ambientScheduler.ts", "officeDirector.ts", "PixiOfficeRenderer.tsx"];
    for (const owner of sharedOwners) {
      const source = await readFile(new URL(`../../src/web/src/office/${owner}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/from .*workbench|Provider|from ["']\.\.\/types/);
    }
    const renderer = await readFile(new URL("../../src/web/src/office/PixiOfficeRenderer.tsx", import.meta.url), "utf8");
    const applyAction = renderer.slice(renderer.indexOf("async function applyAction"), renderer.indexOf("function applyActionVisual"));
    expect(applyAction).not.toMatch(/group\.position|group\.x|group\.y/);
  });
});

const ROLE_IDS = ["planning-agent", "coder-agent", "auditor-agent", "rework-coder", "spec-test-proposer", "spec-test-generator", "memory-maintenance-agent", "harness-evolution-agent"];

function adapter(storage?: Storage): HarnessOfficeAdapter {
  return new HarnessOfficeAdapter("project-1", resolver, new OfficePresencePolicy(new OfficeStationAssignmentStore(storage ?? null)));
}

function projection(children: AgentSurfaceProjection["surfaces"], graphScopeId = "scope-1"): AgentSurfaceProjection {
  return {
    conversationId: "conversation-1",
    graphScopeId,
    scopeStatus: "active",
    projectionHash: `${graphScopeId}:${children.map((surface) => `${surface.agentSurfaceId}:${surface.status}`).join("|")}`,
    surfaces: [main(graphScopeId), ...children],
  };
}

function main(graphScopeId: string): AgentSurfaceProjection["surfaces"][number] {
  return surface("main-agent", "main-agent", "idle", 0, { kind: "main-agent", parentAgentSurfaceId: null, graphScopeId });
}

function child(id: string, roleId: string, status: AgentSurfaceStatus, index: number, overrides: Partial<AgentSurfaceProjection["surfaces"][number]> = {}): AgentSurfaceProjection["surfaces"][number] {
  return surface(id, roleId, status, index, overrides);
}

function surface(id: string, roleId: string, status: AgentSurfaceStatus, index: number, overrides: Partial<AgentSurfaceProjection["surfaces"][number]>): AgentSurfaceProjection["surfaces"][number] {
  return {
    agentSurfaceId: id,
    kind: "agent",
    roleId,
    roleDisplayName: roleId,
    label: id,
    description: "",
    skills: [],
    parentAgentSurfaceId: "main-agent",
    graphScopeId: "scope-1",
    scopeRange: "current",
    status,
    readOnly: false,
    createdAt: `2026-07-18T00:00:${String(index + 1).padStart(2, "0")}Z`,
    ...overrides,
  };
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
