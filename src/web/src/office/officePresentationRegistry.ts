import type { OfficeAmbientAction, OfficeAmbientPreference, OfficeScarfId } from "./officeExperience.js";

export type OfficeRolePresentation = {
  scarf: OfficeScarfId;
  ambientPreferences: OfficeAmbientPreference[];
  avatarId: string;
};

type OfficeRolePresentationDefinition = {
  scarf: OfficeScarfId;
  preferredAmbient: readonly OfficeAmbientAction[];
  avatarId: string;
};

const ALL_AMBIENT_ACTIONS: readonly OfficeAmbientAction[] = [
  "peek",
  "desk-coffee",
  "entertainment-1",
  "entertainment-2",
  "coffee",
  "treadmill",
  "toilet",
];

const DEFAULT_PRESENTATION: OfficeRolePresentationDefinition = {
  scarf: "default",
  preferredAmbient: [],
  avatarId: "default",
};

const PRESENTATIONS: Readonly<Record<string, OfficeRolePresentationDefinition>> = {
  "main-agent": { scarf: "main", preferredAmbient: ["peek"], avatarId: "main-agent" },
  "planning-agent": { scarf: "planning", preferredAmbient: ["peek", "coffee"], avatarId: "planning-agent" },
  "coder-agent": { scarf: "coder", preferredAmbient: ["entertainment-1", "treadmill"], avatarId: "coder-agent" },
  "auditor-agent": { scarf: "auditor", preferredAmbient: ["entertainment-2", "peek"], avatarId: "auditor-agent" },
  "rework-coder": { scarf: "rework", preferredAmbient: ["entertainment-2", "treadmill"], avatarId: "rework-coder" },
  "spec-test-proposer": { scarf: "spec-test-proposer", preferredAmbient: ["coffee", "entertainment-1"], avatarId: "spec-test-proposer" },
  "spec-test-generator": { scarf: "spec-test-generator", preferredAmbient: ["coffee", "entertainment-2"], avatarId: "spec-test-generator" },
  "memory-maintenance-agent": { scarf: "maintenance", preferredAmbient: ["coffee", "toilet", "entertainment-2"], avatarId: "memory-maintenance-agent" },
  "harness-evolution-agent": { scarf: "evolution", preferredAmbient: ["treadmill", "toilet", "entertainment-1"], avatarId: "harness-evolution-agent" },
};

export function officePresentationForRole(roleId: string): OfficeRolePresentation {
  const presentation = PRESENTATIONS[roleId] ?? DEFAULT_PRESENTATION;
  const preferred = new Set(presentation.preferredAmbient);
  return {
    scarf: presentation.scarf,
    avatarId: presentation.avatarId,
    ambientPreferences: ALL_AMBIENT_ACTIONS.map((action) => ({
      action,
      weight: preferred.has(action) ? 3 : 1,
    })),
  };
}

export function officeAvatarIdForRole(roleId: string): string {
  return PRESENTATIONS[roleId]?.avatarId ?? DEFAULT_PRESENTATION.avatarId;
}
