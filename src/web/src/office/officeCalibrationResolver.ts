import { OFFICE_RUNTIME_CALIBRATION } from "./officeRuntimeCalibration.generated.js";
import {
  OFFICE_ACTION_FRAME_COUNTS,
  officeActionPlaybackRate,
  officeActorOffsetForAction,
  officeActorScaleForAction,
  officeFacilityRoutePoints,
  officeFacilityStageFlipX,
  officeFacilityStageOffset,
  officeFacilityStagePointOffsets,
  officeHandoffInteractionWorldPoint,
  officeHandoffLinkedWalkBasePoint,
  officeHandoffRoutePoints,
  officeHandoffSaluteWorldPoint,
  officeHandoffSeatedTalkWorldPoint,
  officeHandoffStageOffset,
  officeHandoffStagePathPointOffsets,
  officeHandoffWalkVerticalFlipX,
  officeHandoffWalkVerticalReturnFlipX,
  officeSeatActorAnchor,
  type OfficeActionId,
  type OfficeFacilityRoute,
  type OfficeHandoffMovingStageId,
  type OfficeMovingRouteStageId,
  type OfficePoint,
  type OfficeRouteStageId,
} from "./officeSceneCalibration.js";
import type { OfficeHandoffRoute, OfficeRouteStage, OfficeStation } from "./officeExperience.js";

export type ResolvedRouteStage = OfficeRouteStage;
export type ResolvedHandoff = OfficeHandoffRoute;

export class OfficeCalibrationResolver {
  readonly calibration = OFFICE_RUNTIME_CALIBRATION;
  private catalog: OfficeStation[] | null = null;

  stations(): OfficeStation[] {
    if (this.catalog) return this.catalog;
    const bases = this.calibration.roster.seats.map((seat, index) => {
      const workstation = this.calibration.workstations[seat.workstationKind];
      return {
        stationId: seat.slotId,
        preferredRoleId: seat.roleId,
        workstationKind: seat.workstationKind,
        index,
        origin: { ...seat.origin },
        actorOffset: { ...seat.actorOffset },
        anchors: {
          seat: officeSeatActorAnchor(index, this.calibration),
          keyboard: addPoints(seat.origin, workstation.anchors.keyboard),
          monitor: addPoints(seat.origin, workstation.anchors.monitor),
          aisleEntry: addPoints(seat.origin, workstation.anchors.aisleEntry),
        },
      };
    });
    this.catalog = bases.map((base) => ({
      ...base,
      facilityRoutes: {
        coffee: this.facilityRoute(base.stationId, "coffee"),
        treadmill: this.facilityRoute(base.stationId, "treadmill"),
        toilet: this.facilityRoute(base.stationId, "toilet"),
      },
      handoffRoutes: Object.fromEntries(bases
        .filter((target) => target.stationId !== base.stationId)
        .map((target) => [target.stationId, this.handoff(base.stationId, target.stationId)])),
    }));
    return this.catalog;
  }

  stationIndex(stationId: string): number {
    const index = this.calibration.roster.seats.findIndex((seat) => seat.slotId === stationId);
    if (index < 0) throw new Error(`Unknown Office station ${stationId}.`);
    return index;
  }

  station(stationId: string): OfficeStationGeometry {
    const index = this.stationIndex(stationId);
    const seat = this.calibration.roster.seats[index]!;
    const workstation = this.calibration.workstations[seat.workstationKind];
    return {
      index,
      origin: seat.origin,
      actorAnchor: officeSeatActorAnchor(index, this.calibration),
      workstation,
    };
  }

  action(actionId: OfficeActionId): { scale: number; offset: OfficePoint; durationMs: number } {
    return {
      scale: officeActorScaleForAction(actionId, this.calibration),
      offset: officeActorOffsetForAction(actionId, this.calibration),
      durationMs: actionDurationMs(actionId),
    };
  }

