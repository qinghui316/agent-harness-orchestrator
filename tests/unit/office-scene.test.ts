import { describe, expect, it } from "vitest";
import { createOfficeScene, OFFICE_ACTOR_SCALE, OFFICE_WORKSTATION_GEOMETRY } from "../../src/web/src/office/officeScene.js";
import { HarnessOfficeAdapter } from "../../src/web/src/office/harnessOfficeAdapter.js";
import { officePresentationForRole } from "../../src/web/src/office/officePresentationRegistry.js";
import { OFFICE_RUNTIME_CALIBRATION } from "../../src/web/src/office/officeRuntimeCalibration.generated.js";
import {
  OFFICE_ACTION_IDS,
  OFFICE_COMPONENT_SCALE_MAX,
  OFFICE_FACILITY_ROUTES,
  OFFICE_FACILITY_SCALE_MAX,
  OFFICE_HANDOFF_MOVING_STAGE_IDS,
  OFFICE_HANDOFF_STAGE_IDS,
  OFFICE_MAIN_HANDOFF_SOURCE_SEAT_INDEX,
  OFFICE_ROUTE_STAGE_IDS,
  OFFICE_SCENE_CALIBRATION,
  OFFICE_TRANSITION_IDS,
  officeActionPlaybackFrameCount,
  officeActionPlaybackRate,
  officeActionSourceFrameIndex,
  officeActionWorldAnchor,
  officeFacilityRoutePoints,
  officeFacilityWalkGuidePoints,
  officeHandoffRoutePoints,
  officeHandoffInteractionWorldPoint,
  officeHandoffLinkedWalkBasePoint,
  officeHandoffSaluteWorldPoint,
  officeHandoffSeatedTalkWorldPoint,
  officeHandoffStageOffset,
  officeHandoffStagePathPointOffsets,
  officeHandoffStagePointOffsets,
  officeHandoffTargetRouteCalibration,
  officeHandoffWalkVerticalFlipX,
  officeHandoffWalkVerticalReturnFlipX,
  officeSeatActorAnchor,
  officeActorOffsetForAction,
  officeActorScaleForAction,
  officeTransitionDirection,
  parseOfficeSceneCalibration,
  resizeWorkstationComponent,
  serializeOfficeSceneCalibration,
  validateOfficeSceneCalibration,
  workstationComponentScaleFactor,
} from "../../src/web/src/office/officeSceneCalibration.js";
import { officeActorLabelLocalPosition, officeActorLabelWorldPosition, officeActorStatusLocalPosition } from "../../src/web/src/office/officeActorLabel.js";
import type { AgentSurfaceProjection, AgentSurfaceProjectionItem } from "../../src/web/src/types.js";

