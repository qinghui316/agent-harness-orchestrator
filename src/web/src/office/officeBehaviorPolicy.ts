import type { OfficeParticipant } from "./officeExperience.js";
import type { OfficeRuntimeVisualCommand } from "./officeRuntimeCalibration.js";

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
          { kind: "setScreen", stationId: participant.stationId, profile: "off" },
          { kind: "playAction", participantId: participant.participantId, actionId: "salute", loop: false, durationMs: 3_167 },
          { kind: "playAction", participantId: participant.participantId, actionId: "standby", loop: false, phase },
        ] } : staticStandby(participant, "off", "none", phase);
      case "attention": return staticStatus(participant, "attention");
      case "blocked": return staticStatus(participant, "blocked");
      case "failed": return staticStatus(participant, "failed");
      case "interrupted": return staticStatus(participant, "interrupted");
      case "queued":
      case "idle":
      default:
        return staticStandby(participant, participant.state === "queued" ? "static" : "off", "none", phase);
    }
  }

  status(participant: OfficeParticipant): OfficeRuntimeVisualCommand {
    const effect = participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted"
      ? participant.state
      : "none";
    return { kind: "setEffect", participantId: participant.participantId, effect };
  }
}

function staticStandby(
  participant: OfficeParticipant,
  screen: "off" | "static",
  effect: "none" | "attention" | "blocked" | "failed" | "interrupted",
  phase = 0,
): OfficeRuntimeVisualCommand {
  return { kind: "parallel", commands: [
    { kind: "playAction", participantId: participant.participantId, actionId: "standby", loop: false, phase },
    { kind: "setScreen", stationId: participant.stationId, profile: screen },
    { kind: "setEffect", participantId: participant.participantId, effect },
  ] };
}

function staticStatus(participant: OfficeParticipant, effect: "attention" | "blocked" | "failed" | "interrupted"): OfficeRuntimeVisualCommand {
  return staticStandby(participant, "static", effect);
}

export function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return (hash >>> 0) / 0xffffffff;
}