  facilityRoute(stationId: string, route: OfficeFacilityRoute): ResolvedRouteStage[] {
    const seatIndex = this.stationIndex(stationId);
    const seat = officeSeatActorAnchor(seatIndex, this.calibration);
    const base = officeFacilityRoutePoints(route, seatIndex, this.calibration);
    const stage = (id: ResolvedRouteStage["id"], actionId: OfficeActionId, points: OfficePoint[], flipX: boolean, reverse = false): ResolvedRouteStage => ({
      id,
      actionId,
      points: resolveFacilityPoints(route, id, points, seatIndex),
      durationMs: route === "coffee" && id === "facility-use" ? 25 / 24 * 1_000 : actionDurationMs(actionId),
      flipX: officeFacilityStageFlipX(route, id as OfficeRouteStageId, seatIndex, flipX, this.calibration),
      reverse,
    });
    const offChairOut = stage("off-chair-out", "off-chair", [seat], false);
    const leavingOut = stage("leaving-out", "leaving", [seat, midpoint(seat, base.start), base.start], facesRight(seat, base.start));
    const walkOut = stage("walk-out", "walk-horizontal", [base.start, base.waypoint, base.contact], facesRight(base.start, base.contact));
    const facilityUse = stage("facility-use", route === "coffee" ? "leaving" : route, [base.contact], false);
    const outbound = [offChairOut, leavingOut, walkOut, facilityUse];
    if (route === "treadmill") outbound.push(stage("facility-reverse", "treadmill", [base.contact], false, true));
    const reversedStage = (id: "walk-return" | "leaving-return", source: ResolvedRouteStage): ResolvedRouteStage => ({
      id,
      actionId: source.actionId,
      points: [...source.points].reverse(),
      durationMs: source.durationMs,
      flipX: officeFacilityStageFlipX(route, id, seatIndex, !source.flipX, this.calibration),
    });
    return [
      ...outbound,
      reversedStage("walk-return", walkOut),
      reversedStage("leaving-return", leavingOut),
      stage("off-chair-return", "off-chair", [seat], false, true),
    ];
  }

  handoff(sourceStationId: string, targetStationId: string): ResolvedHandoff {
    const sourceIndex = this.stationIndex(sourceStationId);
    const targetIndex = this.stationIndex(targetStationId);
    const points = officeHandoffRoutePoints(sourceIndex, targetIndex, this.calibration);
    const approachEnd = officeHandoffLinkedWalkBasePoint("walk-target-approach", "end", sourceIndex, targetIndex, this.calibration);
    const outboundBase: Array<{ id: OfficeHandoffMovingStageId; actionId: OfficeActionId; from: OfficePoint; to: OfficePoint; flipX: boolean }> = [
      { id: "source-leaving-out", actionId: "leaving", from: points.sourceSeat, to: points.sourceAisle, flipX: facesRight(points.sourceSeat, points.sourceAisle) },
      { id: "walk-source-corridor", actionId: "walk-horizontal", from: points.sourceAisle, to: points.sourceCorridor, flipX: facesRight(points.sourceAisle, points.sourceCorridor) },
      { id: "walk-target-row", actionId: "walk-vertical", from: points.sourceCorridor, to: points.targetCorridor, flipX: officeHandoffWalkVerticalFlipX(targetIndex, this.calibration) },
      { id: "walk-target-approach", actionId: "walk-horizontal", from: points.targetCorridor, to: approachEnd, flipX: facesRight(points.targetCorridor, approachEnd) },
    ];
    const outbound = outboundBase.map((item) => resolveHandoffStage(item, targetIndex));
    const reversedIds: OfficeHandoffMovingStageId[] = ["walk-target-depart", "walk-source-row", "walk-source-approach", "source-leaving-return"];
    const returned = [...outbound].reverse().map((item, index) => ({
      ...item,
      id: reversedIds[index]!,
      points: [...item.points].reverse(),
      flipX: item.actionId === "walk-vertical"
        ? officeHandoffWalkVerticalReturnFlipX(targetIndex, this.calibration)
        : facesRight(item.points.at(-1)!, item.points[0]!),
      reverse: false,
    }));
    const standingWorld = officeHandoffInteractionWorldPoint(sourceIndex, targetIndex, this.calibration);
    const standingOffset = this.calibration.actionOffsets["standing-talk"];
    const seatedWorld = officeHandoffSeatedTalkWorldPoint(targetIndex, this.calibration);
    const seatedOffset = this.calibration.actionOffsets["seated-talk"];
    const saluteWorld = officeHandoffSaluteWorldPoint(targetIndex, this.calibration);
    const saluteOffset = this.calibration.actionOffsets.salute;
    return {
      sourceStationId,
      targetStationId,
      outbound,
      standingTalk: subtractPoint(standingWorld, standingOffset),
      seatedTalk: subtractPoint(seatedWorld, seatedOffset),
      salute: subtractPoint(saluteWorld, saluteOffset),
      return: returned,
    };

    function resolveHandoffStage(item: typeof outboundBase[number], targetSeatIndex: number): ResolvedRouteStage {
      const stageOffset = officeHandoffStageOffset(item.id, targetSeatIndex, OFFICE_RUNTIME_CALIBRATION);
      const pointOffsets = officeHandoffStagePathPointOffsets(item.id, targetSeatIndex, OFFICE_RUNTIME_CALIBRATION);
      const via = midpoint(item.from, item.to);
      return {
        id: item.id,
        actionId: item.actionId,
        points: [
          addPoints(item.from, stageOffset, pointOffsets.start),
          addPoints(via, stageOffset, pointOffsets.waypoint),
          addPoints(item.to, stageOffset, pointOffsets.end),
        ],
        durationMs: actionDurationMs(item.actionId),
        flipX: item.flipX,
      };
    }
  }

