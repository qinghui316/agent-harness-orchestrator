import { describe, expect, it } from "vitest";
import {
  OFFICE_SCENE_CALIBRATION_CHECKPOINT_KEY,
  OFFICE_SCENE_CALIBRATION_DIRTY_KEY,
  OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY,
  OFFICE_SCENE_CALIBRATION_PREVIOUS_KEY,
  OFFICE_SCENE_CALIBRATION_STORAGE_KEY,
  hydrateOfficeSceneCalibrationFromWorkspace,
  loadStoredOfficeSceneCalibration,
  restorePreviousOfficeSceneCalibration,
  saveOfficeSceneCalibration,
  type CalibrationWorkspaceStore,
} from "../../src/web/src/office/calibration/sceneCalibrationStorage.js";
import {
  OFFICE_SCENE_CALIBRATION,
  parseOfficeSceneCalibration,
  serializeOfficeSceneCalibration,
} from "../../src/web/src/office/officeSceneCalibration.js";

describe("Office scene calibration storage", () => {
  it("never overwrites an unparseable primary value", () => {
    const storage = new MemoryStorage({ [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: "{broken" });
    const loaded = loadStoredOfficeSceneCalibration(storage);

    expect(loaded.autoSaveAllowed).toBe(false);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe("{broken");
    expect(() => saveOfficeSceneCalibration(storage, loaded.calibration, loaded.primaryValue)).toThrow("已阻止自动覆盖");
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe("{broken");
  });

  it("creates a session checkpoint and a previous-version backup", () => {
    const original = structuredClone(OFFICE_SCENE_CALIBRATION);
    original.actionScales.working = 0.46;
    const serialized = serializeOfficeSceneCalibration(original);
    const storage = new MemoryStorage({ [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: serialized });

    const loaded = loadStoredOfficeSceneCalibration(storage);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_CHECKPOINT_KEY)).toBe(serialized);

    loaded.calibration.routeStagePointOffsets.treadmill["walk-out"].waypoint = { x: 31.5, y: -18 };
    saveOfficeSceneCalibration(storage, loaded.calibration, loaded.primaryValue);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_PREVIOUS_KEY)).toBe(serialized);
    expect(parseOfficeSceneCalibration(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)!))
      .toEqual(loaded.calibration);
  });

  it("restores calibrated route points after a remount", () => {
    const storage = new MemoryStorage();
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.routeStageOffsets.toilet["walk-return"] = { x: 17, y: -6.5 };
    calibrated.routeStagePointOffsets.toilet["leaving-return"].end = { x: -24, y: 11 };

    saveOfficeSceneCalibration(storage, calibrated, null);
    const remounted = loadStoredOfficeSceneCalibration(storage);

    expect(remounted.autoSaveAllowed).toBe(true);
    expect(remounted.calibration.routeStageOffsets.toilet["walk-return"]).toEqual({ x: 17, y: -6.5 });
    expect(remounted.calibration.routeStagePointOffsets.toilet["leaving-return"].end).toEqual({ x: -24, y: 11 });
  });

  it("does not materialize inherited handoff route stages while parsing", () => {
    const calibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    const targetKey = "planning";
    calibration.handoff.targetRoutes[targetKey] = {
      targetCorridorOffset: { x: 0, y: 0 },
      interactionOffset: { x: 0, y: 0 },
      walkVerticalFlipX: false,
      stagePathPointOffsets: {
        "walk-target-row": structuredClone(calibration.handoff.stagePathPointOffsets["walk-target-row"]),
      },
    };

    const parsed = parseOfficeSceneCalibration(serializeOfficeSceneCalibration(calibration));

    expect(parsed.handoff.targetRoutes[targetKey]?.stagePathPointOffsets?.["walk-target-depart"]).toBeUndefined();
    expect(parsed.handoff.targetRoutes[targetKey]?.stagePathPointOffsets?.["walk-source-row"]).toBeUndefined();
  });

  it("blocks stale tabs and restores the value saved before an overwrite", () => {
    const original = structuredClone(OFFICE_SCENE_CALIBRATION);
    const originalValue = serializeOfficeSceneCalibration(original);
    const storage = new MemoryStorage({ [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: originalValue });
    const firstTab = loadStoredOfficeSceneCalibration(storage);
    const staleTab = loadStoredOfficeSceneCalibration(storage);

    firstTab.calibration.routeStageOffsets.treadmill["walk-out"] = { x: 21, y: -9 };
    const firstValue = saveOfficeSceneCalibration(storage, firstTab.calibration, firstTab.primaryValue);
    staleTab.calibration.routeStageOffsets.toilet["walk-return"] = { x: -30, y: 12 };

    expect(() => saveOfficeSceneCalibration(storage, staleTab.calibration, staleTab.primaryValue))
      .toThrow("另一个页面更新");
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe(firstValue);

    const restored = restorePreviousOfficeSceneCalibration(storage);
    expect(restored.calibration).toEqual(original);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_PREVIOUS_KEY)).toBe(firstValue);
  });

  it("seeds the workspace file from the current browser calibration without replacing it", async () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.routeStagePointOffsets.treadmill["walk-out"].waypoint = { x: 38, y: -12 };
    const source = serializeOfficeSceneCalibration(calibrated);
    const storage = new MemoryStorage({ [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: source });
    let written = "";
    const workspace: CalibrationWorkspaceStore = {
      read: async () => null,
      write: async (next) => { written = next; return 250; },
    };

    await hydrateOfficeSceneCalibrationFromWorkspace(storage, workspace);

    expect(written).toBe(source);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe(source);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY)).toBe("250");
  });

  it("replaces clean browser calibration from the workspace regardless of timestamps", async () => {
    const local = structuredClone(OFFICE_SCENE_CALIBRATION);
    local.routeStageOffsets.treadmill["walk-out"] = { x: 7, y: 8 };
    const workspaceCalibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    workspaceCalibration.routeStageOffsets.treadmill["walk-out"] = { x: 41, y: -19 };
    const workspaceSource = serializeOfficeSceneCalibration(workspaceCalibration);
    const storage = new MemoryStorage({
      [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: serializeOfficeSceneCalibration(local),
      [OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY]: "900",
    });
    const workspace: CalibrationWorkspaceStore = {
      read: async () => ({ source: workspaceSource, modifiedAt: 500 }),
      write: async () => { throw new Error("newer workspace calibration must not be overwritten"); },
    };

    await hydrateOfficeSceneCalibrationFromWorkspace(storage, workspace);

    expect(parseOfficeSceneCalibration(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)!))
      .toEqual(workspaceCalibration);
    expect(parseOfficeSceneCalibration(storage.getItem(OFFICE_SCENE_CALIBRATION_PREVIOUS_KEY)!))
      .toEqual(local);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY)).toBe("500");
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_DIRTY_KEY)).toBe("0");
  });

  it("recovers explicitly dirty browser calibration after a server crash", async () => {
    const local = structuredClone(OFFICE_SCENE_CALIBRATION);
    local.routeStageOffsets.treadmill["walk-out"] = { x: 7, y: 8 };
    const workspaceCalibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    workspaceCalibration.routeStageOffsets.treadmill["walk-out"] = { x: 41, y: -19 };
    const localSource = serializeOfficeSceneCalibration(local);
    const storage = new MemoryStorage({
      [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: localSource,
      [OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY]: "100",
      [OFFICE_SCENE_CALIBRATION_DIRTY_KEY]: "1",
    });
    let written = "";
    const workspace: CalibrationWorkspaceStore = {
      read: async () => ({ source: serializeOfficeSceneCalibration(workspaceCalibration), modifiedAt: 500 }),
      write: async (next) => { written = next; return 800; },
    };

    await hydrateOfficeSceneCalibrationFromWorkspace(storage, workspace);

    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe(localSource);
    expect(written).toBe(localSource);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY)).toBe("800");
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_DIRTY_KEY)).toBe("0");
  });

  it("restores workspace calibration only when the browser origin has no calibration", async () => {
    const workspaceCalibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    workspaceCalibration.routeStageOffsets.treadmill["walk-out"] = { x: 41, y: -19 };
    const workspaceSource = serializeOfficeSceneCalibration(workspaceCalibration);
    const storage = new MemoryStorage();
    const workspace: CalibrationWorkspaceStore = {
      read: async () => ({ source: workspaceSource, modifiedAt: 500 }),
      write: async () => { throw new Error("workspace must remain authoritative for an empty origin"); },
    };

    await hydrateOfficeSceneCalibrationFromWorkspace(storage, workspace);

    expect(parseOfficeSceneCalibration(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)!))
      .toEqual(workspaceCalibration);
    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_MODIFIED_AT_KEY)).toBe("500");
  });

  it("does not overwrite an invalid browser primary with workspace data", async () => {
    const storage = new MemoryStorage({ [OFFICE_SCENE_CALIBRATION_STORAGE_KEY]: "{broken" });
    const workspace: CalibrationWorkspaceStore = {
      read: async () => ({ source: serializeOfficeSceneCalibration(OFFICE_SCENE_CALIBRATION), modifiedAt: 500 }),
      write: async () => { throw new Error("invalid browser data must remain protected"); },
    };

    await hydrateOfficeSceneCalibrationFromWorkspace(storage, workspace);

    expect(storage.getItem(OFFICE_SCENE_CALIBRATION_STORAGE_KEY)).toBe("{broken");
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