describe("OfficeSceneAdapter", () => {
  it("places Main and eight catalog roles in three deterministic horizontal rows", () => {
    const scene = createOfficeScene(new HarnessOfficeAdapter("project-1").hydrate(projection(0)));
    expect(scene.stations).toHaveLength(9);
    expect(scene.actors).toHaveLength(1);
    expect(scene.stations.map((station) => station.stationId)).toEqual(["main", "planning", "coder", "auditor", "rework", "spec-proposer", "spec-generator", "maintenance", "evolution"]);
    expect(scene.actors[0]).toMatchObject({ actorId: "main-agent", kind: "main-agent", scarf: "main" });
    expect(scene.zones.map((zone) => zone.id)).toEqual(["water-coffee", "fitness", "toilet"]);
    expect(OFFICE_ACTOR_SCALE).toBe(0.45);
    expect(relativeToWorkstation(scene.actors[0]!.anchors.seat, scene.actors[0]!.workstation)).toEqual(relativeToWorkstation(
      officeSeatActorAnchor(0, OFFICE_RUNTIME_CALIBRATION),
      OFFICE_RUNTIME_CALIBRATION.roster.seats[0]!.origin,
    ));
    expect(relativeToWorkstation(scene.stations[1]!.anchors.seat, scene.stations[1]!.origin)).toEqual(relativeToWorkstation(
      officeSeatActorAnchor(1, OFFICE_RUNTIME_CALIBRATION),
      OFFICE_RUNTIME_CALIBRATION.roster.seats[1]!.origin,
    ));
    const monitorAnchor = relativeToWorkstation(scene.stations[1]!.anchors.monitor, scene.stations[1]!.origin);
    expect(monitorAnchor.x).toBeCloseTo(OFFICE_WORKSTATION_GEOMETRY.standard.anchors.monitor.x, 1);
    expect(monitorAnchor.y).toBeCloseTo(OFFICE_WORKSTATION_GEOMETRY.standard.anchors.monitor.y, 1);
    expect(OFFICE_WORKSTATION_GEOMETRY.standard.desk.scaleX * (1654 / 2)).toBeCloseTo(183, 0);
    expect(OFFICE_SCENE_CALIBRATION.facilities.treadmill.scale / OFFICE_ACTOR_SCALE).toBeCloseTo(1.23, 12);
  });

  it("keeps fixed stations while canonical children appear without catalog actors", () => {
    const adapter = new HarnessOfficeAdapter("project-1");
    const empty = createOfficeScene(adapter.hydrate(projection(0)));
    const populated = createOfficeScene(adapter.hydrate(projection(3)));
    expect(populated.stations.map((station) => station.origin)).toEqual(empty.stations.map((station) => station.origin));
    expect(populated.actors).toHaveLength(4);
    expect(populated.actors.slice(1).map((actor) => actor.agentSurfaceId)).toEqual(["agent:planning", "agent:coder", "agent:auditor"]);
  });

  it("hydrates without replay and emits only a live canonical child addition", () => {
    const adapter = new HarnessOfficeAdapter("project-1");
    const first = projection(0);
    expect(adapter.hydrate(first).participants).toHaveLength(1);
    expect(adapter.reconcile(first, first).events).toEqual([]);
    const next = projection(1);
    expect(adapter.reconcile(first, next).events).toEqual([{ kind: "participant-added", participantId: "agent:planning", parentParticipantId: "main-agent" }]);
  });

  it("uses one validated calibration and an explicit role scarf palette", () => {
    expect(() => validateOfficeSceneCalibration(OFFICE_SCENE_CALIBRATION)).not.toThrow();
    expect(parseOfficeSceneCalibration(serializeOfficeSceneCalibration(OFFICE_SCENE_CALIBRATION))).toEqual(OFFICE_SCENE_CALIBRATION);
    const invalid = structuredClone(OFFICE_SCENE_CALIBRATION);
    invalid.actionScales.working = 1.21;
    expect(() => parseOfficeSceneCalibration(JSON.stringify(invalid))).toThrow("working must be between");
    const invalidOffset = structuredClone(OFFICE_SCENE_CALIBRATION);
    invalidOffset.actionOffsets.toilet.x = Number.NaN;
    expect(() => validateOfficeSceneCalibration(invalidOffset)).toThrow("Office action offset toilet");
    const invalidDirection = structuredClone(OFFICE_SCENE_CALIBRATION);
    invalidDirection.transitionDirections["walk-treadmill"].fromFlipX = null as never;
    expect(() => validateOfficeSceneCalibration(invalidDirection)).toThrow("walk-treadmill is invalid");
    const invalidRouteOffset = structuredClone(OFFICE_SCENE_CALIBRATION);
    invalidRouteOffset.routeStageOffsets.treadmill["walk-out"].x = Number.NaN;
    expect(() => validateOfficeSceneCalibration(invalidRouteOffset)).toThrow("treadmill/walk-out");
    const invalidRoutePointOffset = structuredClone(OFFICE_SCENE_CALIBRATION);
    invalidRoutePointOffset.routeStagePointOffsets.treadmill["leaving-return"].waypoint.y = Number.NaN;
    expect(() => validateOfficeSceneCalibration(invalidRoutePointOffset)).toThrow("treadmill/leaving-return/waypoint");
    expect(officePresentationForRole("main-agent").scarf).toBe("main");
    expect(officePresentationForRole("planning-agent").scarf).toBe("planning");
    expect(officePresentationForRole("coder-agent").scarf).toBe("coder");
    expect(officePresentationForRole("auditor-agent").scarf).toBe("auditor");
    expect(officePresentationForRole("harness-evolution-agent").scarf).toBe("evolution");
    expect(officePresentationForRole("future-role").scarf).toBe("default");
  });

  it("keeps one shared scale per action while persisting relative prop sizes", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.actionScales.working = 0.42;
    calibrated.actionScales.standby = 0.51;
    calibrated.actionOffsets.working = { x: 4.5, y: -2 };
    expect(officeActorScaleForAction("working", calibrated)).toBe(0.42);
    expect(officeActorScaleForAction("standby", calibrated)).toBe(0.51);
    expect(officeActorScaleForAction("unknown", calibrated)).toBe(0.51);
    expect(officeActorOffsetForAction("working", calibrated)).toEqual({ x: 4.5, y: -2 });
    expect(officeActorOffsetForAction("unknown", calibrated)).toEqual({ x: 0, y: 0 });
    expect(calibrated.actionOffsets.standby).toEqual({ x: 0, y: 0 });
    expect(calibrated.workstations.standard.actor).toEqual(OFFICE_SCENE_CALIBRATION.workstations.standard.actor);
    calibrated.transitionDirections["walk-treadmill"].fromFlipX = false;
    expect(officeTransitionDirection("walk-treadmill", calibrated).fromFlipX).toBe(false);
    expect(Object.keys(calibrated.transitionDirections).sort()).toEqual([...OFFICE_TRANSITION_IDS].sort());
    expect(OFFICE_FACILITY_SCALE_MAX).toBe(10);
    expect(OFFICE_COMPONENT_SCALE_MAX).toBe(3);
    expect(Object.keys(calibrated.actionScales).sort()).toEqual([...OFFICE_ACTION_IDS].sort());
    expect(Object.keys(calibrated.actionOffsets).sort()).toEqual([...OFFICE_ACTION_IDS].sort());
    expect(calibrated.roster.seats.every((seat) => !("actorScale" in seat))).toBe(true);

    const baseline = OFFICE_SCENE_CALIBRATION.workstations.standard;
    const resizedChair = resizeWorkstationComponent(baseline, baseline, "chair", 1.5);
    const resizedScreen = resizeWorkstationComponent(resizedChair, baseline, "screen", 0.75);

    expect(workstationComponentScaleFactor(resizedScreen, baseline, "chair")).toBeCloseTo(1.5, 12);
    expect(resizedScreen.chair.scaleX).toBeCloseTo(baseline.chair.scaleX * 1.5, 12);
    expect(resizedScreen.chair.scaleY).toBeCloseTo(baseline.chair.scaleY * 1.5, 12);
    expect(workstationComponentScaleFactor(resizedScreen, baseline, "screen")).toBeCloseTo(0.75, 12);
    expect(resizedScreen.screen).toMatchObject({
      width: baseline.screen.width * 0.75,
      height: baseline.screen.height * 0.75,
    });
    expect(baseline).toEqual(OFFICE_SCENE_CALIBRATION.workstations.standard);
  });

  it("plays walk-vertical frames and route travel at half speed", () => {
    expect(officeActionPlaybackRate("walk-vertical")).toBe(0.5);
    expect(officeActionPlaybackRate("walk-horizontal")).toBe(1);
    expect(officeActionPlaybackFrameCount("walk-vertical", 8)).toBe(16);
    expect(Array.from({ length: 16 }, (_, frame) => officeActionSourceFrameIndex("walk-vertical", frame, 8))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7,
    ]);
  });

  it("keeps walk-vertical sprite mirrors target-scoped and derives the opposite return facing", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.handoff.targetRoutes.planning = {
      targetCorridorOffset: { x: 21, y: -8 },
      interactionOffset: { x: 14, y: 9 },
      walkVerticalFlipX: true,
    };
    calibrated.handoff.targetRoutes.coder = {
      targetCorridorOffset: { x: -16, y: 12 },
      interactionOffset: { x: -20, y: 4 },
      walkVerticalFlipX: false,
    };

    expect(officeHandoffWalkVerticalFlipX(1, calibrated)).toBe(true);
    expect(officeHandoffWalkVerticalReturnFlipX(1, calibrated)).toBe(false);
    expect(officeHandoffWalkVerticalFlipX(2, calibrated)).toBe(false);
    expect(officeHandoffWalkVerticalReturnFlipX(2, calibrated)).toBe(true);
  });

  it("loads legacy handoff calibration without changing any route geometry", () => {
    const legacy = structuredClone(OFFICE_SCENE_CALIBRATION);
    legacy.handoff.targetRoutes.planning = {
      targetCorridorOffset: { x: 21, y: -8 },
      interactionOffset: { x: 14, y: 9 },
    };
    const geometryBefore = structuredClone({
      actionScales: legacy.actionScales,
      actionOffsets: legacy.actionOffsets,
      routeStageOffsets: legacy.routeStageOffsets,
      routeStagePointOffsets: legacy.routeStagePointOffsets,
      stageOffsets: legacy.handoff.stageOffsets,
      stagePointOffsets: legacy.handoff.stagePointOffsets,
      stagePathPointOffsets: legacy.handoff.stagePathPointOffsets,
      targetCorridorOffset: legacy.handoff.targetRoutes.planning.targetCorridorOffset,
      interactionOffset: legacy.handoff.targetRoutes.planning.interactionOffset,
    });

    const restored = parseOfficeSceneCalibration(JSON.stringify(legacy));

    expect(officeHandoffWalkVerticalFlipX(1, restored)).toBe(false);
    expect({
      actionScales: restored.actionScales,
      actionOffsets: restored.actionOffsets,
      routeStageOffsets: restored.routeStageOffsets,
      routeStagePointOffsets: restored.routeStagePointOffsets,
      stageOffsets: restored.handoff.stageOffsets,
      stagePointOffsets: restored.handoff.stagePointOffsets,
      stagePathPointOffsets: restored.handoff.stagePathPointOffsets,
      targetCorridorOffset: restored.handoff.targetRoutes.planning.targetCorridorOffset,
      interactionOffset: restored.handoff.targetRoutes.planning.interactionOffset,
    }).toEqual(geometryBefore);
  });

  it("uses one action world anchor in action, scene, and transition previews", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.roster.seats[1]!.origin = { x: 533, y: 388 };
    calibrated.workstations.standard.actor = { ...calibrated.workstations.standard.actor, x: 101, y: 72 };
    calibrated.workstations.standard.anchors.aisleEntry = { x: 26, y: 108 };
    calibrated.facilities.treadmill.anchors.contact = { x: 312, y: 417 };

    expect(officeActionWorldAnchor("working", 1, calibrated)).toEqual({ x: 634, y: 460 });
    expect(officeActionWorldAnchor("walk-horizontal", 1, calibrated)).toEqual({ x: 559, y: 496 });
    expect(officeActionWorldAnchor("leaving", 1, calibrated)).toEqual({ x: 559, y: 496 });
    expect(officeActionWorldAnchor("treadmill", 0, calibrated)).toEqual({ x: 312, y: 417 });
    expect(officeActionWorldAnchor("treadmill", 8, calibrated)).toEqual({ x: 312, y: 417 });
  });

  it("keeps person-container placement independent for every seat", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    const planningBase = officeSeatActorAnchor(1, calibrated);
    const coderBase = officeSeatActorAnchor(2, calibrated);
    const sharedStandbyOffset = structuredClone(calibrated.actionOffsets.standby);

    calibrated.roster.seats[1]!.actorOffset = { x: 17, y: -11 };

    expect(officeSeatActorAnchor(1, calibrated)).toEqual({
      x: planningBase.x + 17,
      y: planningBase.y - 11,
    });
    expect(officeActionWorldAnchor("standby", 1, calibrated)).toEqual(officeSeatActorAnchor(1, calibrated));
    expect(officeSeatActorAnchor(2, calibrated)).toEqual(coderBase);
    expect(calibrated.roster.seats[2]!.actorOffset).toEqual({ x: 0, y: 0 });
    expect(calibrated.actionOffsets.standby).toEqual(sharedStandbyOffset);

    const handoff = officeHandoffRoutePoints(OFFICE_MAIN_HANDOFF_SOURCE_SEAT_INDEX, 2, calibrated);
    expect(handoff.sourceSeat).toEqual(officeSeatActorAnchor(OFFICE_MAIN_HANDOFF_SOURCE_SEAT_INDEX, calibrated));
    expect(handoff.targetSeat).toEqual(officeSeatActorAnchor(2, calibrated));
  });

  it("keeps conversation positions independent from the preserved route contact", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.actionOffsets["standing-talk"] = { x: 11, y: -7 };
    calibrated.actionOffsets["walk-horizontal"] = { x: -5, y: 9 };
    calibrated.handoff.stageOffsets["source-standing-talk"] = { x: 18, y: -13 };
    calibrated.handoff.stageOffsets["walk-target-approach"] = { x: 4, y: 6 };
    calibrated.handoff.stagePointOffsets["walk-target-approach"].end = { x: -3, y: 2 };
    calibrated.handoff.stageOffsets["walk-target-depart"] = { x: -8, y: 5 };
    calibrated.handoff.stagePointOffsets["walk-target-depart"].start = { x: 7, y: -4 };
    calibrated.handoff.targetRoutes.planning = {
      targetCorridorOffset: { x: 0, y: 0 },
      interactionOffset: { x: 18, y: -13 },
      standingTalkOffset: { x: 41, y: -29 },
      seatedTalkOffset: { x: -7, y: 12 },
      saluteOffset: { x: 9, y: -4 },
    };
    const preservedRouteContact = officeHandoffLinkedWalkBasePoint("walk-target-approach", "end", 0, 1, calibrated);
    const standingTalk = officeHandoffInteractionWorldPoint(0, 1, calibrated);
    const seatedTalk = officeHandoffSeatedTalkWorldPoint(1, calibrated);
    const salute = officeHandoffSaluteWorldPoint(1, calibrated);

    calibrated.handoff.targetRoutes.planning.standingTalkOffset = { x: 66, y: -10 };

    expect(officeHandoffLinkedWalkBasePoint("walk-target-approach", "end", 0, 1, calibrated)).toEqual(preservedRouteContact);
    expect(officeHandoffInteractionWorldPoint(0, 1, calibrated)).not.toEqual(standingTalk);
    expect(officeHandoffSeatedTalkWorldPoint(1, calibrated)).toEqual(seatedTalk);
    expect(officeHandoffSaluteWorldPoint(1, calibrated)).toEqual(salute);
  });

  it("uses the same editable route points for the guide and actor travel", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.roster.seats[1]!.origin = { x: 533, y: 388 };
    calibrated.workstations.standard.anchors.aisleEntry = { x: 26, y: 108 };
    calibrated.facilities.treadmill.anchors.aisleEntry = { x: 444.2, y: 379.4 };
    calibrated.facilities.treadmill.anchors.contact = { x: 345.2, y: 379.4 };

    expect(officeFacilityRoutePoints("treadmill", 1, calibrated)).toEqual({
      start: { x: 559, y: 496 },
      waypoint: { x: 444.2, y: 379.4 },
      contact: { x: 345.2, y: 379.4 },
    });

    calibrated.facilities.treadmill.anchors.aisleEntry = { x: 470, y: 410 };
    expect(officeFacilityRoutePoints("treadmill", 1, calibrated).waypoint).toEqual({ x: 470, y: 410 });

    calibrated.facilities.coffee.anchors.aisleEntry = { x: 318, y: 242 };
    calibrated.facilities.coffee.anchors.contact = { x: 251, y: 198 };
    expect(officeFacilityRoutePoints("coffee", 1, calibrated)).toEqual({
      start: { x: 559, y: 496 },
      waypoint: { x: 318, y: 242 },
      contact: { x: 251, y: 198 },
    });

    calibrated.actionOffsets["walk-horizontal"] = { x: -12, y: 40 };
    calibrated.routeStageOffsets.treadmill["walk-out"] = { x: 3, y: -5 };
    expect(officeFacilityWalkGuidePoints("treadmill", 1, calibrated)).toEqual({
      start: { x: 550, y: 531 },
      waypoint: { x: 461, y: 445 },
      contact: { x: 336.2, y: 414.4 },
    });
  });

  it("keeps Agent names on stable Main and standard actor-local reference positions", () => {
    const standard = OFFICE_SCENE_CALIBRATION.workstations.standard;
    const main = OFFICE_SCENE_CALIBRATION.workstations.main;
    const standardLocal = officeActorLabelLocalPosition("standard", standard.label, 0.45);
    const mainLocal = officeActorLabelLocalPosition("main", main.label, 0.45);

    expect(standardLocal).toEqual({ x: 3.825, y: -137.75 });
    expect(mainLocal.x).toBeCloseTo(3.15, 12);
    expect(mainLocal.y).toBeCloseTo(-111.75, 12);

    const adjusted = structuredClone(standard);
    adjusted.label.x += 12;
    adjusted.label.y += 9;
    expect(officeActorLabelLocalPosition("standard", adjusted.label, 0.45)).toEqual({
      x: standardLocal.x + 12,
      y: standardLocal.y + 9,
    });

    const first = officeActorLabelWorldPosition("standard", { x: 200, y: 300 }, standard, 0.45);
    const moved = officeActorLabelWorldPosition("standard", { x: 450, y: 120 }, standard, 0.45);
    expect(moved.x - first.x).toBeCloseTo(250, 12);
    expect(moved.y - first.y).toBeCloseTo(-180, 12);

    const status = officeActorStatusLocalPosition(standardLocal, 104, 20);
    expect(status).toEqual({ x: standardLocal.x + 63.5, y: standardLocal.y - 10 });
    expect(status.x - (standardLocal.x + 52)).toBe(11.5);
  });

  it("migrates existing scene calibration without changing any calibrated parameter", () => {
    const legacy = structuredClone(OFFICE_SCENE_CALIBRATION) as Partial<typeof OFFICE_SCENE_CALIBRATION>;
    legacy.actionScales!.treadmill = 0.637;
    legacy.actionOffsets!.treadmill = { x: -83.5, y: 27 };
    legacy.roster!.seats[1]!.origin = { x: 533, y: 388 };
    legacy.facilities!.treadmill.origin = { x: -14, y: 401 };
    legacy.facilities!.treadmill.scale = 0.712;
    legacy.workstations!.standard.label = { ...legacy.workstations!.standard.label, x: 17, y: -93, scale: 1.14 };
    legacy.routeStageOffsets!.toilet["walk-return"] = { x: 19, y: -7 };
    legacy.transitionDirections!["walk-treadmill"].fromFlipX = false;
    const legacyRecord = legacy as unknown as {
      actionScales: Record<string, unknown>;
      actionOffsets: Record<string, unknown>;
      handoff?: unknown;
    };
    for (const actionId of ["standing-talk", "seated-talk", "salute"]) {
      delete legacyRecord.actionScales[actionId];
      delete legacyRecord.actionOffsets[actionId];
    }
    delete legacyRecord.handoff;
    for (const seat of legacy.roster!.seats) delete (seat as unknown as Record<string, unknown>).actorOffset;
    delete legacy.facilities!.coffeeCup;
    delete legacy.transitionDirections!["walk-coffee"];
    delete legacy.transitionDirections!["coffee-return-walk"];
    delete legacy.routeStageOffsets!.coffee;
    delete legacy.routeStagePointOffsets!.coffee;
    delete legacy.routeStageOffsets!.toilet["standby-end"];
    delete legacy.routeStagePointOffsets!.treadmill["walk-return"];
    delete legacy.routeStagePointOffsets!.toilet["walk-out"].waypoint;
    const restored = parseOfficeSceneCalibration(JSON.stringify(legacy));
    expect(restored.transitionDirections["walk-treadmill"]).toMatchObject({ fromFlipX: false, toFlipX: false });
    expect(restored.actionScales.treadmill).toBe(0.637);
    expect(restored.actionOffsets.treadmill).toEqual({ x: -83.5, y: 27 });
    expect(restored.roster.seats[1]!.origin).toEqual({ x: 533, y: 388 });
    expect(restored.roster.seats.every((seat) => seat.actorOffset.x === 0 && seat.actorOffset.y === 0)).toBe(true);
    expect(restored.facilities.treadmill).toMatchObject({ origin: { x: -14, y: 401 }, scale: 0.712 });
    expect(restored.workstations.standard.label).toEqual({ x: 17, y: -93, scale: 1.14, layer: "effect", visible: true });
    expect(restored.facilities.coffeeCup).toEqual(OFFICE_SCENE_CALIBRATION.facilities.coffeeCup);
    expect(restored.routeStageOffsets.toilet["walk-return"]).toEqual({ x: 19, y: -7 });
    expect(restored.routeStageOffsets.toilet["standby-end"]).toEqual({ x: 0, y: 0 });
    expect(restored.actionScales["standing-talk"]).toBe(0.45);
    expect(restored.actionOffsets["seated-talk"]).toEqual({ x: 0, y: 0 });
    expect(Object.keys(restored.routeStageOffsets.treadmill).sort()).toEqual([...OFFICE_ROUTE_STAGE_IDS].sort());
    expect(Object.keys(restored.routeStageOffsets).sort()).toEqual([...OFFICE_FACILITY_ROUTES].sort());
    expect(restored.routeStageOffsets.coffee).toEqual(OFFICE_SCENE_CALIBRATION.routeStageOffsets.coffee);
    expect(restored.routeStagePointOffsets.coffee).toEqual(OFFICE_SCENE_CALIBRATION.routeStagePointOffsets.coffee);
    expect(restored.transitionDirections["walk-coffee"]).toEqual(OFFICE_SCENE_CALIBRATION.transitionDirections["walk-coffee"]);
    expect(restored.transitionDirections["coffee-return-walk"]).toEqual(OFFICE_SCENE_CALIBRATION.transitionDirections["coffee-return-walk"]);
    expect(restored.routeStageOffsets.treadmill["walk-out"]).toEqual({ x: 0, y: 0 });
    expect(restored.routeStagePointOffsets.treadmill["leaving-return"]).toEqual({
      start: { x: 0, y: 0 },
      waypoint: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    });
    expect(restored.routeStagePointOffsets.treadmill["walk-return"]).toEqual({
      start: { x: 0, y: 0 },
      waypoint: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    });
    expect(restored.routeStagePointOffsets.toilet["walk-out"].waypoint).toEqual({ x: 0, y: 0 });
    expect(Object.keys(restored.handoff.stageOffsets).sort()).toEqual([...OFFICE_HANDOFF_STAGE_IDS].sort());
    expect(Object.keys(restored.handoff.stagePointOffsets).sort()).toEqual([...OFFICE_HANDOFF_MOVING_STAGE_IDS].sort());
    expect(restored.handoff.targetRoutes).toEqual({});
  });

  it("derives Agent handoff travel from the selected source and target workstation anchors", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.roster.seats[0]!.origin = { x: 100, y: 100 };
    calibrated.roster.seats[4]!.origin = { x: 600, y: 400 };
    calibrated.workstations.main.actor = { ...calibrated.workstations.main.actor, x: 20, y: 30 };
    calibrated.workstations.main.anchors.aisleEntry = { x: 50, y: 100 };
    calibrated.workstations.standard.actor = { ...calibrated.workstations.standard.actor, x: 80, y: 60 };
    calibrated.workstations.standard.anchors.aisleEntry = { x: 30, y: 110 };

    expect(officeHandoffRoutePoints(0, 4, calibrated)).toEqual({
      sourceSeat: { x: 120, y: 130 },
      sourceAisle: { x: 150, y: 200 },
      sourceCorridor: { x: 60, y: 200 },
      targetCorridor: { x: 60, y: 510 },
      targetAisle: { x: 630, y: 510 },
      targetSeat: { x: 680, y: 460 },
    });

    calibrated.handoff.stagePointOffsets["walk-target-row"].end = { x: 25, y: -14 };
    expect(officeHandoffRoutePoints(0, 4, calibrated).targetCorridor).toEqual({ x: 85, y: 496 });

    calibrated.handoff.stagePointOffsets["source-leaving-out"].end = { x: 12, y: -8 };
    calibrated.handoff.stagePointOffsets["walk-source-corridor"].end = { x: -20, y: 15 };
    expect(officeHandoffRoutePoints(0, 4, calibrated)).toMatchObject({
      sourceAisle: { x: 162, y: 192 },
      sourceCorridor: { x: 40, y: 207 },
    });
  });

  it("shares Main corridor points while keeping target corridor and interaction offsets independent", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.handoff.stagePointOffsets["source-leaving-out"].end = { x: 7, y: -3 };
    calibrated.handoff.stagePointOffsets["walk-source-corridor"].end = { x: -11, y: 5 };
    calibrated.handoff.targetRoutes.planning = {
      targetCorridorOffset: { x: 21, y: -8 },
      interactionOffset: { x: 14, y: 9 },
      stagePointOffsets: {
        "walk-target-approach": {
          start: { x: 1, y: 2 },
          waypoint: { x: 17, y: -6 },
          end: { x: 3, y: 4 },
        },
      },
    };
    calibrated.handoff.targetRoutes.coder = {
      targetCorridorOffset: { x: -16, y: 12 },
      interactionOffset: { x: -20, y: 4 },
      stagePointOffsets: {
        "walk-target-approach": {
          start: { x: -2, y: 5 },
          waypoint: { x: -13, y: 11 },
          end: { x: 6, y: -1 },
        },
      },
    };

    const planningRoute = officeHandoffRoutePoints(0, 1, calibrated);
    const coderRoute = officeHandoffRoutePoints(0, 2, calibrated);
    expect(planningRoute.sourceAisle).toEqual(coderRoute.sourceAisle);
    expect(planningRoute.sourceCorridor).toEqual(coderRoute.sourceCorridor);
    expect(planningRoute.targetCorridor).not.toEqual(coderRoute.targetCorridor);
    expect(officeHandoffInteractionWorldPoint(0, 1, calibrated)).not.toEqual(
      officeHandoffInteractionWorldPoint(0, 2, calibrated),
    );
    expect(officeHandoffTargetRouteCalibration(1, calibrated)).toEqual(calibrated.handoff.targetRoutes.planning);
    expect(officeHandoffTargetRouteCalibration(2, calibrated)).toEqual(calibrated.handoff.targetRoutes.coder);
    expect(officeHandoffStagePointOffsets("walk-target-approach", 1, calibrated).waypoint).toEqual({ x: 17, y: -6 });
    expect(officeHandoffStagePointOffsets("walk-target-approach", 2, calibrated).waypoint).toEqual({ x: -13, y: 11 });
    expect(officeHandoffStagePointOffsets("source-leaving-out", 1, calibrated)).toBe(
      calibrated.handoff.stagePointOffsets["source-leaving-out"],
    );
  });

  it("keeps the source-corridor stage and path independent for every target Child", () => {
    const legacy = structuredClone(OFFICE_SCENE_CALIBRATION);
    legacy.handoff.stageOffsets["walk-source-corridor"] = { x: 7, y: -3 };
    legacy.handoff.stagePathPointOffsets["walk-source-corridor"] = {
      start: { x: 1, y: 2 },
      waypoint: { x: 3, y: 4 },
      end: { x: 5, y: 6 },
    };
    legacy.handoff.targetRoutes.planning = {
      targetCorridorOffset: { x: 21, y: -8 },
      interactionOffset: { x: 14, y: 9 },
      stagePathPointOffsets: {
        "walk-source-corridor": {
          start: structuredClone(legacy.handoff.stagePointOffsets["walk-source-corridor"].start),
          waypoint: structuredClone(legacy.handoff.stagePointOffsets["walk-source-corridor"].waypoint),
          end: { x: -7, y: 3 },
        },
      },
    };
    legacy.handoff.targetRoutes.coder = {
      targetCorridorOffset: { x: -16, y: 12 },
      interactionOffset: { x: -20, y: 4 },
    };

    const restored = parseOfficeSceneCalibration(JSON.stringify(legacy));

    expect(restored.handoff.targetRoutes.planning.stageOffsets?.["walk-source-corridor"]).toBeUndefined();
    expect(restored.handoff.targetRoutes.coder.stageOffsets?.["walk-source-corridor"]).toBeUndefined();
    expect(officeHandoffStageOffset("walk-source-corridor", 1, restored)).toEqual({ x: 7, y: -3 });
    expect(officeHandoffStageOffset("walk-source-corridor", 2, restored)).toEqual({ x: 7, y: -3 });
    expect(officeHandoffStagePathPointOffsets("walk-source-corridor", 1, restored)).toEqual({
      start: { x: 1, y: 2 },
      waypoint: { x: 3, y: 4 },
      end: { x: 5, y: 6 },
    });

    restored.handoff.targetRoutes.planning.stageOffsets = {
      "walk-source-corridor": { x: 90, y: 91 },
    };
    restored.handoff.targetRoutes.planning.stagePathPointOffsets!["walk-source-corridor"]!.waypoint = { x: 92, y: 93 };

    expect(officeHandoffStageOffset("walk-source-corridor", 1, restored)).toEqual({ x: 90, y: 91 });
    expect(officeHandoffStageOffset("walk-source-corridor", 2, restored)).toEqual({ x: 7, y: -3 });
    expect(officeHandoffStagePathPointOffsets("walk-source-corridor", 1, restored).waypoint).toEqual({ x: 92, y: 93 });
    expect(officeHandoffStagePathPointOffsets("walk-source-corridor", 2, restored).waypoint).toEqual({ x: 3, y: 4 });
    expect(restored.handoff.stageOffsets["walk-source-corridor"]).toEqual({ x: 7, y: -3 });
    expect(restored.handoff.stagePathPointOffsets["walk-source-corridor"].waypoint).toEqual({ x: 3, y: 4 });
  });

  it("serializes a pre-hot-update calibration before target route defaults are added", () => {
    const staleCalibration = structuredClone(OFFICE_SCENE_CALIBRATION);
    delete (staleCalibration as unknown as { handoff: { targetRoutes?: unknown } }).handoff.targetRoutes;

    const restored = parseOfficeSceneCalibration(serializeOfficeSceneCalibration(staleCalibration));
    expect(restored.handoff.targetRoutes).toEqual({});
    expect(officeHandoffRoutePoints(0, 1, restored)).toBeDefined();
  });

  it("migrates legacy linked handoff points into independent path controls without changing old values", () => {
    const legacy = structuredClone(OFFICE_SCENE_CALIBRATION) as unknown as Record<string, unknown>;
    const handoff = legacy.handoff as Record<string, unknown>;
    const stageOffsets = handoff.stageOffsets as Record<string, { x: number; y: number }>;
    const oldStagePoints = handoff.stagePointOffsets as Record<string, Record<string, { x: number; y: number }>>;
    delete handoff.stagePathPointOffsets;
    stageOffsets["walk-target-approach"] = { x: 9, y: -4 };
    oldStagePoints["walk-target-approach"]!.waypoint = { x: 17, y: 6 };

    const restored = parseOfficeSceneCalibration(JSON.stringify(legacy));

    expect(restored.handoff.stagePointOffsets["walk-target-approach"].waypoint).toEqual({ x: 17, y: 6 });
    expect(officeHandoffStagePathPointOffsets("walk-target-approach", 1, restored)).toEqual({
      start: { x: 0, y: 0 },
      waypoint: { x: 17, y: 6 },
      end: { x: -9, y: 4 },
    });
  });

  it("round-trips the complete nine-seat scene, visibility, positions, and preview actions", () => {
    const calibrated = structuredClone(OFFICE_SCENE_CALIBRATION);
    calibrated.roster.seats[3]!.origin = { x: 712.5, y: 144 };
    calibrated.roster.seats[3]!.actorOffset = { x: 14.5, y: -6 };
    calibrated.roster.seats[3]!.visible = false;
    calibrated.roster.seats[3]!.actionId = "treadmill";
    calibrated.workstations.standard.monitor.visible = false;
    calibrated.workstations.standard.chair.layer = "actor";
    calibrated.facilities.toiletTailOccluder.scale *= 1.15;
    calibrated.routeStageOffsets.treadmill["facility-use"] = { x: 13.5, y: -8 };
    calibrated.routeStagePointOffsets.treadmill["leaving-return"].waypoint = { x: 47, y: -31 };
    calibrated.handoff.stageOffsets["source-standing-talk"] = { x: 17, y: -11 };
    calibrated.handoff.stagePointOffsets["walk-target-row"].waypoint = { x: -28, y: 36 };
    calibrated.handoff.targetRoutes.auditor = {
      targetCorridorOffset: { x: 31, y: -18 },
      interactionOffset: { x: 42, y: 7 },
    };

    const restored = parseOfficeSceneCalibration(serializeOfficeSceneCalibration(calibrated));
    expect(restored.roster.seats).toHaveLength(9);
    expect(restored.roster.seats[3]).toMatchObject({
      origin: { x: 712.5, y: 144 },
      actorOffset: { x: 14.5, y: -6 },
      visible: false,
      actionId: "treadmill",
    });
    expect(restored.workstations.standard.monitor.visible).toBe(false);
    expect(restored.workstations.standard.chair.layer).toBe("actor");
    expect(restored.facilities.toiletTailOccluder.scale).toBeCloseTo(calibrated.facilities.toiletTailOccluder.scale, 12);
    expect(restored.routeStageOffsets.treadmill["facility-use"]).toEqual({ x: 13.5, y: -8 });
    expect(restored.routeStagePointOffsets.treadmill["leaving-return"].waypoint).toEqual({ x: 47, y: -31 });
    expect(restored.handoff.stageOffsets["source-standing-talk"]).toEqual({ x: 17, y: -11 });
    expect(restored.handoff.stagePointOffsets["walk-target-row"].waypoint).toEqual({ x: -28, y: 36 });
    expect(restored.handoff.targetRoutes.auditor).toMatchObject({
      targetCorridorOffset: { x: 31, y: -18 },
      interactionOffset: { x: 42, y: 7 },
      standingTalkOffset: { x: 42, y: 7 },
      seatedTalkOffset: { x: 0, y: 0 },
      saluteOffset: { x: 0, y: 0 },
    });
    expect(restored.handoff.targetRoutes.auditor!.stagePathPointOffsets?.["walk-target-row"]).toBeUndefined();
  });
});

