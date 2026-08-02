import type { OfficeLeisureScreenId, OfficeParticipant, OfficeParticipantState, OfficeResident, OfficeWeightedPreference } from "./officeExperience.js";

export type OfficeBehaviorEffect = "none" | "attention" | "blocked" | "failed" | "interrupted";
export type OfficeSeatedBehaviorIntent = {
  posture: "computer-use";
  screen: "work" | "game-1" | "game-2";
  effect: OfficeBehaviorEffect;
};
export type OfficeBehaviorIntent =
  | { kind: "seated"; seated: OfficeSeatedBehaviorIntent }
  | { kind: "completed-celebration"; seated: OfficeSeatedBehaviorIntent };

export type OfficeBehaviorActor = {
  actorId: string;
  stationId: string;
  state: OfficeParticipantState;
  screens: readonly OfficeWeightedPreference<OfficeLeisureScreenId>[];
};

export class OfficeBehaviorPolicy {
  resolve(actor: OfficeBehaviorActor, celebrateCompleted = false): OfficeBehaviorIntent {
    const seated: OfficeSeatedBehaviorIntent = {
      posture: "computer-use",
      screen: actor.state === "working" ? "work" : leisureScreen(actor.actorId, actor.screens),
      effect: stateEffect(actor.state),
    };
    return actor.state === "completed" && celebrateCompleted
      ? { kind: "completed-celebration", seated }
      : { kind: "seated", seated };
  }
}

export function participantBehaviorActor(participant: OfficeParticipant): OfficeBehaviorActor {
  return {
    actorId: participant.participantId,
    stationId: participant.stationId,
    state: participant.state,
    screens: participant.presentationPreferences.screens,
  };
}

export function residentBehaviorActor(resident: OfficeResident): OfficeBehaviorActor {
  return {
    actorId: resident.residentId,
    stationId: resident.stationId,
    state: "idle",
    screens: resident.presentationPreferences.screens,
  };
}

export function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return (hash >>> 0) / 0xffffffff;
}

export function leisureScreen(
  actorId: string,
  preferences: readonly OfficeWeightedPreference<OfficeLeisureScreenId>[],
): "game-1" | "game-2" {
  const candidates = [...preferences].sort((left, right) => right.weight - left.weight);
  if (candidates.length === 1 || (candidates[0]?.weight ?? 0) > (candidates[1]?.weight ?? 0)) {
    return candidates[0]!.id;
  }
  return stablePhase(actorId) < 0.5 ? "game-1" : "game-2";
}

function stateEffect(state: OfficeParticipantState): OfficeBehaviorEffect {
  return state === "attention" || state === "blocked" || state === "failed" || state === "interrupted"
    ? state
    : "none";
}
