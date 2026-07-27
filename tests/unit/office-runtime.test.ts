import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { OfficeAssetLoader } from "../../src/web/src/office/officeAssetLoader.js";
import { AmbientScheduler } from "../../src/web/src/office/ambientScheduler.js";
import { ChoreographyEngine } from "../../src/web/src/office/choreographyEngine.js";
import { OfficeDirector } from "../../src/web/src/office/officeDirector.js";
import { OfficeCalibrationResolver } from "../../src/web/src/office/officeCalibrationResolver.js";
import { parseOfficeCalibrationJson } from "../../src/web/src/office/officeCalibrationDocument.js";
import { commitLatestOfficeRender } from "../../src/web/src/office/officeRenderGeneration.js";
import type { OfficeExperienceSnapshot, OfficeParticipant } from "../../src/web/src/office/officeExperience.js";
import { applyScarfMask } from "../../src/web/src/office/officeRuntimeAssets.js";
import { removeOfficeTickerIfCurrent } from "../../src/web/src/office/officeRendererLifecycle.js";
import { officeRouteFrameAt } from "../../src/web/src/office/officeRouteInterpolation.js";

const resolver = new OfficeCalibrationResolver(parseOfficeCalibrationJson(readFileSync("src/web/public/agent-office/config/office-calibration.json", "utf8")));