function relativeToWorkstation(point: { x: number; y: number }, workstation: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round((point.x - workstation.x) * 10) / 10,
    y: Math.round((point.y - workstation.y) * 10) / 10,
  };
}

function projection(childCount: number): AgentSurfaceProjection {
  const roles = ["planning-agent", "coder-agent", "auditor-agent", "rework-coder", "spec-test-proposer", "spec-test-generator", "memory-maintenance-agent", "harness-evolution-agent"];
  const surfaces: AgentSurfaceProjectionItem[] = [{
    agentSurfaceId: "main-agent", kind: "main-agent", roleId: "main-agent", roleDisplayName: "Main Agent", label: "Main Agent", description: "", skills: [], parentAgentSurfaceId: null,
    graphScopeId: "scope-1", scopeRange: "current", status: "running", readOnly: false, createdAt: "2026-07-18T00:00:00Z",
  }];
  roles.slice(0, childCount).forEach((roleId, index) => surfaces.push({
      agentSurfaceId: `agent:${roleId.split("-")[0]}`,
      kind: "agent",
      roleId,
      roleDisplayName: roleId,
      label: roleId,
      description: "",
      skills: [],
      parentAgentSurfaceId: "main-agent",
      graphScopeId: "scope-1",
      scopeRange: "current",
      status: "running",
      readOnly: false,
      createdAt: `2026-07-18T00:00:0${index + 1}Z`,
  }));
  return { conversationId: "conversation-1", graphScopeId: "scope-1", scopeStatus: "active", projectionHash: `hash-${childCount}`, surfaces };
}
