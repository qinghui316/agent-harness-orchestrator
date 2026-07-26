import { describe, expect, it } from "vitest";
import {
  OFFICE_SCENE_CALIBRATION,
  officeFacilityRoutePoints,
  officeFacilityStageFlipX,
  officeFacilityStageOffset,
  officeFacilityStagePointOffsets,
  parseOfficeSceneCalibration,
  serializeOfficeSceneCalibration,
} from "../../src/web/src/office/officeSceneCalibration.js";

describe("Office transition calibration route targets", () => {
  it("keeps facility route overrides isolated by Agent", () => {
    const calibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibration.facilityRouteTargets = {
      planning: {
        treadmill: {
          routePointOffsets: {
            start: { x: 13, y: -7 },
            waypoint: { x: 21, y: 4 },
            contact: { x: -9, y: 5 },
          },
          stageOffsets: { "walk-out": { x: 31, y: 6 } },
          stagePointOffsets: {
            "walk-out": {
              start: { x: 1, y: 2 },
              waypoint: { x: 3, y: 4 },
              end: { x: 5, y: 6 },
            },
          },
          stageFlipX: { "walk-out": true, "walk-return": false },
        },
      },
    };
    const restored = parseOfficeSceneCalibration(serializeOfficeSceneCalibration(calibration));
    const planning = officeFacilityRoutePoints("treadmill", 1, restored);
    const coder = officeFacilityRoutePoints("treadmill", 2, restored);
    const planningBase = officeFacilityRoutePoints("treadmill", 1, OFFICE_SCENE_CALIBRATION);
    const coderBase = officeFacilityRoutePoints("treadmill", 2, OFFICE_SCENE_CALIBRATION);

    expect(planning.start).toEqual({ x: planningBase.start.x + 13, y: planningBase.start.y - 7 });
    expect(planning.waypoint).toEqual({ x: planningBase.waypoint.x + 21, y: planningBase.waypoint.y + 4 });
    expect(coder).toEqual(coderBase);
    expect(officeFacilityStageOffset("treadmill", "walk-out", 1, restored)).toEqual({ x: 31, y: 6 });
    expect(officeFacilityStageOffset("treadmill", "walk-out", 2, restored)).toEqual({ x: 0, y: 0 });
    expect(officeFacilityStagePointOffsets("treadmill", "walk-out", 1, restored).waypoint).toEqual({ x: 3, y: 4 });
    expect(officeFacilityStagePointOffsets("treadmill", "walk-out", 2, restored).waypoint).toEqual({ x: 0, y: 0 });
    expect(officeFacilityStageFlipX("treadmill", "walk-out", 1, false, restored)).toBe(true);
    expect(officeFacilityStageFlipX("treadmill", "walk-out", 2, false, restored)).toBe(false);
  });
});
