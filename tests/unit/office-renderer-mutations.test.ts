import { describe, expect, it, vi } from "vitest";
import {
  reconcileOfficeParticipants,
  setOfficeStationScreen,
} from "../../src/web/src/office/PixiOfficeRenderer.js";
import type { OfficeSceneModel } from "../../src/web/src/office/officeScene.js";

describe("Office renderer async mutations", () => {
  it("releases a delayed actor asset without committing a stale render generation", async () => {
    const deferred = createDeferred<{ release: () => void }>();
    const lateRelease = vi.fn();
    const addChild = vi.fn();
    let currentGeneration = 1;
    const reconcile = reconcileOfficeParticipants(
      {} as never,
      { acquireAction: vi.fn(() => deferred.promise) } as never,
      { personLayer: { addChild } } as never,
      new Map(),
      sceneWithActor(),
      false,
      1,
      () => currentGeneration,
    );

    await Promise.resolve();
    currentGeneration = 2;
    deferred.resolve({ release: lateRelease });
    await reconcile;

    expect(lateRelease).toHaveBeenCalledOnce();
    expect(addChild).not.toHaveBeenCalled();
  });

  it("does not relight a station when a cancelled ambient screen asset arrives late", async () => {
    const deferred = createDeferred<ReturnType<typeof screenHandle>>();
    const lateHandle = screenHandle();
    const currentHandle = screenHandle();
    const screen = screenSprite();
    const station = stationVisual(screen, currentHandle, "orchestration");
    const ambient = new AbortController();
    const assets = { acquireScreen: vi.fn(() => deferred.promise) };

    const pending = setOfficeStationScreen(assets as never, station as never, "entertainment-1", ambient.signal);
    await Promise.resolve();
    ambient.abort();
    await setOfficeStationScreen(assets as never, station as never, "off", new AbortController().signal);
    deferred.resolve(lateHandle);
    await pending;

    expect(screen.visible).toBe(false);
    expect(screen.gotoAndPlay).not.toHaveBeenCalled();
    expect(currentHandle.release).not.toHaveBeenCalled();
    expect(lateHandle.release).toHaveBeenCalledOnce();
    expect(station.screenProfile).toBe("orchestration");
  });

  it("commits a current station screen asset", async () => {
    const nextHandle = screenHandle();
    const currentHandle = screenHandle();
    const screen = screenSprite();
    const station = stationVisual(screen, currentHandle, "orchestration");

    await setOfficeStationScreen(
      { acquireScreen: vi.fn(async () => nextHandle) } as never,
      station as never,
      "entertainment-2",
      new AbortController().signal,
      0,
      false,
    );

    expect(currentHandle.release).toHaveBeenCalledOnce();
    expect(nextHandle.release).not.toHaveBeenCalled();
    expect(station.screenHandle).toBe(nextHandle);
    expect(station.screenProfile).toBe("entertainment-2");
    expect(screen.visible).toBe(true);
    expect(screen.gotoAndPlay).toHaveBeenCalledWith(0);
  });
});

function sceneWithActor(): OfficeSceneModel {
  return {
    conversationId: "conversation-1",
    graphScopeId: "scope-1",
    projectionHash: "projection-1",
    scopeStatus: "active",
    width: 100,
    height: 100,
    stations: [],
    zones: [],
    events: [],
    diagnostics: [],
    actors: [{
      actorId: "agent-1",
      seatId: "planning",
      agentSurfaceId: "agent-1",
      kind: "agent",
      roleId: "planning-agent",
      label: "Planning Agent",
      status: "idle",
      parentActorId: "main-agent",
      workstation: { x: 0, y: 0 },
      anchors: {
        seat: { x: 10, y: 20 },
        handoff: { x: 10, y: 20 },
        facilityDeparture: { x: 10, y: 20 },
      },
      scarf: "blue",
      createdAt: "2026-07-25T00:00:00.000Z",
      ambientPreferences: [],
    }],
  };
}

function screenHandle() {
  return {
    asset: {
      animationId: "screen",
      animation: { fps: 12 },
      sheet: { animations: { screen: ["frame-1"] } },
    },
    release: vi.fn(),
  };
}

function screenSprite() {
  return {
    visible: true,
    textures: ["old-frame"],
    totalFrames: 1,
    animationSpeed: 0,
    width: 0,
    height: 0,
    stop: vi.fn(),
    gotoAndStop: vi.fn(),
    gotoAndPlay: vi.fn(),
  };
}

function stationVisual(screen: ReturnType<typeof screenSprite>, handle: ReturnType<typeof screenHandle>, profile: string) {
  return {
    station: { stationId: "planning" },
    screen,
    screenHandle: handle,
    screenProfile: profile,
    screenWidth: 100,
    screenHeight: 50,
  };
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
