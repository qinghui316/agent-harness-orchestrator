export type OfficePoint = { x: number; y: number };
export type OfficeLayerId = "shadow" | "desk" | "screen" | "actor" | "chair" | "effect";

export const OFFICE_ACTION_IDS = [
  "working",
  "standby",
  "coffee-drink",
  "peek",
  "off-chair",
  "walk-horizontal",
  "walk-vertical",
  "leaving",
  "treadmill",
  "toilet",
  "standing-talk",
  "seated-talk",
  "salute",
] as const;

export type OfficeActionId = (typeof OFFICE_ACTION_IDS)[number];

export const OFFICE_ACTION_FRAME_COUNTS: Record<OfficeActionId, number> = {
  working: 68,
  standby: 62,
  "coffee-drink": 79,
  peek: 48,
  "off-chair": 34,
  "walk-horizontal": 49,
  "walk-vertical": 8,
  leaving: 21,
  treadmill: 45,
  toilet: 121,
  "standing-talk": 76,
  "seated-talk": 86,
  salute: 76,
};

export type OfficeFacilityRoute = "coffee" | "treadmill" | "toilet";
export type OfficeRouteStageId =
  | "standby-start" | "off-chair-out" | "leaving-out" | "walk-out" | "facility-use"
  | "facility-reverse" | "walk-return" | "leaving-return" | "off-chair-return" | "standby-end";
export type OfficeMovingRouteStageId = "leaving-out" | "walk-out" | "walk-return" | "leaving-return";
export type OfficeHandoffMovingStageId =
  | "source-leaving-out" | "walk-source-corridor" | "walk-target-row" | "walk-target-approach"
  | "walk-target-depart" | "walk-source-row" | "walk-source-approach" | "source-leaving-return";

export function officeActionPlaybackRate(actionId: string): number {
  return actionId === "walk-vertical" ? 0.5 : 1;
}

export const OFFICE_SCREEN_ANIMATION_SPEED = 0.35;

export type OfficeRuntimeVisualCommand =
  | { kind: "playAction"; participantId: string; actionId: OfficeActionId; loop?: boolean; reverse?: boolean; flipX?: boolean; phase?: number; durationMs?: number }
  | { kind: "playRouteStage"; participantId: string; routeId: string; actionId: OfficeActionId; points: OfficePoint[]; durationMs: number; loop?: boolean; reverse?: boolean; flipX?: boolean }
  | { kind: "followRoute"; participantId: string; routeId: string; points: OfficePoint[]; durationMs: number; flipX?: boolean }
  | { kind: "setScreen"; stationId: string; profile: "off" | "static" | "orchestration" | "entertainment-1" | "entertainment-2"; phase?: number }
  | { kind: "setEffect"; participantId: string; effect: "none" | "attention" | "blocked" | "failed" | "interrupted" | "coffee-cup"; durationMs?: number }
  | { kind: "showParticipant"; participantId: string }
  | { kind: "hideParticipant"; participantId: string }
  | { kind: "sequence"; commands: OfficeRuntimeVisualCommand[] }
  | { kind: "parallel"; commands: OfficeRuntimeVisualCommand[] };