  stationFor(stations: readonly OfficeStation[], stationId: string): OfficeStation {
    const station = stations.find((candidate) => candidate.stationId === stationId);
    if (!station) throw new Error(`Office station ${stationId} is not present.`);
    return station;
  }
}

type OfficeStationGeometry = {
  index: number;
  origin: OfficePoint;
  actorAnchor: OfficePoint;
  workstation: typeof OFFICE_RUNTIME_CALIBRATION.workstations.standard;
};

function resolveFacilityPoints(route: OfficeFacilityRoute, stageId: string, points: OfficePoint[], seatIndex: number): OfficePoint[] {
  const stageOffset = officeFacilityStageOffset(route, stageId as OfficeRouteStageId, seatIndex, OFFICE_RUNTIME_CALIBRATION);
  const pointOffsets = stageId in OFFICE_RUNTIME_CALIBRATION.routeStagePointOffsets[route]
    ? officeFacilityStagePointOffsets(route, stageId as OfficeMovingRouteStageId, seatIndex, OFFICE_RUNTIME_CALIBRATION)
    : null;
  return points.map((point, index) => addPoints(
    point,
    stageOffset,
    pointOffsets ? index === 0 ? pointOffsets.start : index === points.length - 1 ? pointOffsets.end : pointOffsets.waypoint : { x: 0, y: 0 },
  ));
}

function actionDurationMs(actionId: OfficeActionId): number {
  const fps: Record<OfficeActionId, number> = {
    working: 12, standby: 20, "coffee-drink": 12, peek: 12, "off-chair": 12,
    "walk-horizontal": 16, "walk-vertical": 12, leaving: 12, treadmill: 16,
    toilet: 24, "standing-talk": 24, "seated-talk": 24, salute: 24,
  };
  return Math.round(OFFICE_ACTION_FRAME_COUNTS[actionId] / (fps[actionId] * officeActionPlaybackRate(actionId)) * 1_000);
}

function addPoints(...points: OfficePoint[]): OfficePoint {
  return points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
}

function subtractPoint(left: OfficePoint, right: OfficePoint): OfficePoint {
  return { x: left.x - right.x, y: left.y - right.y };
}

function midpoint(left: OfficePoint, right: OfficePoint): OfficePoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function facesRight(from: OfficePoint, to: OfficePoint): boolean {
  return to.x >= from.x;
}
