import type { OfficeAmbientPreference, OfficeParticipant, OfficeResident } from "./officeExperience.js";
import type { OfficeRuntimeVisualCommand } from "./officeVisualContract.js";

type StandbyScreenProfile = "entertainment-1" | "entertainment-2";

export class OfficeBehaviorPolicy {
  semantic(participant: OfficeParticipant, celebrateCompleted = false): OfficeRuntimeVisualCommand {
    const phase = stablePhase(participant.participantId);
    switch (participant.state) {
      case "working":
        return { kind: "parallel", commands: [
          { kind: "playAction", participantId: participant.participantId, actionId: "working", loop: true, phase },
          { kind: "setScreen", stationId: participant.stationId, profile: "orchestration", phase },
          { kind: "setEffect", participantId: participant.participantId, effect: "none" },
        ] };
      case "completed":
        return celebrateCompleted ? { kind: "sequence", commands: [
          { kind: "setScreen", stationId: participant.stationId, profile: standbyScreenProfile(participant.participantId, participant.ambientPreferences), phase },
          { kind: "playAction", participantId: participant.participantId, actionId: "salute", loop: false, durationMs: 3_167 },
          { kind: "playAction", participantId: participant.participantId, actionId: "standby", loop: true, phase },
        ] } : staticStandby(participant, "none", phase);
      case "attention": return staticStatus(participant, "attention");
      case "blocked": return staticStatus(participant, "blocked");
      case "failed": return staticStatus(participant, "failed");
      case "interrupted": return staticStatus(participant, "interrupted");
      case "queued":
      case "idle":
      default:
        return staticStandby(participant, "none", phase);
    }
  }

  status(participant: OfficeParticipant): OfficeRuntimeVisualCommand {
    const effect = participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted"
      ? participant.state
      : "none";
    return { kind: "setEffect", participantId: participant.participantId, effect };
  }

  resident(resident: OfficeResident): OfficeRuntimeVisualCommand {
    return { kind: "parallel", commands: [
      { kind: "playAction", participantId: resident.residentId, actionId: "standby", loop: true, phase: stablePhase(resident.residentId) },
      { kind: "setScreen", stationId: resident.stationId, profile: standbyScreenProfile(resident.residentId, resident.ambientPreferences), phase: stablePhase(resident.residentId) },
      { kind: "setEffect", participantId: resident.residentId, effect: "none" },
    ] };
  }
}

function staticStandby(
  participant: OfficeParticipant,
  effect: "none" | "attention" | "blocked" | "failed" | "interrupted",
  phase = 0,
): OfficeRuntimeVisualCommand {
  return { kind: "parallel", commands: [
    { kind: "playAction", participantId: participant.participantId, actionId: "standby", loop: true, phase },
    { kind: "setScreen", stationId: participant.stationId, profile: standbyScreenProfile(participant.participantId, participant.ambientPreferences), phase },
    { kind: "setEffect", participantId: participant.participantId, effect },
  ] };
}

function staticStatus(participant: OfficeParticipant, effect: "attention" | "blocked" | "failed" | "interrupted"): OfficeRuntimeVisualCommand {
  return staticStandby(participant, effect, stablePhase(participant.participantId));
}

export function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return (hash >>> 0) / 0xffffffff;
}

export function standbyScreenProfile(id: string, preferences: readonly OfficeAmbientPreference[]): StandbyScreenProfile {
  const candidates = preferences
    .filter((preference): preference is OfficeAmbientPreference & { action: StandbyScreenProfile } => (
      preference.action === "entertainment-1" || preference.action === "entertainment-2"
    ))
    .sort((left, right) => right.weight - left.weight);
  if (candidates.length === 1 || (candidates[0]?.weight ?? 0) > (candidates[1]?.weight ?? 0)) return candidates[0]!.action;
  return stablePhase(id) < 0.5 ? "entertainment-1" : "entertainment-2";
}