describe("Office runtime owners", () => {
  it("deduplicates concurrent asset loads", async () => {
    const importer = vi.fn(async (key: string) => ({ key }));
    const loader = new OfficeAssetLoader(importer);
    const [first, second] = await Promise.all([loader.acquire("idle", "actor-a"), loader.acquire("idle", "actor-b")]);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(first.asset).toBe(second.asset);
    first.release();
    second.release();
  });

  it("reference-counts repeated acquisitions from the same actor owner", async () => {
    const dispose = vi.fn();
    const loader = new OfficeAssetLoader(async (key: string) => ({ key }), 0, dispose);
    const first = await loader.acquire("shared", "actor-a", "ambient");
    const second = await loader.acquire("shared", "actor-a", "ambient");
    first.release();
    expect(loader.stats().referenced).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    expect(loader.stats().referenced).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("semantic animation cancels the actor ambient channel and scope reset aborts work", async () => {
    const runtime = new ChoreographyEngine();
    const signals: AbortSignal[] = [];
    runtime.subscribe((_command, signal) => { signals.push(signal); });
    const ambient = runtime.run("agent-a", { kind: "playAction", participantId: "agent-a", actionId: "peek", durationMs: 10_000 }, "ambient");
    await Promise.resolve();
    const semantic = runtime.run("agent-a", { kind: "playAction", participantId: "agent-a", actionId: "working", durationMs: 10_000 }, "semantic");
    await Promise.resolve();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    runtime.resetScope();
    expect(signals[1]?.aborted).toBe(true);
    await Promise.all([ambient, semantic]);
  });

  it("lets each newer canonical semantic transition replace the prior pose", async () => {
    const runtime = new ChoreographyEngine();
    const actions: string[] = [];
    runtime.subscribe((command) => { if (command.kind === "playAction") actions.push(command.actionId); });
    for (const actionId of ["standby", "working", "standby", "working", "standby", "working", "standby"] as const) {
      await runtime.run("agent-a", { kind: "playAction", participantId: "agent-a", actionId }, "semantic");
    }
    expect(actions).toEqual(["standby", "working", "standby", "working", "standby", "working", "standby"]);
  });

  it("destroys unreferenced ambient atlases when the LRU budget is exceeded", async () => {
    const dispose = vi.fn();
    const loader = new OfficeAssetLoader(async (key: string) => ({ key }), 1, dispose);
    const first = await loader.acquire("ambient-a", "actor", "ambient");
    first.release();
    const second = await loader.acquire("ambient-b", "actor", "ambient");
    second.release();
    expect(dispose).toHaveBeenCalledWith({ key: "ambient-a" });
    expect(loader.stats().resolved).toBe(1);
  });

  it("schedules life actions only for idle or completed actors and disables them for reduced motion", async () => {
    vi.useFakeTimers();
    const actions: string[] = [];
    const scheduler = new AmbientScheduler(async ({ actorId, action }) => { actions.push(`${actorId}:${action}`); }, undefined, { next: () => 0 });
    scheduler.sync(snapshotWithStates(["idle", "working", "completed"]), true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(actions).toEqual(["actor-2:peek"]);
    const count = actions.length;
    scheduler.sync(snapshotWithStates(["idle", "idle", "idle"]), false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(actions).toHaveLength(count);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("does not restart an in-flight ambient timer after the scheduler is disabled", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const actions: string[] = [];
    const scheduler = new AmbientScheduler(async ({ actorId, action }) => {
      actions.push(`${actorId}:${action}`);
      await new Promise<void>((resolve) => { finish = resolve; });
    }, undefined, { next: () => 0 });
    scheduler.sync(snapshotWithStates(["idle", "idle"]), true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(actions).toHaveLength(1);
    scheduler.sync(snapshotWithStates(["idle", "idle"]), false);
    finish?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(actions).toHaveLength(1);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("runs at most two ambient stories with at most one mobility route", async () => {
    vi.useFakeTimers();
    const running: string[] = [];
    const finish: Array<() => void> = [];
    const scheduler = new AmbientScheduler(async ({ actorId, action }) => {
      running.push(`${actorId}:${action}`);
      await new Promise<void>((resolve) => finish.push(resolve));
    }, undefined, { next: () => 0 });
    const snapshot = snapshotWithStates(["idle", "idle", "idle"]);
    snapshot.participants[0]!.ambientPreferences = [{ action: "coffee", weight: 1 }];
    snapshot.participants[1]!.ambientPreferences = [{ action: "treadmill", weight: 1 }];
    snapshot.participants[2]!.ambientPreferences = [{ action: "peek", weight: 1 }];
    scheduler.sync(snapshot, true);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(running).toHaveLength(2);
    expect(running.filter((entry) => /coffee|treadmill|toilet/.test(entry))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(running).toHaveLength(2);
    finish.forEach((resolve) => resolve());
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("uses the same bounded cadence when Main is the only ambient candidate", async () => {
    vi.useFakeTimers();
    const actions: string[] = [];
    const scheduler = new AmbientScheduler(async ({ actorId, action }) => { actions.push(`${actorId}:${action}`); }, undefined, { next: () => 0 });
    scheduler.sync(snapshotWithStates(["idle"]), true);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(actions).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(actions).toEqual(["actor-0:peek"]);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("continues scheduling after an optional ambient action rejects", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {
      if (run.mock.calls.length === 1) throw new Error("optional ambient asset failed");
    });
    const scheduler = new AmbientScheduler(run, undefined, { next: () => 0 });
    scheduler.sync(snapshotWithStates(["idle"]), true);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(run).toHaveBeenCalledTimes(2);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it("keeps only residents eligible for ambient actions in a terminal current Office", async () => {
    vi.useFakeTimers();
    const actions: string[] = [];
    const scheduler = new AmbientScheduler(async ({ actorId, actorKind }) => { actions.push(`${actorKind}:${actorId}`); }, undefined, { next: () => 0 });
    const snapshot = snapshotWithStates(["completed"]);
    snapshot.lifecycle = "terminal";
    snapshot.residents = [{
      residentId: "resident:memory-maintenance-agent",
      roleId: "memory-maintenance-agent",
      label: "Memory Maintenance Agent",
      stationId: snapshot.stations[0]!.stationId,
      scarf: "maintenance",
      ambientPreferences: [{ action: "peek", weight: 1 }],
    }];
    scheduler.sync(snapshot, true);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(actions).toEqual([
      "resident:resident:memory-maintenance-agent",
      "resident:resident:memory-maintenance-agent",
    ]);
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("clamps a route frame before its start to the first point", () => {
    expect(officeRouteFrameAt([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ], -0.25, 1_000)).toEqual({
      position: { x: 10, y: 20 },
      progress: 0,
    });
  });

  it("does not remove a ticker from an Office application that was already retired", () => {
    const remove = vi.fn();
    const app = { ticker: { remove } };
    const ticker = () => undefined;

    expect(removeOfficeTickerIfCurrent(app, null, ticker, null)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(removeOfficeTickerIfCurrent(app, app, ticker, ticker)).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("serializes live Main-to-Child dispatches and cancels a dispatch when its Child disappears", async () => {
    vi.useFakeTimers();
    const noAmbientClock = { setTimeout: () => 0, clearTimeout: () => undefined };
    const engine = new ChoreographyEngine();
    const actions: Array<{ participantId: string; actionId: string }> = [];
    const positionedRoutes: string[] = [];
    engine.subscribe((command) => {
      if (command.kind === "playAction" || command.kind === "playRouteStage") actions.push({ participantId: command.participantId, actionId: command.actionId });
      if (command.kind === "playRouteStage") positionedRoutes.push(command.routeId);
    });
    const director = new OfficeDirector(engine, resolver, undefined, noAmbientClock, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const childOne = participant("child-1", "child", "planning", "queued");
    const childTwo = participant("child-2", "child", "coder", "queued");
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await Promise.resolve();
    actions.length = 0;
    director.sync(officeSnapshot("scope-1", [main, childOne, childTwo]), [
      { kind: "participant-added", participantId: childOne.participantId, parentParticipantId: main.participantId },
      { kind: "participant-added", participantId: childTwo.participantId, parentParticipantId: main.participantId },
    ], false);
    await Promise.resolve();
    await vi.runAllTimersAsync();
    expect(actions.filter((item) => item.actionId === "seated-talk").map((item) => item.participantId)).toEqual(["child-1", "child-2"]);
    expect(positionedRoutes).toEqual(expect.arrayContaining(["handoff:standing-talk", "handoff:seated-talk", "handoff:salute"]));

    actions.length = 0;
    const childThree = participant("child-3", "child", "auditor", "queued");
    let notifyDispatchStarted: (() => void) | undefined;
    const dispatchStarted = new Promise<void>((resolve) => { notifyDispatchStarted = resolve; });
    const unsubscribe = engine.subscribe((command) => {
      if ((command.kind === "playAction" || command.kind === "playRouteStage") && command.participantId === "main" && command.actionId === "off-chair") notifyDispatchStarted?.();
    });
    director.sync(officeSnapshot("scope-1", [main, childOne, childTwo, childThree]), [
      { kind: "participant-added", participantId: childThree.participantId, parentParticipantId: main.participantId },
    ], false);
    await dispatchStarted;
    expect(actions.some((item) => item.participantId === "main" && item.actionId === "off-chair")).toBe(true);
    director.sync(officeSnapshot("scope-1", [main, childOne, childTwo]), [
      { kind: "participant-removed", participantId: childThree.participantId },
    ], false);
    await vi.runAllTimersAsync();
    expect(actions.some((item) => item.participantId === "child-3" && item.actionId === "seated-talk")).toBe(false);
    unsubscribe();
    director.dispose();
    vi.useRealTimers();
  });

  it("lights a newly seated Child screen before Main begins its dispatch", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const events: string[] = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") events.push(`screen:${command.stationId}:${command.profile}`);
      if (command.kind === "playAction") events.push(`action:${command.participantId}:${command.actionId}`);
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const child = participant("child-1", "child", "planning", "queued");
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await Promise.resolve();
    events.length = 0;

    director.sync(officeSnapshot("scope-1", [main, child]), [
      { kind: "participant-added", participantId: child.participantId, parentParticipantId: main.participantId },
    ], false);
    await vi.advanceTimersByTimeAsync(0);

    const screenIndex = events.indexOf("screen:planning:orchestration");
    const departureIndex = events.indexOf("action:main:off-chair");
    expect(screenIndex).toBeGreaterThanOrEqual(0);
    expect(departureIndex).toBeGreaterThan(screenIndex);
    director.dispose();
    vi.useRealTimers();
  });

  it("does not relight a queued Child station after that Child is removed", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const coderProfiles: string[] = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen" && command.stationId === "coder") coderProfiles.push(command.profile);
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const first = participant("child-1", "child", "planning", "queued");
    const queued = participant("child-2", "child", "coder", "queued");
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    director.sync(officeSnapshot("scope-1", [main, first, queued]), [
      { kind: "participant-added", participantId: first.participantId, parentParticipantId: main.participantId },
      { kind: "participant-added", participantId: queued.participantId, parentParticipantId: main.participantId },
    ], false);
    await vi.advanceTimersByTimeAsync(0);
    expect(coderProfiles).toContain("orchestration");

    director.sync(officeSnapshot("scope-1", [main, first]), [
      { kind: "participant-removed", participantId: queued.participantId },
    ], false);
    await vi.advanceTimersByTimeAsync(0);
    expect(coderProfiles.at(-1)).toBe("off");
    await vi.runAllTimersAsync();
    expect(coderProfiles.at(-1)).toBe("off");

    director.dispose();
    vi.useRealTimers();
  });

  it("waits for Main ambient to return before dispatch and restores the latest canonical state", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const actions: Array<{ participantId: string; actionId: string }> = [];
    engine.subscribe((command) => {
      if (command.kind === "playAction" || command.kind === "playRouteStage") actions.push({ participantId: command.participantId, actionId: command.actionId });
    });
    const director = new OfficeDirector(engine, resolver, undefined, undefined, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const child = participant("child-1", "child", "planning", "queued");
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(actions.at(-1)).toEqual({ participantId: "main", actionId: "peek" });

    director.sync(officeSnapshot("scope-1", [main, child]), [
      { kind: "participant-added", participantId: child.participantId, parentParticipantId: main.participantId },
    ], false);
    await Promise.resolve();
    expect(actions.some((item) => item.participantId === "main" && item.actionId === "off-chair")).toBe(false);

    const workingMain = { ...main, state: "working" as const };
    director.sync(officeSnapshot("scope-1", [workingMain, child]), [
      { kind: "state-changed", participantId: main.participantId, from: "idle", to: "working" },
    ], false);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(actions.some((item) => item.participantId === "main" && item.actionId === "off-chair")).toBe(true);
    expect(actions.filter((item) => item.participantId === "main").at(-1)?.actionId).toBe("working");
    director.dispose();
    vi.useRealTimers();
  });

  it("cancels stale choreography and applies the latest state at a changed station", async () => {
    const engine = new ChoreographyEngine();
    const commands: Array<{ kind: string; participantId?: string; stationId?: string; profile?: string; routeId?: string; points?: Array<{ x: number; y: number }>; actionId?: string }> = [];
    engine.subscribe((command) => { commands.push(command); });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const before = participant("child-1", "child", "planning", "idle");
    director.hydrate(officeSnapshot("scope-1", [participant("main", "main", "main", "idle"), before]), false);
    await Promise.resolve();
    commands.length = 0;

    const after = { ...before, stationId: "coder", state: "working" as const };
    director.sync(officeSnapshot("scope-1", [participant("main", "main", "main", "idle"), after]), [
      { kind: "station-changed", participantId: after.participantId, fromStationId: "planning", toStationId: "coder" },
      { kind: "state-changed", participantId: after.participantId, from: "idle", to: "working" },
    ], false);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const coder = resolver.stations().find((station) => station.stationId === "coder")!;
    expect(commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "setScreen", stationId: "planning", profile: "off" }),
      expect.objectContaining({ kind: "playRouteStage", participantId: "child-1", routeId: "canonical-seat", actionId: "working", points: [coder.anchors.seat] }),
      expect.objectContaining({ kind: "setScreen", stationId: "coder", profile: "orchestration" }),
    ]));
    expect(commands.filter((command) => command.kind === "followRoute" && command.participantId === "child-1")).toHaveLength(0);
    director.dispose();
  });

  it("turns an occupied screen off only after facility departure and restores it on return", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const profiles: string[] = [];
    engine.subscribe(async (command) => {
      if (command.kind === "setScreen" && command.stationId === "main") profiles.push(command.profile);
      if (command.kind === "playRouteStage") {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, command.durationMs));
      }
    });
    const director = new OfficeDirector(engine, resolver, undefined, undefined, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    main.ambientPreferences = [{ action: "coffee", weight: 1 }];
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await Promise.resolve();
    expect(profiles).toEqual(["orchestration"]);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(profiles).toEqual(["orchestration"]);
    const route = resolver.stations().find((station) => station.stationId === "main")!.facilityRoutes.coffee;
    await vi.advanceTimersByTimeAsync(route[0]!.durationMs);
    expect(profiles.at(-1)).toBe("off");
    await vi.advanceTimersByTimeAsync(route.slice(1).reduce((total, stage) => total + stage.durationMs, 0));
    expect(profiles.at(-1)).toBe("orchestration");

    director.dispose();
    vi.useRealTimers();
  });

  it("restores the occupied default screen after temporary entertainment", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const profiles: string[] = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen" && command.stationId === "main") profiles.push(command.profile);
    });
    const director = new OfficeDirector(engine, resolver, undefined, undefined, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    main.ambientPreferences = [{ action: "entertainment-1", weight: 1 }];
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(profiles.at(-1)).toBe("entertainment-1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(profiles.at(-1)).toBe("orchestration");

    director.dispose();
    vi.useRealTimers();
  });

  it("does not let a removed resident turn off a station occupied by its real replacement", async () => {
    const engine = new ChoreographyEngine();
    const screens: Array<{ stationId: string; profile: string }> = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") screens.push({ stationId: command.stationId, profile: command.profile });
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const previous = officeSnapshot("scope-1", [main]);
    previous.residents = [{
      residentId: "resident:memory-maintenance-agent",
      roleId: "memory-maintenance-agent",
      label: "Memory Maintenance Agent",
      stationId: "planning",
      scarf: "maintenance",
      ambientPreferences: [{ action: "peek", weight: 1 }],
    }];
    director.hydrate(previous, false);
    await Promise.resolve();
    screens.length = 0;

    const replacement = participant("child-1", "child", "planning", "idle");
    director.sync(officeSnapshot("scope-1", [main, replacement]), [
      { kind: "resident-removed", residentId: previous.residents[0]!.residentId },
      { kind: "participant-added", participantId: replacement.participantId, parentParticipantId: null },
    ], false);
    await Promise.resolve();

    expect(screens).toContainEqual({ stationId: "planning", profile: "orchestration" });
    expect(screens).not.toContainEqual({ stationId: "planning", profile: "off" });
    director.dispose();
  });

  it("does not let a displaced resident turn off the old station after a real Agent takes it", async () => {
    const engine = new ChoreographyEngine();
    const screens: Array<{ stationId: string; profile: string }> = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") screens.push({ stationId: command.stationId, profile: command.profile });
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const previous = officeSnapshot("scope-1", [main]);
    const resident = {
      residentId: "resident:memory-maintenance-agent",
      roleId: "memory-maintenance-agent",
      label: "Memory Maintenance Agent",
      stationId: "planning",
      scarf: "maintenance" as const,
      ambientPreferences: [{ action: "peek" as const, weight: 1 }],
    };
    previous.residents = [resident];
    director.hydrate(previous, false);
    await Promise.resolve();
    screens.length = 0;

    const replacement = participant("child-1", "child", "planning", "idle");
    const next = officeSnapshot("scope-1", [main, replacement]);
    next.residents = [{ ...resident, stationId: "coder" }];
    director.sync(next, [
      { kind: "participant-added", participantId: replacement.participantId, parentParticipantId: null },
      { kind: "resident-station-changed", residentId: resident.residentId, fromStationId: "planning", toStationId: "coder" },
    ], false);
    await Promise.resolve();

    expect(screens).toContainEqual({ stationId: "planning", profile: "orchestration" });
    expect(screens).toContainEqual({ stationId: "coder", profile: "orchestration" });
    expect(screens).not.toContainEqual({ stationId: "planning", profile: "off" });
    director.dispose();
  });

  it("clears vacated screens and restores every occupied screen across a scope reset", async () => {
    const engine = new ChoreographyEngine();
    const screens: Array<{ stationId: string; profile: string }> = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") screens.push({ stationId: command.stationId, profile: command.profile });
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const priorMain = participant("main", "main", "main", "idle");
    const priorChild = participant("child-old", "child", "planning", "idle");
    director.hydrate(officeSnapshot("scope-old", [priorMain, priorChild]), false);
    await Promise.resolve();
    screens.length = 0;

    const nextMain = participant("main", "main", "main", "completed");
    const nextChild = participant("child-new", "child", "coder", "idle");
    director.sync(officeSnapshot("scope-new", [nextMain, nextChild]), [
      { kind: "scope-reset", previousContextId: "scope-old" },
    ], false);
    await Promise.resolve();

    expect(screens).toContainEqual({ stationId: "planning", profile: "off" });
    expect(screens).toContainEqual({ stationId: "main", profile: "orchestration" });
    expect(screens).toContainEqual({ stationId: "coder", profile: "orchestration" });
    director.dispose();
  });

  it("restores an occupied screen when semantic state interrupts a facility departure", async () => {
    vi.useFakeTimers();
    const engine = new ChoreographyEngine();
    const profiles: string[] = [];
    engine.subscribe(async (command) => {
      if (command.kind === "setScreen" && command.stationId === "main") profiles.push(command.profile);
      if (command.kind === "playRouteStage") await new Promise<void>((resolve) => globalThis.setTimeout(resolve, command.durationMs));
    });
    const director = new OfficeDirector(engine, resolver, undefined, undefined, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    main.ambientPreferences = [{ action: "coffee", weight: 1 }];
    director.hydrate(officeSnapshot("scope-1", [main]), false);
    await vi.advanceTimersByTimeAsync(8_000 + resolver.stations().find((station) => station.stationId === "main")!.facilityRoutes.coffee[0]!.durationMs);
    expect(profiles.at(-1)).toBe("off");

    const working = { ...main, state: "working" as const };
    director.sync(officeSnapshot("scope-1", [working]), [
      { kind: "state-changed", participantId: main.participantId, from: "idle", to: "working" },
    ], false);
    await Promise.resolve();
    expect(profiles.at(-1)).toBe("orchestration");

    director.dispose();
    vi.useRealTimers();
  });

  it("keeps occupied screens requested when reduced motion changes", async () => {
    const engine = new ChoreographyEngine();
    const profiles: string[] = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") profiles.push(command.profile);
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const snapshot = officeSnapshot("scope-1", [participant("main", "main", "main", "idle")]);
    director.hydrate(snapshot, false);
    await Promise.resolve();
    profiles.length = 0;

    director.sync(snapshot, [], true);
    await Promise.resolve();

    expect(profiles).toContain("orchestration");
    expect(profiles).not.toContain("off");
    director.dispose();
  });

  it("turns off a station after its last occupant is removed", async () => {
    const engine = new ChoreographyEngine();
    const screens: Array<{ stationId: string; profile: string }> = [];
    engine.subscribe((command) => {
      if (command.kind === "setScreen") screens.push({ stationId: command.stationId, profile: command.profile });
    });
    const director = new OfficeDirector(engine, resolver, undefined, { setTimeout: () => 0, clearTimeout: () => undefined }, { next: () => 0 });
    const main = participant("main", "main", "main", "idle");
    const child = participant("child-1", "child", "planning", "idle");
    director.hydrate(officeSnapshot("scope-1", [main, child]), false);
    await Promise.resolve();
    screens.length = 0;

    director.sync(officeSnapshot("scope-1", [main]), [
      { kind: "participant-removed", participantId: child.participantId },
    ], false);
    await Promise.resolve();

    expect(screens).toContainEqual({ stationId: "planning", profile: "off" });
    director.dispose();
  });

  it("commits only the latest detached office render generation", () => {
    const committed: string[] = [];
    const discarded: string[] = [];
    expect(commitLatestOfficeRender(2, 2, "new-scope", (value) => committed.push(value), (value) => discarded.push(value))).toBe(true);
    expect(commitLatestOfficeRender(1, 2, "old-scope", (value) => committed.push(value), (value) => discarded.push(value))).toBe(false);
    expect(committed).toEqual(["new-scope"]);
    expect(discarded).toEqual(["old-scope"]);
  });

  it("recolors only synchronized scarf-mask pixels", () => {
    const actor = new Uint8ClampedArray([
      201, 100, 66, 255,
      20, 20, 20, 255,
      245, 238, 214, 255,
    ]);
    const before = actor.slice();
    const mask = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    applyScarfMask(actor, mask, [2, 140, 255]);
    expect([...actor.slice(4)]).toEqual([...before.slice(4)]);
    expect([...actor.slice(0, 3)]).not.toEqual([...before.slice(0, 3)]);
  });

});

function snapshotWithStates(states: Array<"idle" | "working" | "completed">): OfficeExperienceSnapshot {
  const stations = resolver.stations().slice(0, states.length);
  return {
    contextId: "scope-1",
    revision: states.join("-"),
    lifecycle: "active",
    diagnostics: [],
    stations,
    residents: [],
    participants: states.map((state, index) => ({
      participantId: `actor-${index}`,
      navigationId: `actor-${index}`,
      stationId: stations[index]!.stationId,
      parentParticipantId: index === 0 ? null : "actor-0",
      kind: index === 0 ? "main" : "child",
      roleId: index === 0 ? "main" : "worker",
      label: `Actor ${index}`,
      createdAt: `2026-07-18T00:00:0${index}Z`,
      state,
      scarf: index === 0 ? "main" : "coder",
      ambientPreferences: [{ action: "peek", weight: 1 }],
    })),
  };
}

function participant(participantId: string, kind: "main" | "child", stationId: string, state: OfficeParticipant["state"]): OfficeParticipant {
  return {
    participantId,
    navigationId: participantId,
    stationId,
    parentParticipantId: kind === "main" ? null : "main",
    kind,
    roleId: kind === "main" ? "main-agent" : `${stationId}-agent`,
    label: participantId,
    createdAt: `2026-07-18T00:00:0${participantId.length}Z`,
    state,
    scarf: kind === "main" ? "main" : "coder",
    ambientPreferences: [{ action: "peek", weight: 1 }],
  };
}

function officeSnapshot(contextId: string, participants: OfficeParticipant[]): OfficeExperienceSnapshot {
  const stationIds = new Set(["main", "planning", "coder", "auditor"]);
  return {
    contextId,
    revision: `${contextId}:${participants.map((item) => item.participantId).join(",")}`,
    lifecycle: "active",
    diagnostics: [],
    stations: resolver.stations().filter((station) => stationIds.has(station.stationId)),
    residents: [],
    participants,
  };
}
